import type { EmergencyCommand, EpochMs, IncidentSeverity, OperationalStatusSummary, ProfileCode, SymbolCode } from '@hashi-bot/core';
import type { DatasetRepository } from '@hashi-bot/data';
import { evaluateRiskDecision, type PortfolioState } from '@hashi-bot/risk';
import {
  classifyExecutionIncidents,
  EmergencyOperationsService,
  ExecutionWatchdogService,
  OperationalHealthEvaluationService,
  OperationalKillSwitchController,
  publishEmergencyCommandResults,
  publishExecutionIncidents,
  reconcileExecutionState,
  resolveVenueSymbol,
  type ExecutionAdapter,
  type ExecutionIncidentRecord,
  type HealthEvaluationResult,
  type EmergencyCommandExecutionResult,
  type KillSwitchControllerDecision,
  type ReconciliationResult,
  type SyncSnapshot,
  type VenueOrder,
  type VenuePosition,
  type WatchdogEvaluationInput
} from '@hashi-bot/execution';
import type { TelemetryEmergencyCommandSink, TelemetryIncidentSink } from '@hashi-bot/telemetry';

import type { EvaluationService } from './evaluation-service.js';

export interface LiveExecutionCycleInput {
  accountRef: string;
  profileCode: ProfileCode;
  watchlistSymbolCodes?: SymbolCode[];
  rankingLimit?: number;
  staleAfterMs?: number;
  emergencyCommands?: EmergencyCommand[];
}

export interface LiveExecutionCycleResult {
  evaluatedSymbols: SymbolCode[];
  signalsEvaluated: number;
  ordersPlaced: number;
  ordersSkipped: number;
  ordersFailed: number;
  syncSnapshot: SyncSnapshot;
  reconciliation: ReconciliationResult;
  incidents: ExecutionIncidentRecord[];
  watchdog: ReturnType<ExecutionWatchdogService['evaluate']>;
  healthEvaluation: HealthEvaluationResult;
  controlDecision: KillSwitchControllerDecision;
  operationalSummary: OperationalStatusSummary;
  emergencyCommandResults: EmergencyCommandExecutionResult[];
}

export class LiveExecutionService {
  private localExpectedOrders: VenueOrder[] = [];
  private localExpectedPositions: VenuePosition[] = [];
  private consecutiveExecutionErrors = 0;
  private rejectedOrderStreak = 0;
  private reconciliationMismatchStreak = 0;
  private lastReconciliationMismatchTs?: EpochMs;
  private lastLoopHeartbeatTs?: EpochMs;
  private lastFeedTs?: EpochMs;
  private lastSyncTs?: EpochMs;

  private readonly watchdogService = new ExecutionWatchdogService();
  private readonly healthEvaluationService = new OperationalHealthEvaluationService();
  private readonly killSwitchController = new OperationalKillSwitchController();
  private readonly emergencyOperationsService: EmergencyOperationsService;

  public constructor(
    private readonly evaluationService: EvaluationService,
    private readonly datasetRepository: DatasetRepository,
    private readonly executionAdapter: ExecutionAdapter,
    private readonly incidentSink: TelemetryIncidentSink,
    private readonly emergencyCommandSink?: TelemetryEmergencyCommandSink
  ) {
    this.emergencyOperationsService = new EmergencyOperationsService(this.executionAdapter);
  }

