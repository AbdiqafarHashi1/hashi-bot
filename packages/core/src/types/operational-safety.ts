import type { EpochMs, JsonValue, SymbolCode } from './common.js';
import type { ExecutionVenue } from '../enums/execution-venue.js';

export const INCIDENT_SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const WATCHDOG_SIGNAL_STATUSES = ['ok', 'warning', 'critical', 'unknown'] as const;
export type WatchdogSignalStatus = (typeof WATCHDOG_SIGNAL_STATUSES)[number];

export interface WatchdogTimelinessSignal {
  status: WatchdogSignalStatus;
  stale: boolean;
  ageMs?: number;
  thresholdMs: number;
  lastUpdateTs?: EpochMs;
  detail?: string;
}

export interface WatchdogCounterSignal {
  status: WatchdogSignalStatus;
  breached: boolean;
  currentCount: number;
  threshold: number;
  windowMs?: number;
  detail?: string;
}

export interface WatchdogReconciliationSignal {
  status: WatchdogSignalStatus;
  persistent: boolean;
  driftCount: number;
  threshold: number;
  latestMismatchTs?: EpochMs;
  detail?: string;
}

export const SAFETY_STATES = ['healthy', 'degraded', 'paused', 'locked', 'kill_switched', 'recovery_required'] as const;
export type SafetyState = (typeof SAFETY_STATES)[number];

export const HEALTH_STATUSES = [
  'healthy',
  'degraded',
  'paused',
  'locked',
  'kill_switched',
  'recovery_required',
  'unhealthy',
  'unknown'
] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const HEALTH_RECOMMENDED_ACTIONS = [
  'continue',
  'observe',
  'safe_sync_only',
  'manual_review_required',
  'pause_trading',
  'lock_engine'
] as const;
export type HealthRecommendedAction = (typeof HEALTH_RECOMMENDED_ACTIONS)[number];

export interface WatchdogStatus {
  overallStatus: WatchdogSignalStatus;
  feed: WatchdogTimelinessSignal;
  sync: WatchdogTimelinessSignal;
  heartbeat: WatchdogTimelinessSignal;
  executionFailures: WatchdogCounterSignal;
  rejectedOrders: WatchdogCounterSignal;
  reconciliation: WatchdogReconciliationSignal;
  feedStale: boolean;
  feedStalenessMs?: number;
  syncStale: boolean;
  syncStalenessMs?: number;
  heartbeatAgeMs?: number;
  consecutiveFailures: number;
  rejectedOrderStreak: number;
  reconciliationDrift: boolean;
  reconciliationDriftCount: number;
  updatedAtTs: EpochMs;
  notes?: string[];
}

export const KILL_SWITCH_STATES = ['inactive', 'arming', 'active', 'reset_required'] as const;
export type KillSwitchState = (typeof KILL_SWITCH_STATES)[number];

export const KILL_SWITCH_REASONS = [
  'manual_operator_trigger',
  'watchdog_feed_stale',
  'watchdog_sync_stale',
  'watchdog_heartbeat_timeout',
  'consecutive_execution_failures',
  'repeated_order_rejections',
  'reconciliation_drift',
  'risk_guard_violation',
  'startup_recovery_mismatch',
  'unknown'
] as const;
export type KillSwitchReason = (typeof KILL_SWITCH_REASONS)[number];

export interface KillSwitchStatus {
  state: KillSwitchState;
  reason?: KillSwitchReason;
  activatedAtTs?: EpochMs;
  activatedBy?: string;
  details?: string;
}



export const OPERATIONAL_CONTROL_STATES = ['normal', 'degraded', 'paused', 'kill_switched', 'locked_pending_review'] as const;
export type OperationalControlState = (typeof OPERATIONAL_CONTROL_STATES)[number];

export interface LiveTradingLockout {
  blockNewOrderPlacement: boolean;
  blockSymbolTrading: SymbolCode[];
  blockVenueTrading: boolean;
  blockLiveMode: boolean;
  reasons: string[];
}

export const RECOVERY_STATES = ['idle', 'required', 'in_progress', 'synchronized', 'blocked', 'failed'] as const;
export type RecoveryState = (typeof RECOVERY_STATES)[number];

export const RECOVERY_DECISION_OUTCOMES = [
  'resume_automatically',
  'manual_review_required',
  'force_safe_sync_only',
  'remain_locked',
  'resume_ok',
  'sync_only_no_trading',
  'lock_live_mode'
] as const;
export type RecoveryDecisionOutcome = (typeof RECOVERY_DECISION_OUTCOMES)[number];

export interface RecoveryDecision {
  outcome: RecoveryDecisionOutcome;
  rationale: string[];
  reviewedAtTs: EpochMs;
  lockout?: LiveLockoutState;
  requiresManualAck: boolean;
}

export interface ResumeDecision {
  allowed: boolean;
  outcome: RecoveryDecisionOutcome;
  rationale: string[];
  reviewedAtTs: EpochMs;
}

export const EMERGENCY_COMMANDS = [
  'cancel_all_orders',
  'flatten_positions',
  'disable_live_mode',
  'pause_symbol',
  'pause_venue',
  'acknowledge_incident'
] as const;
export type EmergencyCommandType = (typeof EMERGENCY_COMMANDS)[number];

export interface EmergencyCommand {
  commandId: string;
  command: EmergencyCommandType;
  issuedAtTs: EpochMs;
  issuedBy: string;
  venue?: ExecutionVenue;
  symbolCode?: SymbolCode;
  incidentId?: string;
  reason?: string;
  metadata?: JsonValue;
}

export interface EmergencyCommandResult {
  commandId: string;
  command: EmergencyCommandType;
  accepted: boolean;
  completed: boolean;
  message?: string;
  errorCode?: string;
  receivedAtTs: EpochMs;
  completedAtTs?: EpochMs;
  details?: JsonValue;
}

export const LIVE_LOCKOUT_STATES = [
  'unlocked',
  'manual_lockout',
  'recovery_lockout',
  'kill_switch_lockout',
  'safety_lockout'
] as const;
export type LiveLockoutState = (typeof LIVE_LOCKOUT_STATES)[number];

export interface OperationalStatusSummary {
  controlState?: OperationalControlState;
  safetyState: SafetyState;
  healthStatus: HealthStatus;
  recommendedAction: HealthRecommendedAction;
  watchdog: WatchdogStatus;
  killSwitch: KillSwitchStatus;
  recoveryState: RecoveryState;
  latestRecoveryDecision?: RecoveryDecision;
  latestResumeDecision?: ResumeDecision;
  liveLockout: LiveLockoutState;
  lockout?: LiveTradingLockout;
  openIncidentCount: number;
  highestIncidentSeverity?: IncidentSeverity;
  reasons?: string[];
  lastUpdatedTs: EpochMs;
}
