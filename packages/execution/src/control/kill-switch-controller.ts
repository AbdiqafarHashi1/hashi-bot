import type {
  EmergencyCommand,
  ExecutionVenue,
  KillSwitchReason,
  KillSwitchStatus,
  LiveLockoutState,
  SafetyState,
  SymbolCode
} from '@hashi-bot/core';

import type { HealthEvaluationResult } from '../health/health-evaluator.js';
import type { EvaluatedWatchdogReport, WatchdogSignalStatus } from '../watchdogs/types.js';

export type OperationalControlState = 'normal' | 'degraded' | 'paused' | 'kill_switched' | 'locked_pending_review';

export interface LockoutPolicy {
  blockNewOrderPlacement: boolean;
  blockLiveMode: boolean;
  blockedSymbols: SymbolCode[];
  blockedVenues: ExecutionVenue[];
}

export interface OperationalGuardDecision {
  state: OperationalControlState;
  safetyState: SafetyState;
  killSwitch: KillSwitchStatus;
  liveLockout: LiveLockoutState;
  lockoutPolicy: LockoutPolicy;
  reasons: string[];
}

export interface KillSwitchControllerInput {
  observedAt: LiveLockoutState['lockedAt'];
  watchdog: EvaluatedWatchdogReport;
  health: HealthEvaluationResult;
  activeCommands?: EmergencyCommand[];
  operatorEmergencyStop?: boolean;
  prior?: OperationalGuardDecision;
}

