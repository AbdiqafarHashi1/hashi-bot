import type { BotMode, EmergencyCommand, IsoTimestamp, RecoverySnapshot } from '@hashi-bot/core';
import {
  CcxtExecutionAdapter,
  CtraderExecutionAdapter,
  EmergencyWorkflowService,
  HealthEvaluationService,
  KillSwitchController,
  MockExecutionAdapter,
  WatchdogService,
  type EmergencyWorkflowOutcome,
  type ExecutionAdapterPort,
  type OperationalWatchdogInput,
  type OperationalGuardDecision
} from '@hashi-bot/execution';
import {
  EmergencyWorkflowViewService,
  OperationalControlViewService,
  OperationalHealthSummaryService
} from '@hashi-bot/telemetry';
import type { OperationalStateRepository } from '@hashi-bot/storage';

export interface OperationalSafetyEvaluationInput {
  mode: BotMode;
  observedAt: IsoTimestamp;
  watchdog: OperationalWatchdogInput;
  recovery: RecoverySnapshot;
  activeCommands?: EmergencyCommand[];
  operatorEmergencyStop?: boolean;
}

export interface OperationalSafetyEvaluationResult {
  guard: OperationalGuardDecision;
  summaryView: ReturnType<OperationalHealthSummaryService['toView']>;
  controlView: ReturnType<OperationalControlViewService['toView']>;
}

export interface EmergencyExecutionResult {
  outcome: EmergencyWorkflowOutcome;
  controlView: ReturnType<OperationalControlViewService['toView']>;
  emergencyView: ReturnType<EmergencyWorkflowViewService['toView']>;
}

function createAdapterForVenue(venue: 'mock' | 'ccxt' | 'ctrader'): ExecutionAdapterPort {
  if (venue === 'ccxt') {
    return new CcxtExecutionAdapter();
  }

  if (venue === 'ctrader') {
    return new CtraderExecutionAdapter();
  }

  return new MockExecutionAdapter();
}

export class OperationalSafetyService {
  private readonly watchdogService = new WatchdogService();
  private readonly healthEvaluationService = new HealthEvaluationService();
  private readonly killSwitchController = new KillSwitchController();
  private readonly healthSummaryService = new OperationalHealthSummaryService();
  private readonly controlViewService = new OperationalControlViewService();
  private readonly emergencyViewService = new EmergencyWorkflowViewService();

  private readonly emergencyWorkflowService: EmergencyWorkflowService;

  constructor(venue: 'mock' | 'ccxt' | 'ctrader' = 'mock', private readonly operationalStateRepository?: OperationalStateRepository) {
    this.emergencyWorkflowService = new EmergencyWorkflowService({
      adapter: createAdapterForVenue(venue),
      now: () => new Date()
    });
  }

  evaluate(input: OperationalSafetyEvaluationInput): OperationalSafetyEvaluationResult {
    const watchdogReport = this.watchdogService.evaluate(input.watchdog);
    const health = this.healthEvaluationService.evaluate(watchdogReport);
    const guard = this.killSwitchController.evaluate({
      observedAt: input.observedAt,
      watchdog: watchdogReport,
      health,
      activeCommands: input.activeCommands,
      operatorEmergencyStop: input.operatorEmergencyStop
    });

    const summary = this.healthEvaluationService.toOperationalSummary({
      mode: input.mode,
      observedAt: input.observedAt,
      watchdog: watchdogReport,
      recovery: input.recovery,
      killSwitch: guard.killSwitch
    });

    return {
      guard,
      summaryView: this.healthSummaryService.toView({ summary, evaluation: health }),
      controlView: this.controlViewService.toView(guard)
    };
  }

  async executeEmergencyCommand(command: EmergencyCommand, guard?: OperationalGuardDecision): Promise<EmergencyExecutionResult> {
    const outcome = await this.emergencyWorkflowService.execute({ command, guard });


    if (this.operationalStateRepository) {
      await this.operationalStateRepository.appendEmergencyAction({
        recordedAt: outcome.result.processedAt,
        result: outcome.result
      });

      if (outcome.result.status !== 'completed') {
        await this.operationalStateRepository.appendIncident({
          observedAt: outcome.result.processedAt,
          severity: 'critical',
          source: 'emergency',
          message: outcome.result.errors?.join(',') ?? `${outcome.result.type}_failed`
        });
      }
    }

    const mergedGuard = guard == null
      ? undefined
      : {
          ...guard,
          lockoutPolicy: {
            ...guard.lockoutPolicy,
            blockNewOrderPlacement:
              guard.lockoutPolicy.blockNewOrderPlacement || (outcome.nextGuardPatch?.forceBlockNewOrderPlacement ?? false),
            blockLiveMode: guard.lockoutPolicy.blockLiveMode || (outcome.nextGuardPatch?.forceBlockLiveMode ?? false)
          },
          reasons: [...guard.reasons, ...outcome.incidentNotes]
        };

    return {
      outcome,
      controlView: this.controlViewService.toView(
        mergedGuard
        ?? {
          state: 'paused',
          safetyState: 'paused',
          killSwitch: { state: 'inactive' },
          liveLockout: {
            isLockedOut: true,
            state: 'paused',
            reason: 'manual_pause',
            lockedAt: command.issuedAt,
            unlockRequiresManualReview: false
          },
          lockoutPolicy: {
            blockNewOrderPlacement: outcome.nextGuardPatch?.forceBlockNewOrderPlacement ?? true,
            blockLiveMode: outcome.nextGuardPatch?.forceBlockLiveMode ?? false,
            blockedSymbols: command.symbol ? [command.symbol] : [],
            blockedVenues: command.venue ? [command.venue] : []
          },
          reasons: outcome.incidentNotes
        }
      ),
      emergencyView: this.emergencyViewService.toView(outcome, mergedGuard)
    };
  }
}
