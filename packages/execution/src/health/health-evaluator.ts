import type {
  HealthStatus,
  IncidentSeverity,
  KillSwitchStatus,
  OperationalStatusSummary,
  RecoverySnapshot,
  SafetyState
} from '@hashi-bot/core';

import type { EvaluatedWatchdogReport } from '../watchdogs/types.js';

export type DegradationState = 'healthy' | 'degraded' | 'stale' | 'unsafe';
export type HealthRecommendedAction = 'continue' | 'degrade_and_monitor' | 'pause_new_entries' | 'safe_sync_only' | 'manual_intervention_required';

export interface HealthEvaluationResult {
  healthStatus: HealthStatus;
  degradationState: DegradationState;
  safetyState: SafetyState;
  recommendedAction: HealthRecommendedAction;
  incidentSeverity: IncidentSeverity;
  reasons: string[];
}

export class HealthEvaluationService {
  evaluate(watchdog: EvaluatedWatchdogReport): HealthEvaluationResult {
    const breachSignals = watchdog.signals.filter((signal) => signal.state === 'breach');
    const warningSignals = watchdog.signals.filter((signal) => signal.state === 'warning');
    const staleCodes = new Set(['feed_stale', 'sync_stale', 'heartbeat_stale']);
    const staleBreaches = breachSignals.filter((signal) => staleCodes.has(signal.code));

    if (breachSignals.length > 0) {
      const staleUnsafe = staleBreaches.length > 0;
      return {
        healthStatus: 'unhealthy',
        degradationState: staleUnsafe ? 'stale' : 'unsafe',
        safetyState: staleUnsafe ? 'recovery_required' : 'locked',
        recommendedAction: staleUnsafe ? 'safe_sync_only' : 'manual_intervention_required',
        incidentSeverity: 'critical',
        reasons: breachSignals.map((signal) => `${signal.code}:${signal.observedValue ?? 'n/a'}`)
      };
    }

    if (warningSignals.length > 0) {
      return {
        healthStatus: 'degraded',
        degradationState: 'degraded',
        safetyState: 'degraded',
        recommendedAction: 'degrade_and_monitor',
        incidentSeverity: 'warning',
        reasons: warningSignals.map((signal) => `${signal.code}:${signal.observedValue ?? 'n/a'}`)
      };
    }

    return {
      healthStatus: 'healthy',
      degradationState: 'healthy',
      safetyState: 'healthy',
      recommendedAction: 'continue',
      incidentSeverity: 'info',
      reasons: []
    };
  }

  toOperationalSummary(args: {
    mode: OperationalStatusSummary['mode'];
    observedAt: OperationalStatusSummary['observedAt'];
    watchdog: EvaluatedWatchdogReport;
    recovery: RecoverySnapshot;
    killSwitch?: KillSwitchStatus;
  }): OperationalStatusSummary {
    const evaluation = this.evaluate(args.watchdog);

    return {
      observedAt: args.observedAt,
      mode: args.mode,
      safetyState: evaluation.safetyState,
      healthStatus: evaluation.healthStatus,
      incidentSeverity: evaluation.incidentSeverity,
      watchdog: args.watchdog.status,
      killSwitch: args.killSwitch ?? { state: 'inactive' },
      recovery: args.recovery
    };
  }
}
