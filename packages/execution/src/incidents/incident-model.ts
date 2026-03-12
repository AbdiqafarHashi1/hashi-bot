import type { EpochMs, ExecutionVenue, JsonValue, SymbolCode } from '@hashi-bot/core';

export const EXECUTION_INCIDENT_TYPES = [
  'auth_config_failure',
  'network_connectivity_issue',
  'stale_sync',
  'missing_local_order',
  'missing_remote_order',
  'orphaned_position',
  'rejected_order',
  'precision_validation_mismatch',
  'balance_margin_issue',
  'unknown'
] as const;

export type ExecutionIncidentType = (typeof EXECUTION_INCIDENT_TYPES)[number];

export interface ExecutionIncidentRecord {
  incidentId: string;
  venue: ExecutionVenue;
  accountRef: string;
  type: ExecutionIncidentType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  symbolCode?: SymbolCode;
  relatedRef?: string;
  context?: JsonValue;
  occurredAtTs: EpochMs;
  retriable?: boolean;
}
