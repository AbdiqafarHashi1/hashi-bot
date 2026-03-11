import type { BotMode } from '../enums/bot-mode.js';
import type { ExecutionVenue } from '../enums/execution-venue.js';
import type { EpochMs, IsoTimestamp, JsonObject, SymbolCode } from './common.js';

export type SafetyState =
  | 'healthy'
  | 'degraded'
  | 'paused'
  | 'locked'
  | 'kill_switched'
  | 'recovery_required';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export type IncidentSeverity = 'info' | 'warning' | 'critical';

export interface WatchdogThresholds {
  maxFeedStalenessMs: number;
  maxSyncStalenessMs: number;
  maxHeartbeatAgeMs: number;
  maxConsecutiveFailures: number;
  maxRepeatedRejectedOrders: number;
  maxReconciliationDriftRatio: number;
}

export interface WatchdogStatus {
  evaluatedAt: IsoTimestamp;
  lastFeedUpdateAt?: IsoTimestamp;
  feedStalenessMs?: EpochMs;
  lastSyncAt?: IsoTimestamp;
  syncStalenessMs?: EpochMs;
  lastHeartbeatAt?: IsoTimestamp;
  heartbeatAgeMs?: EpochMs;
  consecutiveFailures: number;
  repeatedRejectedOrders: number;
  reconciliationDriftRatio?: number;
  thresholds: WatchdogThresholds;
  status: HealthStatus;
  incidents: WatchdogIncident[];
}

export interface WatchdogIncident {
  code:
    | 'feed_stale'
    | 'sync_stale'
    | 'heartbeat_stale'
    | 'consecutive_failures'
    | 'repeated_rejections'
    | 'reconciliation_drift';
  severity: IncidentSeverity;
  message: string;
  detectedAt: IsoTimestamp;
  details?: JsonObject;
}

export type KillSwitchState = 'inactive' | 'armed' | 'engaged' | 'cooldown';

export type KillSwitchReason =
  | 'manual_operator_action'
  | 'watchdog_feed_stale'
  | 'watchdog_sync_stale'
  | 'watchdog_heartbeat_stale'
  | 'watchdog_consecutive_failures'
  | 'watchdog_repeated_rejections'
  | 'watchdog_reconciliation_drift'
  | 'recovery_guard_failed'
  | 'compliance_lockout'
  | 'unknown';

export interface KillSwitchStatus {
  state: KillSwitchState;
  reason?: KillSwitchReason;
  engagedAt?: IsoTimestamp;
  engagedBy?: string;
  notes?: string;
}

export type RecoveryState =
  | 'not_required'
  | 'required'
  | 'syncing'
  | 'awaiting_manual_review'
  | 'recovered'
  | 'failed';

export type RecoveryDecision =
  | 'resume_automatically'
  | 'require_manual_review'
  | 'force_safe_sync_only'
  | 'remain_locked';

export type ResumeDecision = RecoveryDecision;

export interface RecoverySnapshot {
  state: RecoveryState;
  decision: RecoveryDecision;
  reason: string;
  evaluatedAt: IsoTimestamp;
  checkpointId?: string;
  duplicateOrderRiskDetected: boolean;
}

export type EmergencyCommandType =
  | 'cancel_all_orders'
  | 'flatten_positions'
  | 'disable_live_mode'
  | 'pause_symbol'
  | 'pause_venue'
  | 'acknowledge_incident';

export interface EmergencyCommand {
  commandId: string;
  type: EmergencyCommandType;
  issuedAt: IsoTimestamp;
  issuedBy: string;
  reason?: string;
  symbol?: SymbolCode;
  venue?: ExecutionVenue;
  incidentCode?: string;
  metadata?: JsonObject;
}

export interface EmergencyCommandResult {
  commandId: string;
  type: EmergencyCommandType;
  status: 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'failed';
  processedAt: IsoTimestamp;
  message?: string;
  affectedSymbols?: SymbolCode[];
  affectedVenues?: ExecutionVenue[];
  errors?: string[];
}

export interface LiveLockoutState {
  isLockedOut: boolean;
  state: Extract<SafetyState, 'locked' | 'kill_switched' | 'recovery_required' | 'paused'>;
  reason: KillSwitchReason | 'manual_pause' | 'recovery_required' | 'mode_boundary';
  lockedAt: IsoTimestamp;
  unlockRequiresManualReview: boolean;
}

export interface OperationalStatusSummary {
  observedAt: IsoTimestamp;
  mode: BotMode;
  safetyState: SafetyState;
  healthStatus: HealthStatus;
  incidentSeverity: IncidentSeverity;
  watchdog: WatchdogStatus;
  killSwitch: KillSwitchStatus;
  recovery: RecoverySnapshot;
  liveLockout?: LiveLockoutState;
  activeEmergencyCommand?: EmergencyCommand;
}
