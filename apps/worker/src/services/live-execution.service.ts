import type { EpochMs, ProfileCode, SymbolCode } from '@hashi-bot/core';
import type { DatasetRepository } from '@hashi-bot/data';
import { evaluateRiskDecision, type PortfolioState } from '@hashi-bot/risk';
import {
  classifyExecutionIncidents,
  publishExecutionIncidents,
  reconcileExecutionState,
  resolveVenueSymbol,
  type ExecutionAdapter,
  type ExecutionIncidentRecord,
  type ReconciliationResult,
  type SyncSnapshot,
  type VenueOrder,
  type VenuePosition
} from '@hashi-bot/execution';
import type { TelemetryIncidentSink } from '@hashi-bot/telemetry';

import type { EvaluationService } from './evaluation-service.js';

export interface LiveExecutionCycleInput {
  accountRef: string;
  profileCode: ProfileCode;
  watchlistSymbolCodes?: SymbolCode[];
  rankingLimit?: number;
  staleAfterMs?: number;
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
}

export class LiveExecutionService {
  private localExpectedOrders: VenueOrder[] = [];
  private localExpectedPositions: VenuePosition[] = [];

  public constructor(
    private readonly evaluationService: EvaluationService,
    private readonly datasetRepository: DatasetRepository,
    private readonly executionAdapter: ExecutionAdapter,
    private readonly incidentSink: TelemetryIncidentSink
  ) {}

  public async runCycle(input: LiveExecutionCycleInput): Promise<LiveExecutionCycleResult> {
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

    const reconciliation = reconcileExecutionState({
      venueSnapshot: syncSnapshot,
      local: {
        accountRef: input.accountRef,
        openOrders: this.localExpectedOrders,
        openPositions: this.localExpectedPositions,
        recentResults
      },
      staleAfterMs: input.staleAfterMs,
      nowTs: Date.now() as EpochMs
    });

    const incidents = classifyExecutionIncidents({
      reconciliation,
      nowTs: Date.now() as EpochMs
    });

    await publishExecutionIncidents(this.incidentSink, incidents);

    return {
      evaluatedSymbols: batch.evaluatedSymbols,
      signalsEvaluated: batch.strategyBatch.rankedSignals.length,
      ordersPlaced,
      ordersSkipped,
      ordersFailed,
      syncSnapshot,
      reconciliation,
      incidents
    };
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
