import type { BotMode, IsoTimestamp, RecoveryDecision, RecoverySnapshot, RecoveryState } from '@hashi-bot/core';

export type StartupRecoveryDecision = 'resume_ok' | 'sync_only_no_trading' | 'manual_review_required' | 'lock_live_mode';

export interface PersistedLiveState {
  runId?: string;
  lastSyncedAt?: IsoTimestamp;
  openOrderIds: string[];
  openPositionIds: string[];
  pendingIntentKeys: string[];
  localBalance?: number;
  updatedAt: IsoTimestamp;
}

export interface VenueLiveState {
  fetchedAt: IsoTimestamp;
  openOrderIds: string[];
  openPositionIds: string[];
  accountBalance?: number;
  syncHealthy: boolean;
  source: 'mock' | 'ccxt' | 'ctrader';
}

export interface StartupRecoveryInput {
  mode: BotMode;
  persisted?: PersistedLiveState;
  venue: VenueLiveState;
}

export interface StartupRecoveryOutcome {
  decision: StartupRecoveryDecision;
  recovery: RecoverySnapshot;
  notes: string[];
  reconciliationDriftRatio: number;
}

function toRecoveryDecision(decision: StartupRecoveryDecision): RecoveryDecision {
  switch (decision) {
    case 'resume_ok':
      return 'resume_automatically';
    case 'sync_only_no_trading':
      return 'force_safe_sync_only';
    case 'manual_review_required':
      return 'require_manual_review';
    case 'lock_live_mode':
      return 'remain_locked';
  }
}

function toRecoveryState(decision: StartupRecoveryDecision): RecoveryState {
  switch (decision) {
    case 'resume_ok':
      return 'recovered';
    case 'sync_only_no_trading':
      return 'syncing';
    case 'manual_review_required':
      return 'awaiting_manual_review';
    case 'lock_live_mode':
      return 'failed';
  }
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return numerator > 0 ? 1 : 0;
  }

  return numerator / denominator;
}

export class StartupRecoveryService {
  evaluate(input: StartupRecoveryInput): StartupRecoveryOutcome {
    if (input.mode !== 'live') {
      const recovery: RecoverySnapshot = {
        state: 'not_required',
        decision: 'resume_automatically',
        reason: 'recovery_not_required_for_non_live_mode',
        evaluatedAt: input.venue.fetchedAt,
        duplicateOrderRiskDetected: false
      };

      return {
        decision: 'resume_ok',
        recovery,
        notes: ['non_live_mode_recovery_not_required'],
        reconciliationDriftRatio: 0
      };
    }

    const notes: string[] = [];

    if (!input.venue.syncHealthy) {
      const recovery: RecoverySnapshot = {
        state: 'failed',
        decision: 'remain_locked',
        reason: 'venue_sync_unhealthy_on_startup',
        evaluatedAt: input.venue.fetchedAt,
        duplicateOrderRiskDetected: true
      };

      return {
        decision: 'lock_live_mode',
        recovery,
        notes: ['venue_sync_unhealthy', 'lock_live_mode'],
        reconciliationDriftRatio: 1
      };
    }

    if (input.persisted == null) {
      const hasOpenExposure = input.venue.openOrderIds.length > 0 || input.venue.openPositionIds.length > 0;
      const decision: StartupRecoveryDecision = hasOpenExposure ? 'manual_review_required' : 'sync_only_no_trading';
      const reason = hasOpenExposure
        ? 'no_local_state_with_live_exposure_detected'
        : 'no_local_state_safe_sync_required';

      const recovery: RecoverySnapshot = {
        state: toRecoveryState(decision),
        decision: toRecoveryDecision(decision),
        reason,
        evaluatedAt: input.venue.fetchedAt,
        duplicateOrderRiskDetected: hasOpenExposure
      };

      notes.push('persisted_state_missing');
      if (hasOpenExposure) {
        notes.push('venue_has_open_exposure');
      }

      return {
        decision,
        recovery,
        notes,
        reconciliationDriftRatio: hasOpenExposure ? 1 : 0
      };
    }

    const venueOrderSet = new Set(input.venue.openOrderIds);
    const venuePositionSet = new Set(input.venue.openPositionIds);
    const localOrderSet = new Set(input.persisted.openOrderIds);
    const localPositionSet = new Set(input.persisted.openPositionIds);

    const missingOrders = Array.from(localOrderSet).filter((id) => !venueOrderSet.has(id));
    const unexpectedOrders = Array.from(venueOrderSet).filter((id) => !localOrderSet.has(id));
    const missingPositions = Array.from(localPositionSet).filter((id) => !venuePositionSet.has(id));
    const unexpectedPositions = Array.from(venuePositionSet).filter((id) => !localPositionSet.has(id));

    const mismatches = missingOrders.length + unexpectedOrders.length + missingPositions.length + unexpectedPositions.length;
    const totalCompared = localOrderSet.size + venueOrderSet.size + localPositionSet.size + venuePositionSet.size;
    const drift = ratio(mismatches, totalCompared);
    const duplicateOrderRiskDetected = input.persisted.pendingIntentKeys.length > 0 || unexpectedOrders.length > 0;

    if (duplicateOrderRiskDetected) {
      notes.push('duplicate_order_risk_detected');
    }

    if (drift >= 0.35) {
      const decision: StartupRecoveryDecision = 'lock_live_mode';
      const recovery: RecoverySnapshot = {
        state: toRecoveryState(decision),
        decision: toRecoveryDecision(decision),
        reason: 'severe_reconciliation_drift_on_startup',
        evaluatedAt: input.venue.fetchedAt,
        duplicateOrderRiskDetected: true
      };

      return {
        decision,
        recovery,
        notes: [...notes, 'severe_reconciliation_drift', 'lock_live_mode'],
        reconciliationDriftRatio: drift
      };
    }

    if (drift > 0 || duplicateOrderRiskDetected) {
      const decision: StartupRecoveryDecision = drift >= 0.15 ? 'manual_review_required' : 'sync_only_no_trading';
      const recovery: RecoverySnapshot = {
        state: toRecoveryState(decision),
        decision: toRecoveryDecision(decision),
        reason: decision === 'manual_review_required' ? 'material_drift_requires_review' : 'minor_drift_requires_sync_only',
        evaluatedAt: input.venue.fetchedAt,
        duplicateOrderRiskDetected
      };

      return {
        decision,
        recovery,
        notes: [...notes, 'startup_reconciliation_drift_detected'],
        reconciliationDriftRatio: drift
      };
    }

    const decision: StartupRecoveryDecision = 'resume_ok';
    const recovery: RecoverySnapshot = {
      state: toRecoveryState(decision),
      decision: toRecoveryDecision(decision),
      reason: 'startup_state_consistent',
      evaluatedAt: input.venue.fetchedAt,
      duplicateOrderRiskDetected: false
    };

    return {
      decision,
      recovery,
      notes: ['startup_state_consistent'],
      reconciliationDriftRatio: 0
    };
  }
}
