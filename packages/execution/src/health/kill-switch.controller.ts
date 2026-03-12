import type {
  EmergencyCommand,
  EpochMs,
  ExecutionVenue,
  KillSwitchReason,
  KillSwitchState,
  LiveTradingLockout,
  OperationalControlState,
  SymbolCode,
  WatchdogStatus
} from '@hashi-bot/core';

import type { ExecutionIncidentRecord } from '../incidents/incident-model.js';
import type { HealthEvaluationResult } from './health-evaluation.service.js';

export interface KillSwitchControllerInput {
  nowTs: EpochMs;
  venue: ExecutionVenue;
  watchdog: WatchdogStatus;
  healthEvaluation: Pick<HealthEvaluationResult, 'healthStatus' | 'recommendedAction' | 'unsafeToContinue' | 'reasons'>;
  incidents: ExecutionIncidentRecord[];
  emergencyCommands?: EmergencyCommand[];
}

export interface KillSwitchTransition {
  fromState: OperationalControlState;
  toState: OperationalControlState;
  reason: string;
  atTs: EpochMs;
}

export interface KillSwitchControllerDecision {
  controlState: OperationalControlState;
  killSwitchState: KillSwitchState;
  killSwitchReason?: KillSwitchReason;
  lockout: LiveTradingLockout;
  transition?: KillSwitchTransition;
  reasons: string[];
}

function hasSevereStaleWatchdog(watchdog: WatchdogStatus): { trigger: boolean; reason?: KillSwitchReason } {
  if (watchdog.feed.stale && (watchdog.feed.ageMs ?? 0) >= watchdog.feed.thresholdMs * 2) {
    return { trigger: true, reason: 'watchdog_feed_stale' };
  }

  if (watchdog.sync.stale && (watchdog.sync.ageMs ?? 0) >= watchdog.sync.thresholdMs * 2) {
    return { trigger: true, reason: 'watchdog_sync_stale' };
  }

  return { trigger: false };
}

function deriveIncidentPressure(incidents: ExecutionIncidentRecord[]): 'none' | 'degraded' | 'critical' {
  if (incidents.some((incident) => incident.severity === 'critical')) {
    return 'critical';
  }

  if (incidents.some((incident) => incident.severity === 'error' || incident.severity === 'warning')) {
    return 'degraded';
  }

  return 'none';
}

export class OperationalKillSwitchController {
  private previousState: OperationalControlState = 'normal';

  public evaluate(input: KillSwitchControllerInput): KillSwitchControllerDecision {
    const reasons: string[] = [];
    const blockedSymbols = new Set<SymbolCode>();

    const severeStale = hasSevereStaleWatchdog(input.watchdog);
    const repeatedExecutionFailures = input.watchdog.executionFailures.breached;
    const repeatedRejectedOrders = input.watchdog.rejectedOrders.breached;
    const repeatedReconciliationMismatch = input.watchdog.reconciliation.persistent;

    const incidentPressure = deriveIncidentPressure(input.incidents);

    const emergencyCommands = input.emergencyCommands ?? [];
    const disableLive = emergencyCommands.some((command) => command.command === 'disable_live_mode');
    const pauseVenue = emergencyCommands.some((command) => command.command === 'pause_venue');
    const pauseSymbols = emergencyCommands.filter((command) => command.command === 'pause_symbol' && command.symbolCode);

    for (const command of pauseSymbols) {
      if (command.symbolCode) {
        blockedSymbols.add(command.symbolCode);
      }
    }

    let killSwitchState: KillSwitchState = 'inactive';
    let killSwitchReason: KillSwitchReason | undefined;
    let controlState: OperationalControlState = 'normal';

    if (disableLive) {
      killSwitchState = 'active';
      killSwitchReason = 'manual_operator_trigger';
      controlState = 'kill_switched';
      reasons.push('operator:disable_live_mode');
    } else if (severeStale.trigger) {
      killSwitchState = 'active';
      killSwitchReason = severeStale.reason;
      controlState = 'kill_switched';
      reasons.push(`watchdog:severe_stale:${severeStale.reason}`);
    } else if (repeatedExecutionFailures) {
      killSwitchState = 'active';
      killSwitchReason = 'consecutive_execution_failures';
      controlState = 'kill_switched';
      reasons.push('watchdog:execution_failures_breached');
    } else if (repeatedReconciliationMismatch) {
      killSwitchState = 'active';
      killSwitchReason = 'reconciliation_drift';
      controlState = 'kill_switched';
      reasons.push('watchdog:reconciliation_drift_persistent');
    } else if (repeatedRejectedOrders) {
      killSwitchState = 'active';
      killSwitchReason = 'repeated_order_rejections';
      controlState = 'kill_switched';
      reasons.push('watchdog:rejected_orders_breached');
    } else if (pauseVenue || input.healthEvaluation.healthStatus === 'paused') {
      controlState = 'paused';
      reasons.push(pauseVenue ? 'operator:pause_venue' : 'health:paused');
    } else if (
      input.healthEvaluation.recommendedAction === 'manual_review_required'
      || input.watchdog.overallStatus === 'unknown'
    ) {
      controlState = 'locked_pending_review';
      reasons.push('safety:manual_review_or_unknown_watchdog');
    } else if (
      input.healthEvaluation.healthStatus === 'degraded'
      || incidentPressure === 'degraded'
      || input.healthEvaluation.recommendedAction === 'observe'
    ) {
      controlState = 'degraded';
      reasons.push('health:degraded');
    }

    if (incidentPressure === 'critical' && controlState === 'normal') {
      controlState = 'locked_pending_review';
      reasons.push('incidents:critical_present');
    }

    if (input.healthEvaluation.unsafeToContinue && controlState === 'normal') {
      controlState = 'locked_pending_review';
      reasons.push('health:unsafe_to_continue');
    }

    const lockout: LiveTradingLockout = {
      blockNewOrderPlacement: controlState !== 'normal' && controlState !== 'degraded',
      blockSymbolTrading: [...blockedSymbols],
      blockVenueTrading: controlState === 'paused' || controlState === 'kill_switched' || pauseVenue,
      blockLiveMode: controlState === 'kill_switched' || disableLive,
      reasons: reasons.length > 0 ? reasons : ['none']
    };

    if (controlState === 'kill_switched') {
      lockout.blockNewOrderPlacement = true;
      lockout.blockVenueTrading = true;
      lockout.blockLiveMode = true;
    }

    const transition: KillSwitchTransition | undefined = this.previousState === controlState
      ? undefined
      : {
        fromState: this.previousState,
        toState: controlState,
        reason: reasons[0] ?? 'state_changed',
        atTs: input.nowTs
      };

    this.previousState = controlState;

    return {
      controlState,
      killSwitchState,
      killSwitchReason,
      lockout,
      transition,
      reasons
    };
  }
}