  public async runCycle(input: LiveExecutionCycleInput): Promise<LiveExecutionCycleResult> {
    const cycleStartedAtTs = Date.now() as EpochMs;

    const preTradeWatchdog = this.watchdogService.evaluate({
      nowTs: cycleStartedAtTs,
      lastFeedTs: this.lastFeedTs,
      lastSyncTs: this.lastSyncTs,
      lastHeartbeatTs: this.lastLoopHeartbeatTs,
      consecutiveExecutionErrors: this.consecutiveExecutionErrors,
      rejectedOrderStreak: this.rejectedOrderStreak,
      reconciliationMismatchStreak: this.reconciliationMismatchStreak,
      lastReconciliationMismatchTs: this.lastReconciliationMismatchTs
    });

    const preTradeHealth = this.healthEvaluationService.evaluate({
      nowTs: cycleStartedAtTs,
      watchdog: preTradeWatchdog,
      openIncidentCount: 0,
      criticalIncidentCount: 0,
      recoveryState: 'idle',
      liveLockout: 'unlocked',
      killSwitchState: 'inactive'
    });

    const preTradeControl = this.killSwitchController.evaluate({
      nowTs: cycleStartedAtTs,
      venue: this.executionAdapter.venue,
      watchdog: preTradeWatchdog,
      healthEvaluation: preTradeHealth,
      incidents: [],
      emergencyCommands: input.emergencyCommands
    });

    const emergencyReport = await this.emergencyOperationsService.execute({
      accountRef: input.accountRef,
      commands: input.emergencyCommands ?? [],
      nowTs: cycleStartedAtTs
    });

    if (emergencyReport.incidents.length > 0) {
      await publishExecutionIncidents(this.incidentSink, emergencyReport.incidents);
    }

    if (this.emergencyCommandSink && emergencyReport.results.length > 0) {
      await publishEmergencyCommandResults(this.emergencyCommandSink, emergencyReport.results);
    }

    const batch = this.evaluationService.evaluateBatch({
      watchlistSymbolCodes: input.watchlistSymbolCodes,
      rankingLimit: input.rankingLimit
    });

    const accountSnapshot = await this.executionAdapter.getAccountSnapshot(input.accountRef);
    const openOrders = await this.executionAdapter.getOpenOrders(input.accountRef);
    const openPositions = await this.executionAdapter.getOpenPositions(input.accountRef);

    this.localExpectedOrders = openOrders;
    this.localExpectedPositions = openPositions;

    const portfolioState = this.buildPortfolioState(accountSnapshot, openPositions);

    let ordersPlaced = 0;
    let ordersSkipped = 0;
    let ordersFailed = 0;
    const recentResults = [] as Awaited<ReturnType<ExecutionAdapter['placeOrder']>>[];

    for (const ranked of batch.strategyBatch.rankedSignals) {
      if (
        preTradeControl.lockout.blockLiveMode
        || preTradeControl.lockout.blockVenueTrading
        || preTradeControl.lockout.blockNewOrderPlacement
      ) {
        ordersSkipped += 1;
        continue;
      }

      if (preTradeControl.lockout.blockSymbolTrading.includes(ranked.symbolCode)) {
        ordersSkipped += 1;
        continue;
      }

      const symbolSpec = this.datasetRepository.getSymbol(ranked.symbolCode);
      if (!symbolSpec) {
        ordersSkipped += 1;
        continue;
      }

      const risk = evaluateRiskDecision({
        profileCode: input.profileCode,
        signal: ranked.signal,
        symbolSpec,
        portfolioState,
        governanceContext: {
          currentTs: Date.now(),
          baselineEquity: accountSnapshot.equity ?? accountSnapshot.balance ?? 0,
          currentDrawdownPct: 0,
          correlatedExposurePct: 0
        },
        minNotional: 0,
        slippageBps: 5,
        feeBps: 4
      });

      if (risk.status !== 'allowed' || !risk.positionPlan) {
        ordersSkipped += 1;
        continue;
      }

      const hasActiveExposure = openPositions.some((position) => position.symbolCode === ranked.symbolCode)
        || openOrders.some((order) => order.symbolCode === ranked.symbolCode);

      if (hasActiveExposure) {
        ordersSkipped += 1;
        continue;
      }

      const quantity = risk.positionPlan.qty ?? 0;
      if (quantity <= 0) {
        ordersSkipped += 1;
        continue;
      }

      const result = await this.executionAdapter.placeOrder({
        venue: this.executionAdapter.venue,
        accountRef: input.accountRef,
        symbolCode: ranked.symbolCode,
        venueSymbol: resolveVenueSymbol(ranked.symbolCode, this.executionAdapter.venue, this.symbolMap()),
        side: ranked.signal.side === 'long' ? 'buy' : 'sell',
        orderType: 'limit',
        quantity,
        quantityLots: risk.positionPlan.lots,
        price: risk.positionPlan.entry,
        stopLossPrice: risk.positionPlan.stop,
        takeProfitPrice: risk.positionPlan.tp1,
        submittedAtTs: Date.now() as EpochMs
      });

      recentResults.push(result);

      if (result.accepted && result.order) {
        ordersPlaced += 1;
        this.localExpectedOrders.push(result.order);
      } else {
        ordersFailed += 1;
      }
    }

    const syncSnapshot = await this.executionAdapter.sync(input.accountRef, {
      symbolCodes: input.watchlistSymbolCodes
    });

    const cycleCompletedAtTs = Date.now() as EpochMs;

    this.lastFeedTs = syncSnapshot.fetchedAtTs;
    this.lastSyncTs = syncSnapshot.fetchedAtTs;

    const reconciliation = reconcileExecutionState({
      venueSnapshot: syncSnapshot,
      local: {
        accountRef: input.accountRef,
        openOrders: this.localExpectedOrders,
        openPositions: this.localExpectedPositions,
        recentResults
      },
      staleAfterMs: input.staleAfterMs,
      nowTs: cycleCompletedAtTs
    });

    const reconciliationIncidents = classifyExecutionIncidents({
      reconciliation,
      nowTs: cycleCompletedAtTs
    });

    const incidents = [...emergencyReport.incidents, ...reconciliationIncidents];

    await publishExecutionIncidents(this.incidentSink, reconciliationIncidents);

    this.updateFailureCounters({ recentResults, reconciliation });

    const watchdogInput: WatchdogEvaluationInput = {
      nowTs: cycleCompletedAtTs,
      lastFeedTs: this.lastFeedTs,
      lastSyncTs: this.lastSyncTs,
      lastHeartbeatTs: this.lastLoopHeartbeatTs ?? cycleStartedAtTs,
      consecutiveExecutionErrors: this.consecutiveExecutionErrors,
      rejectedOrderStreak: this.rejectedOrderStreak,
      reconciliationMismatchStreak: this.reconciliationMismatchStreak,
      lastReconciliationMismatchTs: this.lastReconciliationMismatchTs
    };

    const watchdog = this.watchdogService.evaluate(watchdogInput);
    this.lastLoopHeartbeatTs = cycleCompletedAtTs;

    const highestIncidentSeverity = this.deriveHighestIncidentSeverity(incidents);

    const healthEvaluation = this.healthEvaluationService.evaluate({
      nowTs: cycleCompletedAtTs,
      watchdog,
      openIncidentCount: incidents.length,
      criticalIncidentCount: incidents.filter((incident) => incident.severity === 'critical').length,
      highestIncidentSeverity,
      recoveryState: 'idle',
      liveLockout: 'unlocked',
      killSwitchState: 'inactive'
    });

    const controlDecision = this.killSwitchController.evaluate({
      nowTs: cycleCompletedAtTs,
      venue: this.executionAdapter.venue,
      watchdog,
      healthEvaluation,
      incidents,
      emergencyCommands: input.emergencyCommands
    });

    const operationalSummary = this.healthEvaluationService.buildSummary({
      nowTs: cycleCompletedAtTs,
      watchdog,
      openIncidentCount: incidents.length,
      criticalIncidentCount: incidents.filter((incident) => incident.severity === 'critical').length,
      highestIncidentSeverity,
      recoveryState: controlDecision.controlState === 'locked_pending_review' ? 'required' : 'idle',
      liveLockout: controlDecision.controlState === 'kill_switched'
        ? 'kill_switch_lockout'
        : controlDecision.controlState === 'locked_pending_review'
          ? 'safety_lockout'
          : 'unlocked',
      killSwitchState: controlDecision.killSwitchState
    });

    operationalSummary.controlState = controlDecision.controlState;
    operationalSummary.lockout = controlDecision.lockout;
    operationalSummary.reasons = [...(operationalSummary.reasons ?? []), ...controlDecision.reasons];
    operationalSummary.killSwitch.reason = controlDecision.killSwitchReason;

    return {
      evaluatedSymbols: batch.evaluatedSymbols,
      signalsEvaluated: batch.strategyBatch.rankedSignals.length,
      ordersPlaced,
      ordersSkipped,
      ordersFailed,
      syncSnapshot,
      reconciliation,
      incidents,
      watchdog,
      healthEvaluation,
      controlDecision,
      operationalSummary,
      emergencyCommandResults: emergencyReport.results
    };
  }

