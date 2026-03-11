import type { IsoTimestamp, RecoverySnapshot } from '@hashi-bot/core';
import type { StartupRecoveryDecision } from '@hashi-bot/execution';

import { createWorkerContainer, type WorkerContainer } from './lib/container.js';

export interface WorkerBootstrapOptions {
  workerMode: 'evaluation' | 'backtest' | 'replay' | 'live';
  executionVenue?: 'mock' | 'ccxt' | 'ctrader';
  env: Record<string, string | undefined>;
}

export interface WorkerBootstrapResult {
  container: WorkerContainer;
  recoveryDecision: StartupRecoveryDecision;
  recoverySnapshot: RecoverySnapshot;
}

function fallbackSnapshot(observedAt: IsoTimestamp, reason: string): RecoverySnapshot {
  return {
    state: 'failed',
    decision: 'remain_locked',
    reason,
    evaluatedAt: observedAt,
    duplicateOrderRiskDetected: true
  };
}

export async function bootstrapWorker(options: WorkerBootstrapOptions): Promise<WorkerBootstrapResult> {
  const container = createWorkerContainer({ executionVenue: options.executionVenue });
  const observedAt = new Date().toISOString() as IsoTimestamp;

  const safetyRails = container.operatorSafetyRailsService.evaluate({
    workerMode: options.workerMode,
    executionVenue: options.executionVenue ?? 'mock',
    env: options.env,
    observedAt
  });

  for (const warning of safetyRails.warnings) {
    await container.operationalStateRepository.appendIncident({
      observedAt,
      severity: 'warning',
      source: 'safety_rail',
      message: warning
    });
  }

  let recoveryDecision: StartupRecoveryDecision = 'resume_ok';
  let recoveryReason = 'not_evaluated';
  let duplicateOrderRiskDetected = false;
  let reconciliationDriftRatio = 0;
  let recoveryNotes: string[] = [];
  let recoverySnapshot: RecoverySnapshot = {
    state: 'not_required',
    decision: 'resume_automatically',
    reason: 'bootstrap_default_non_live',
    evaluatedAt: observedAt,
    duplicateOrderRiskDetected: false
  };

  if (!safetyRails.allowed && options.workerMode === 'live') {
    recoveryDecision = 'lock_live_mode';
    recoveryReason = 'operator_safety_rails_blocked_live_mode';
    recoveryNotes = safetyRails.blockingReasons;
    recoverySnapshot = fallbackSnapshot(observedAt, recoveryReason);
    duplicateOrderRiskDetected = true;
    reconciliationDriftRatio = 1;

    for (const reason of safetyRails.blockingReasons) {
      await container.operationalStateRepository.appendIncident({
        observedAt,
        severity: 'critical',
        source: 'safety_rail',
        message: reason
      });
    }
  } else {
    const recovery = await container.startupRecoveryService.run({
      mode: options.workerMode === 'live' ? 'live' : 'paper'
    });

    recoveryDecision = recovery.outcome.decision;
    recoveryReason = recovery.summary.reason;
    duplicateOrderRiskDetected = recovery.summary.duplicateOrderRiskDetected;
    reconciliationDriftRatio = recovery.summary.reconciliationDriftRatio;
    recoveryNotes = recovery.summary.notes;
    recoverySnapshot = recovery.outcome.recovery;

    if (recoveryDecision !== 'resume_ok') {
      await container.operationalStateRepository.appendIncident({
        observedAt,
        severity: recoveryDecision === 'lock_live_mode' ? 'critical' : 'warning',
        source: 'recovery',
        message: `${recoveryDecision}:${recoveryReason}`
      });
    }
  }

  await container.operationalStateRepository.saveState({
    observedAt,
    mode: options.workerMode === 'live' ? 'live' : 'paper',
    venue: options.executionVenue ?? 'mock',
    safetyState: recoveryDecision === 'resume_ok' ? 'healthy' : recoveryDecision === 'sync_only_no_trading' ? 'paused' : 'locked',
    healthStatus: recoveryDecision === 'resume_ok' ? 'healthy' : 'degraded',
    incidentSeverity: recoveryDecision === 'resume_ok' ? 'info' : 'warning',
    lockout: {
      blockNewOrderPlacement: recoveryDecision !== 'resume_ok',
      blockLiveMode: recoveryDecision === 'lock_live_mode' || recoveryDecision === 'manual_review_required',
      blockedSymbols: [],
      blockedVenues: recoveryDecision === 'resume_ok' ? [] : [options.executionVenue ?? 'mock']
    },
    recovery: recoverySnapshot,
    recoveryNotes
  });

  console.log(
    JSON.stringify({
      scope: 'worker:bootstrap',
      event: 'startup_recovery_evaluated',
      workerMode: options.workerMode,
      safetyRailsAllowed: safetyRails.allowed,
      safetyRailBlocks: safetyRails.blockingReasons,
      safetyRailWarnings: safetyRails.warnings,
      decision: recoveryDecision,
      reason: recoveryReason,
      duplicateOrderRiskDetected,
      reconciliationDriftRatio,
      notes: recoveryNotes
    })
  );

  console.log('[worker] bootstrap complete (operational services + startup recovery initialized)');
  return { container, recoveryDecision, recoverySnapshot };
}
