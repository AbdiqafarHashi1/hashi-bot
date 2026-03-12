import type {
  EpochMs,
  HealthRecommendedAction,
  HealthStatus,
  IncidentSeverity,
  KillSwitchState,
  LiveLockoutState,
  OperationalStatusSummary,
  RecoveryState,
  SafetyState,
  WatchdogStatus
} from '@hashi-bot/core';

export interface HealthEvaluationInput {
  nowTs: EpochMs;
  watchdog: WatchdogStatus;
  openIncidentCount: number;
  criticalIncidentCount: number;
  highestIncidentSeverity?: IncidentSeverity;
  killSwitchState?: KillSwitchState;
  recoveryState?: RecoveryState;
  liveLockout?: LiveLockoutState;
}

export interface HealthEvaluationResult {
  healthStatus: HealthStatus;
  degradationState: SafetyState;
  recommendedAction: HealthRecommendedAction;
  reasons: string[];
  unsafeToContinue: boolean;
}

function severityRank(severity?: IncidentSeverity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'error':
      return 3;
    case 'warning':
      return 2;
    case 'info':
      return 1;
    default:
      return 0;
  }
}

export class OperationalHealthEvaluationService {
  public evaluate(input: HealthEvaluationInput): HealthEvaluationResult {
    const reasons: string[] = [];

    const killSwitch = input.killSwitchState ?? 'inactive';
    const recovery = input.recoveryState ?? 'idle';
    const lockout = input.liveLockout ?? 'unlocked';

    if (killSwitch === 'active' || killSwitch === 'reset_required') {
      reasons.push(`kill_switch:${killSwitch}`);
      return {
        healthStatus: 'kill_switched',
        degradationState: 'kill_switched',
        recommendedAction: 'lock_engine',
        reasons,
        unsafeToContinue: true
      };
    }

    if (lockout !== 'unlocked') {
      reasons.push(`live_lockout:${lockout}`);
      return {
        healthStatus: 'locked',
        degradationState: 'locked',
        recommendedAction: 'manual_review_required',
        reasons,
        unsafeToContinue: true
      };
    }

    if (recovery === 'required' || recovery === 'blocked' || recovery === 'failed') {
      reasons.push(`recovery_state:${recovery}`);
      return {
        healthStatus: 'recovery_required',
        degradationState: 'recovery_required',
        recommendedAction: 'safe_sync_only',
        reasons,
        unsafeToContinue: true
      };
    }

    if (input.watchdog.overallStatus === 'critical') {
      reasons.push('watchdog:critical');
      return {
        healthStatus: 'paused',
        degradationState: 'paused',
        recommendedAction: 'pause_trading',
        reasons,
        unsafeToContinue: true
      };
    }

    const incidentSeverity = severityRank(input.highestIncidentSeverity);

    if (
      input.watchdog.overallStatus === 'warning'
      || input.criticalIncidentCount > 0
      || incidentSeverity >= 3
    ) {
      reasons.push('degraded:watchdog_or_incident_pressure');
      return {
        healthStatus: 'degraded',
        degradationState: 'degraded',
        recommendedAction: 'observe',
        reasons,
        unsafeToContinue: false
      };
    }

    if (input.openIncidentCount > 0) {
      reasons.push('degraded:open_incidents');
      return {
        healthStatus: 'degraded',
        degradationState: 'degraded',
        recommendedAction: 'observe',
        reasons,
        unsafeToContinue: false
      };
    }

    return {
      healthStatus: 'healthy',
      degradationState: 'healthy',
      recommendedAction: 'continue',
      reasons,
      unsafeToContinue: false
    };
  }

  public buildSummary(
    input: Omit<HealthEvaluationInput, 'nowTs'> & { nowTs: EpochMs }
  ): OperationalStatusSummary {
    const evaluation = this.evaluate(input);

    return {
      safetyState: evaluation.degradationState,
      healthStatus: evaluation.healthStatus,
      recommendedAction: evaluation.recommendedAction,
      watchdog: input.watchdog,
      killSwitch: {
        state: input.killSwitchState ?? 'inactive'
      },
      recoveryState: input.recoveryState ?? 'idle',
      liveLockout: input.liveLockout ?? 'unlocked',
      openIncidentCount: input.openIncidentCount,
      highestIncidentSeverity: input.highestIncidentSeverity,
      reasons: evaluation.reasons,
      lastUpdatedTs: input.nowTs
    };
  }
}