  private deriveHighestIncidentSeverity(incidents: ExecutionIncidentRecord[]): IncidentSeverity | undefined {
    if (incidents.some((incident) => incident.severity === 'critical')) {
      return 'critical';
    }

    if (incidents.some((incident) => incident.severity === 'error')) {
      return 'error';
    }

    if (incidents.some((incident) => incident.severity === 'warning')) {
      return 'warning';
    }

    if (incidents.some((incident) => incident.severity === 'info')) {
      return 'info';
    }

    return undefined;
  }

  private updateFailureCounters(input: {
    recentResults: Awaited<ReturnType<ExecutionAdapter['placeOrder']>>[];
    reconciliation: ReconciliationResult;
  }): void {
    const rejectedInCycle = input.recentResults.filter((result) => result.accepted === false || result.status === 'rejected').length;
    const acceptedInCycle = input.recentResults.some((result) => result.accepted === true);

    if (rejectedInCycle > 0) {
      this.consecutiveExecutionErrors += rejectedInCycle;
      this.rejectedOrderStreak += rejectedInCycle;
    } else if (acceptedInCycle) {
      this.consecutiveExecutionErrors = 0;
      this.rejectedOrderStreak = 0;
    }

    const hasMismatch = input.reconciliation.entries.some((entry) => entry.code !== 'in_sync');
    if (hasMismatch) {
      this.reconciliationMismatchStreak += 1;
      this.lastReconciliationMismatchTs = input.reconciliation.reconciledAtTs;
    } else {
      this.reconciliationMismatchStreak = 0;
      this.lastReconciliationMismatchTs = undefined;
    }
  }

