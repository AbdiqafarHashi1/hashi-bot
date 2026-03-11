import type { EmergencyCommand, EpochMs, IsoTimestamp, RecoverySnapshot } from '@hashi-bot/core';
import type { StartupRecoveryDecision } from '@hashi-bot/execution';

import type { WorkerContainer } from '../lib/container.js';

export interface LiveLoopOptions {
  recoveryDecision: StartupRecoveryDecision;
  recoverySnapshot: RecoverySnapshot;
  cycleMs?: number;
  maxCycles?: number;
  emergencyCommand?: EmergencyCommand;
  operatorEmergencyStop?: boolean;
  executionVenue: 'mock' | 'ccxt' | 'ctrader';
}

function toEpochMs(value: number): EpochMs {
  return value as EpochMs;
}

function toIsoTimestamp(value: Date): IsoTimestamp {
  return value.toISOString() as IsoTimestamp;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runLiveLoop(container: WorkerContainer, options: LiveLoopOptions): Promise<void> {
  const cycleMs = options.cycleMs ?? 2_000;
  const maxCycles = options.maxCycles ?? 3;

  if (options.recoveryDecision === 'lock_live_mode') {
    console.error('[worker:live] startup recovery locked live mode; trading is disabled pending manual intervention');
    return;
  }

  if (options.recoveryDecision === 'manual_review_required') {
    console.error('[worker:live] startup recovery requires manual review; live order placement remains blocked');
    return;
  }

  const forceSyncOnly = options.recoveryDecision === 'sync_only_no_trading';
  if (forceSyncOnly) {
    console.warn('[worker:live] startup recovery is sync_only_no_trading; safety loop will run with order placement blocked');
  }

  let lastFeedUpdateMs = toEpochMs(Date.now());
  let lastSyncMs = toEpochMs(Date.now());
  let lastHeartbeatMs = toEpochMs(Date.now());
  let consecutiveExecutionFailures = 0;
  let repeatedRejectedOrders = 0;
  let driftPersistenceCycles = 0;
  let emergencyHandled = false;

  console.log('[worker:live] entering guarded live loop');

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    const now = new Date();
    const observedAt = toIsoTimestamp(now);
    lastHeartbeatMs = toEpochMs(now.getTime());

    try {
      const venue = await container.liveVenueSyncService.syncNow(now);
      lastSyncMs = toEpochMs(now.getTime());
      if (venue.syncHealthy) {
        lastFeedUpdateMs = toEpochMs(now.getTime());
      } else {
        consecutiveExecutionFailures += 1;
      }

      const hasDriftExposure = venue.openOrderIds.length > 0 && options.recoverySnapshot.duplicateOrderRiskDetected;
      driftPersistenceCycles = hasDriftExposure ? driftPersistenceCycles + 1 : 0;
    } catch (error) {
      consecutiveExecutionFailures += 1;
      console.error('[worker:live] venue sync failure', error);
    }

    if (consecutiveExecutionFailures > 0) {
      repeatedRejectedOrders = Math.min(10, repeatedRejectedOrders + 1);
    }

    const safety = container.operationalSafetyService.evaluate({
      mode: 'live',
      observedAt,
      recovery: options.recoverySnapshot,
      watchdog: {
        evaluatedAt: observedAt,
        nowMs: toEpochMs(now.getTime()),
        lastFeedUpdateMs,
        lastSyncMs,
        lastHeartbeatMs,
        consecutiveExecutionFailures,
        repeatedRejectedOrders,
        reconciliationDriftRatio: driftPersistenceCycles > 0 ? 0.02 : 0,
        driftPersistenceCycles
      },
      operatorEmergencyStop: options.operatorEmergencyStop
    });

    const blockedBySafety = safety.guard.lockoutPolicy.blockNewOrderPlacement || safety.guard.lockoutPolicy.blockLiveMode;
    const blocked = forceSyncOnly || blockedBySafety;

    await container.operationalStateRepository.saveState({
      observedAt,
      mode: 'live',
      venue: options.executionVenue,
      safetyState: blocked ? 'paused' : safety.guard.safetyState,
      healthStatus: safety.summaryView.healthStatus,
      incidentSeverity: safety.summaryView.incidentSeverity,
      lockout: {
        blockNewOrderPlacement: blocked,
        blockLiveMode: forceSyncOnly ? false : safety.guard.lockoutPolicy.blockLiveMode,
        blockedSymbols: safety.guard.lockoutPolicy.blockedSymbols,
        blockedVenues: safety.guard.lockoutPolicy.blockedVenues
      },
      recovery: options.recoverySnapshot,
      recoveryNotes: forceSyncOnly ? [...safety.guard.reasons, 'sync_only_no_trading'] : safety.guard.reasons
    });

    if (safety.summaryView.healthStatus !== 'healthy') {
      await container.operationalStateRepository.appendIncident({
        observedAt,
        severity: safety.summaryView.incidentSeverity,
        source: 'watchdog',
        message: `${safety.controlView.state}:${safety.summaryView.recommendedAction}`
      });
    }

    if (options.emergencyCommand && !emergencyHandled) {
      emergencyHandled = true;
      const emergency = await container.operationalSafetyService.executeEmergencyCommand(options.emergencyCommand, safety.guard);
      console.warn(
        JSON.stringify({
          scope: 'worker:live',
          event: 'emergency_command_executed',
          commandId: emergency.outcome.result.commandId,
          type: emergency.outcome.result.type,
          status: emergency.outcome.result.status,
          reasons: emergency.controlView.reasons
        })
      );
    }

    console.log(
      JSON.stringify({
        scope: 'worker:live',
        event: 'live_safety_cycle',
        cycle,
        modeState: forceSyncOnly ? 'sync_only_no_trading' : safety.controlView.state,
        blocked,
        blockedBySafety,
        blockedByRecovery: forceSyncOnly,
        healthStatus: safety.summaryView.healthStatus,
        incidentSeverity: safety.summaryView.incidentSeverity,
        recommendedAction: safety.summaryView.recommendedAction,
        reasons: safety.controlView.reasons
      })
    );

    if (blocked) {
      console.warn('[worker:live] lockout active; strategy/risk evaluation may run but new order placement is blocked');
    } else {
      console.log('[worker:live] guarded state healthy/degraded without lockout; live order placement gate is open');
    }

    if (cycle < maxCycles) {
      await wait(cycleMs);
    }
  }

  console.log('[worker:live] guarded live loop completed configured cycles');
}
