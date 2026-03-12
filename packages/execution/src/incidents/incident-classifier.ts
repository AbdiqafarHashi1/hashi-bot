import type { EpochMs, JsonValue } from '@hashi-bot/core';

import type { ReconciliationResult } from '../types/execution-domain.js';
import type { ExecutionIncidentRecord, ExecutionIncidentType } from './incident-model.js';

export interface IncidentClassificationInput {
  reconciliation?: ReconciliationResult;
  adapterError?: {
    venue: ReconciliationResult['venue'];
    accountRef: string;
    message: string;
    errorCode?: string;
    context?: JsonValue;
  };
  nowTs: EpochMs;
}

function severityForType(type: ExecutionIncidentType): ExecutionIncidentRecord['severity'] {
  switch (type) {
    case 'auth_config_failure':
    case 'balance_margin_issue':
      return 'critical';
    case 'network_connectivity_issue':
    case 'stale_sync':
    case 'rejected_order':
      return 'error';
    case 'missing_local_order':
    case 'missing_remote_order':
    case 'orphaned_position':
    case 'precision_validation_mismatch':
      return 'warning';
    default:
      return 'info';
  }
}

function classifyReconciliationCode(code: string): ExecutionIncidentType | undefined {
  switch (code) {
    case 'missing_local':
      return 'missing_local_order';
    case 'missing_remote':
      return 'missing_remote_order';
    case 'orphaned_position':
      return 'orphaned_position';
    case 'stale_state':
      return 'stale_sync';
    case 'price_mismatch':
    case 'quantity_mismatch':
      return 'precision_validation_mismatch';
    default:
      return undefined;
  }
}

export function classifyExecutionIncidents(input: IncidentClassificationInput): ExecutionIncidentRecord[] {
  const incidents: ExecutionIncidentRecord[] = [];

  if (input.reconciliation) {
    for (const entry of input.reconciliation.entries) {
      const type = classifyReconciliationCode(entry.code);
      if (!type) {
        continue;
      }

      incidents.push({
        incidentId: `${input.reconciliation.venue}_${input.nowTs}_${incidents.length + 1}`,
        venue: input.reconciliation.venue,
        accountRef: input.reconciliation.accountRef,
        type,
        severity: severityForType(type),
        message: entry.resolutionNote ?? `Reconciliation detected ${entry.code}.`,
        symbolCode: entry.symbolCode,
        relatedRef: entry.remoteRef ?? entry.localRef,
        context: {
          entityType: entry.entityType,
          code: entry.code,
          localRef: entry.localRef ?? null,
          remoteRef: entry.remoteRef ?? null,
          localQuantity: entry.localQuantity ?? null,
          remoteQuantity: entry.remoteQuantity ?? null,
          localPrice: entry.localPrice ?? null,
          remotePrice: entry.remotePrice ?? null
        },
        occurredAtTs: input.nowTs
      });
    }
  }

  if (input.adapterError) {
    const lower = `${input.adapterError.errorCode ?? ''} ${input.adapterError.message}`.toLowerCase();

    let type: ExecutionIncidentType = 'unknown';
    if (lower.includes('auth') || lower.includes('credential') || lower.includes('token')) {
      type = 'auth_config_failure';
    } else if (lower.includes('network') || lower.includes('timeout') || lower.includes('connect')) {
      type = 'network_connectivity_issue';
    } else if (lower.includes('precision') || lower.includes('validation') || lower.includes('invalid')) {
      type = 'precision_validation_mismatch';
    } else if (lower.includes('margin') || lower.includes('balance') || lower.includes('insufficient')) {
      type = 'balance_margin_issue';
    } else if (lower.includes('reject')) {
      type = 'rejected_order';
    }

    incidents.push({
      incidentId: `${input.adapterError.venue}_${input.nowTs}_adapter`,
      venue: input.adapterError.venue,
      accountRef: input.adapterError.accountRef,
      type,
      severity: severityForType(type),
      message: input.adapterError.message,
      context: input.adapterError.context,
      occurredAtTs: input.nowTs,
      retriable: type === 'network_connectivity_issue'
    });
  }

  return incidents;
}