  private symbolMap() {
    const entries = this.datasetRepository.listSymbols().map((spec) => ({
      symbolCode: spec.symbolCode,
      defaultVenueSymbol: spec.marketType === 'forex'
        ? `${spec.baseCurrency}${spec.quoteCurrency}`
        : `${spec.baseCurrency}/${spec.quoteCurrency}`,
      venues: {
        ccxt: `${spec.baseCurrency}/${spec.quoteCurrency}`,
        ctrader: `${spec.baseCurrency}${spec.quoteCurrency}`
      }
    }));

    return new Map(entries.map((entry) => [entry.symbolCode, entry]));
  }

  private buildPortfolioState(account: SyncSnapshot['account'], positions: VenuePosition[]): PortfolioState {
    return {
      asOfTs: Date.now(),
      equity: account.equity ?? account.balance ?? 0,
      balance: account.balance ?? account.equity ?? 0,
      unrealizedPnl: account.unrealizedPnl ?? 0,
      realizedPnl: account.realizedPnl ?? 0,
      openPositions: positions.length,
      portfolioHeatPct: 0,
      dailyPnl: 0,
      dailyTrades: 0,
      consecutiveLosses: 0,
      perSymbolExposure: positions.map((position) => ({
        symbolCode: position.symbolCode,
        openRiskPct: 0,
        openNotional: position.entryPrice * position.quantity,
        openPositions: 1
      }))
    };
  }
}