const STALE_CODES = new Set<WatchdogSignalStatus['code']>(['feed_stale', 'sync_stale']);

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export class KillSwitchController {
  evaluate(input: KillSwitchControllerInput): OperationalGuardDecision {
    const commands = input.activeCommands ?? [];
    const breachSignals = input.watchdog.signals.filter((signal) => signal.state === 'breach');
    const warningSignals = input.watchdog.signals.filter((signal) => signal.state === 'warning');
    const unknownStaleSignals = input.watchdog.signals.filter((signal) => STALE_CODES.has(signal.code) && signal.state === 'unknown');

    const severeStaleFeedOrSync = breachSignals.some((signal) => STALE_CODES.has(signal.code));
    const repeatedExecutionFailures = breachSignals.some((signal) => signal.code === 'consecutive_failures');
    const repeatedReconciliationMismatch = breachSignals.some((signal) => signal.code === 'reconciliation_drift');
    const repeatedRejectedOrders = breachSignals.some((signal) => signal.code === 'repeated_rejections');
    const explicitDisableLive = commands.some((command) => command.type === 'disable_live_mode');
    const explicitPause = commands.some((command) => command.type === 'cancel_all_orders' || command.type === 'flatten_positions');

    const pausedSymbols = unique(
      commands
        .filter((command) => command.type === 'pause_symbol' && command.symbol !== undefined)
        .map((command) => command.symbol as SymbolCode)
    );

    const pausedVenues = unique(
      commands
        .filter((command) => command.type === 'pause_venue' && command.venue !== undefined)
        .map((command) => command.venue as ExecutionVenue)
    );

    const killTriggered =
      input.operatorEmergencyStop === true
      || explicitDisableLive
      || severeStaleFeedOrSync
      || repeatedExecutionFailures
      || repeatedReconciliationMismatch
      || repeatedRejectedOrders;

    const shouldPause = explicitPause || unknownStaleSignals.length > 0;

    if (killTriggered) {
      const reason = this.resolveKillSwitchReason({
        severeStaleFeedOrSync,
        repeatedExecutionFailures,
        repeatedReconciliationMismatch,
        repeatedRejectedOrders,
        explicitDisableLive,
        operatorEmergencyStop: input.operatorEmergencyStop === true
      });

      return {
        state: repeatedReconciliationMismatch || input.health.recommendedAction === 'manual_intervention_required'
          ? 'locked_pending_review'
          : 'kill_switched',
        safetyState: 'kill_switched',
        killSwitch: {
          state: 'engaged',
          reason,
          engagedAt: input.observedAt,
          engagedBy: input.operatorEmergencyStop ? 'operator' : 'controller'
        },
        liveLockout: {
          isLockedOut: true,
          state: 'kill_switched',
          reason,
          lockedAt: input.observedAt,
          unlockRequiresManualReview: true
        },
        lockoutPolicy: {
          blockNewOrderPlacement: true,
          blockLiveMode: true,
          blockedSymbols: pausedSymbols,
          blockedVenues: pausedVenues
        },
        reasons: this.describeReasons(breachSignals, commands, ['kill_switch_triggered'])
      };
    }

    if (shouldPause) {
      return {
        state: 'paused',
        safetyState: 'paused',
        killSwitch: { state: 'inactive' },
        liveLockout: {
          isLockedOut: true,
          state: 'paused',
          reason: 'manual_pause',
          lockedAt: input.observedAt,
          unlockRequiresManualReview: false
        },
        lockoutPolicy: {
          blockNewOrderPlacement: true,
          blockLiveMode: false,
          blockedSymbols: pausedSymbols,
          blockedVenues: pausedVenues
        },
        reasons: this.describeReasons([], commands, ['pause_command_or_ambiguous_staleness'])
      };
    }

    if (warningSignals.length > 0 || pausedSymbols.length > 0 || pausedVenues.length > 0) {
      return {
        state: 'degraded',
        safetyState: 'degraded',
        killSwitch: { state: 'inactive' },
        liveLockout: {
          isLockedOut: pausedSymbols.length > 0 || pausedVenues.length > 0,
          state: 'paused',
          reason: 'manual_pause',
          lockedAt: input.observedAt,
          unlockRequiresManualReview: false
        },
        lockoutPolicy: {
          blockNewOrderPlacement: false,
          blockLiveMode: false,
          blockedSymbols: pausedSymbols,
          blockedVenues: pausedVenues
        },
        reasons: this.describeReasons(warningSignals, commands, ['degraded_watchdog'])
      };
    }

    return {
      state: 'normal',
      safetyState: 'healthy',
      killSwitch: { state: 'inactive' },
      liveLockout: {
        isLockedOut: false,
        state: 'paused',
        reason: 'mode_boundary',
        lockedAt: input.observedAt,
        unlockRequiresManualReview: false
      },
      lockoutPolicy: {
        blockNewOrderPlacement: false,
        blockLiveMode: false,
        blockedSymbols: [],
        blockedVenues: []
      },
      reasons: ['healthy_operational_state']
    };
  }

  private resolveKillSwitchReason(args: {
    severeStaleFeedOrSync: boolean;
    repeatedExecutionFailures: boolean;
    repeatedReconciliationMismatch: boolean;
    repeatedRejectedOrders: boolean;
    explicitDisableLive: boolean;
    operatorEmergencyStop: boolean;
  }): KillSwitchReason {
    if (args.operatorEmergencyStop || args.explicitDisableLive) {
      return 'manual_operator_action';
    }

    if (args.severeStaleFeedOrSync) {
      return 'watchdog_feed_stale';
    }

    if (args.repeatedExecutionFailures) {
      return 'watchdog_consecutive_failures';
    }

    if (args.repeatedReconciliationMismatch) {
      return 'watchdog_reconciliation_drift';
    }

    if (args.repeatedRejectedOrders) {
      return 'watchdog_repeated_rejections';
    }

    return 'unknown';
  }

  private describeReasons(
    signals: WatchdogSignalStatus[],
    commands: EmergencyCommand[],
    defaults: string[]
  ): string[] {
    const signalReasons = signals.map((signal) => `${signal.code}:${signal.state}:${signal.observedValue ?? 'n/a'}`);
    const commandReasons = commands.map((command) => `command:${command.type}`);
    const combined = [...signalReasons, ...commandReasons, ...defaults];
    return combined.length > 0 ? combined : defaults;
  }
}
