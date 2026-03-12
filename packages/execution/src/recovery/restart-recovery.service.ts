import type { EpochMs, RecoveryDecision, RecoveryDecisionOutcome, RecoveryState } from '@hashi-bot/core';

import { classifyExecutionIncidents } from '../incidents/incident-classifier.js';
import type { ExecutionIncidentRecord } from '../incidents/incident-model.js';
import { reconcileExecutionState } from '../reconciliation/reconciliation.service.js';
import type { SyncSnapshot, VenueOrder, VenuePosition } from '../types/execution-domain.js';

export interface PersistedLiveStateSnapshot {
  savedAtTs: EpochMs;
  accountRef: string;
  expectedOpenOrders: VenueOrder[];
  expectedOpenPositions: VenuePosition[];
  lastKnownSyncTs?: EpochMs;
}

export interface RestartRecoveryInput {
  nowTs: EpochMs;
  venueSnapshot: SyncSnapshot;
  persistedState?: PersistedLiveStateSnapshot;
  staleAfterMs?: number;
}

export interface RestartRecoveryReport {
  recoveryState: RecoveryState;
  decision: RecoveryDecision;
  reconciliation: ReturnType<typeof reconcileExecutionState>;
  incidents: ExecutionIncidentRecord[];
  duplicateOrderRisk: boolean;
}

function decideOutcome(params: {
  hasPersistedState: boolean;
  hasMismatch: boolean;
  duplicateOrderRisk: boolean;
  incidentCount: number;
  criticalIncidents: number;
}): RecoveryDecisionOutcome {
  if (!params.hasPersistedState) {
    return params.incidentCount > 0 ? 'sync_only_no_trading' : 'resume_ok';
  }

  if (params.criticalIncidents > 0) {
    return 'lock_live_mode';
  }

  if (params.duplicateOrderRisk) {
    return 'manual_review_required';
  }

  if (params.hasMismatch || params.incidentCount > 0) {
    return 'sync_only_no_trading';
  }

  return 'resume_ok';
}

export class RestartRecoveryService {
  public evaluate(input: RestartRecoveryInput): RestartRecoveryReport {
    const localExpected = {
      accountRef: input.venueSnapshot.accountRef,
      openOrders: input.persistedState?.expectedOpenOrders ?? [],
      openPositions: input.persistedState?.expectedOpenPositions ?? []
    };

    const reconciliation = reconcileExecutionState({
      venueSnapshot: input.venueSnapshot,
      local: localExpected,
      staleAfterMs: input.staleAfterMs,
      nowTs: input.nowTs
    });

    const incidents = classifyExecutionIncidents({
      reconciliation,
      nowTs: input.nowTs
    });

    const duplicateOrderRisk = reconciliation.entries.some((entry) =>
      entry.entityType === 'order' && (entry.code === 'missing_local' || entry.code === 'missing_remote')
    );

    const criticalIncidents = incidents.filter((incident) => incident.severity === 'critical').length;

    const outcome = decideOutcome({
      hasPersistedState: Boolean(input.persistedState),
      hasMismatch: reconciliation.hasMismatch,
      duplicateOrderRisk,
      incidentCount: incidents.length,
      criticalIncidents
    });

    const rationale: string[] = [];
    if (!input.persistedState) {
      rationale.push('no_persisted_state_available');
    }
    if (reconciliation.hasMismatch) {
      rationale.push('reconciliation_mismatch_detected');
    }
    if (duplicateOrderRisk) {
      rationale.push('duplicate_order_risk_detected');
    }
    if (incidents.length > 0) {
      rationale.push('startup_incidents_detected');
    }

    const recoveryState: RecoveryState = outcome === 'resume_ok' ? 'synchronized' : outcome === 'lock_live_mode' ? 'blocked' : 'required';

    return {
      recoveryState,
      decision: {
        outcome,
        rationale,
        reviewedAtTs: input.nowTs,
        requiresManualAck: outcome === 'manual_review_required' || outcome === 'lock_live_mode'
      },
      reconciliation,
      incidents,
      duplicateOrderRisk
    };
  }
}
