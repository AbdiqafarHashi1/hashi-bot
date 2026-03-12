import {
  INCIDENT_SEVERITIES,
  type BotMode,
  type EmergencyCommand,
  type EmergencyCommandResult,
  type EpochMs,
  type ExecutionVenue,
  type HealthStatus,
  type IncidentSeverity,
  type IsoTimestamp,
  type JsonValue,
  type KillSwitchReason,
  type KillSwitchState,
  type LiveLockoutState,
  type OperationalControlState,
  type OperationalStatusSummary,
  type RecoveryDecision,
  type RecoveryState,
  type ResumeDecision,
  type SafetyState,
  type SymbolCode,
  type TradeSide,
  type WatchdogStatus,
  type LiveTradingLockout
} from '@hashi-bot/core';

export type VenueAccountRef = string;
export type VenueSymbol = string;
export type VenueOrderId = string;
export type ClientOrderId = string;

export const EXECUTION_ORDER_SIDES = ['buy', 'sell'] as const;
export type ExecutionOrderSide = (typeof EXECUTION_ORDER_SIDES)[number];

export const EXECUTION_ORDER_TYPES = ['market', 'limit', 'stop', 'stop_limit'] as const;
export type ExecutionOrderType = (typeof EXECUTION_ORDER_TYPES)[number];

export const EXECUTION_TIME_IN_FORCE = ['gtc', 'ioc', 'fok'] as const;
export type ExecutionTimeInForce = (typeof EXECUTION_TIME_IN_FORCE)[number];

export const VENUE_ORDER_STATUSES = [
  'pending',
  'open',
  'partially_filled',
  'filled',
  'canceled',
  'rejected',
  'expired'
] as const;
export type VenueOrderStatus = (typeof VENUE_ORDER_STATUSES)[number];

export const POSITION_STATUSES = ['open', 'closing', 'closed'] as const;
export type VenuePositionStatus = (typeof POSITION_STATUSES)[number];

export type RawVenuePayload = JsonValue;

export interface VenueBalance {
  asset: string;
  free: number;
  used: number;
  total: number;
  raw?: RawVenuePayload;
}

export interface AccountSnapshot {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  equity?: number;
  balance?: number;
  marginUsed?: number;
  marginAvailable?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  balances?: VenueBalance[];
  fetchedAtTs: EpochMs;
  fetchedAtIso?: IsoTimestamp;
  raw?: RawVenuePayload;
}

export interface VenueOrder {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  orderId: VenueOrderId;
  clientOrderId?: ClientOrderId;
  symbolCode: SymbolCode;
  venueSymbol: VenueSymbol;
  side: ExecutionOrderSide;
  orderType: ExecutionOrderType;
  status: VenueOrderStatus;
  quantity: number;
  quantityLots?: number;
  filledQuantity: number;
  remainingQuantity?: number;
  price?: number;
  averageFillPrice?: number;
  stopPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  timeInForce?: ExecutionTimeInForce;
  reduceOnly?: boolean;
  submittedAtTs?: EpochMs;
  updatedAtTs: EpochMs;
  submittedAtIso?: IsoTimestamp;
  updatedAtIso?: IsoTimestamp;
  raw?: RawVenuePayload;
}

export interface VenuePosition {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  positionId?: string;
  symbolCode: SymbolCode;
  venueSymbol: VenueSymbol;
  side: TradeSide;
  status: VenuePositionStatus;
  quantity: number;
  quantityLots?: number;
  entryPrice: number;
  markPrice?: number;
  liquidationPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  leverage?: number;
  marginUsed?: number;
  unrealizedPnl?: number;
  openedAtTs?: EpochMs;
  updatedAtTs: EpochMs;
  openedAtIso?: IsoTimestamp;
  updatedAtIso?: IsoTimestamp;
  raw?: RawVenuePayload;
}

export interface ExecutionRequest {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  symbolCode: SymbolCode;
  venueSymbol: VenueSymbol;
  side: ExecutionOrderSide;
  orderType: ExecutionOrderType;
  quantity: number;
  quantityLots?: number;
  price?: number;
  stopPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  timeInForce?: ExecutionTimeInForce;
  clientOrderId?: ClientOrderId;
  reduceOnly?: boolean;
  submittedAtTs: EpochMs;
}

export interface ExecutionResult {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  accepted: boolean;
  request: ExecutionRequest;
  orderId?: VenueOrderId;
  order?: VenueOrder;
  status?: VenueOrderStatus;
  message?: string;
  errorCode?: string;
  receivedAtTs: EpochMs;
  raw?: RawVenuePayload;
}

export interface CancelRequest {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  orderId?: VenueOrderId;
  clientOrderId?: ClientOrderId;
  symbolCode: SymbolCode;
  venueSymbol: VenueSymbol;
  requestedAtTs: EpochMs;
}

export interface CancelResult {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  canceled: boolean;
  request: CancelRequest;
  orderId?: VenueOrderId;
  status?: VenueOrderStatus;
  message?: string;
  errorCode?: string;
  receivedAtTs: EpochMs;
  raw?: RawVenuePayload;
}

export interface SyncSnapshot {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  fetchedAtTs: EpochMs;
  account: AccountSnapshot;
  openOrders: VenueOrder[];
  openPositions: VenuePosition[];
  raw?: RawVenuePayload;
}

export const RECONCILIATION_CODES = [
  'in_sync',
  'missing_local',
  'missing_remote',
  'quantity_mismatch',
  'price_mismatch',
  'stale_state',
  'orphaned_order',
  'orphaned_position'
] as const;
export type ReconciliationCode = (typeof RECONCILIATION_CODES)[number];

export const RECONCILIATION_ENTITY_TYPES = ['account', 'order', 'position'] as const;
export type ReconciliationEntityType = (typeof RECONCILIATION_ENTITY_TYPES)[number];

export interface ReconciliationEntry {
  code: ReconciliationCode;
  entityType: ReconciliationEntityType;
  symbolCode?: SymbolCode;
  localRef?: string;
  remoteRef?: string;
  localQuantity?: number;
  remoteQuantity?: number;
  localPrice?: number;
  remotePrice?: number;
  observedAtTs: EpochMs;
  resolutionNote?: string;
}

export interface ReconciliationResult {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  reconciledAtTs: EpochMs;
  entries: ReconciliationEntry[];
  hasMismatch: boolean;
  resolutionNotes?: string[];
}

export const LIVE_ENGINE_STATUSES = [
  'idle',
  'starting',
  'syncing',
  'running',
  'degraded',
  'incident',
  'stopped'
] as const;
export type LiveEngineStatus = (typeof LIVE_ENGINE_STATUSES)[number];

export const EXECUTION_INCIDENT_SEVERITIES = INCIDENT_SEVERITIES;
export type ExecutionIncidentSeverity = IncidentSeverity;

export const EXECUTION_INCIDENT_CODES = [
  'sync_failure',
  'place_order_failure',
  'cancel_order_failure',
  'reconciliation_mismatch',
  'adapter_unreachable',
  'auth_failure',
  'rate_limited',
  'unknown'
] as const;
export type ExecutionIncidentCode = (typeof EXECUTION_INCIDENT_CODES)[number];

export interface ExecutionIncident {
  incidentId: string;
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  code: ExecutionIncidentCode;
  severity: ExecutionIncidentSeverity;
  message: string;
  context?: RawVenuePayload;
  raisedAtTs: EpochMs;
  resolvedAtTs?: EpochMs;
}



export interface ExecutionKillSwitchState {
  state: KillSwitchState;
  reason?: KillSwitchReason;
  activatedAtTs?: EpochMs;
  activatedBy?: string;
  notes?: string[];
}

export interface ExecutionRecoveryState {
  state: RecoveryState;
  startedAtTs?: EpochMs;
  completedAtTs?: EpochMs;
  pendingActions?: string[];
  notes?: string[];
}

export interface ExecutionSafetyState {
  safetyState: SafetyState;
  healthStatus: HealthStatus;
  watchdog: WatchdogStatus;
  killSwitch: ExecutionKillSwitchState;
  recovery: ExecutionRecoveryState;
  liveLockout: LiveLockoutState;
  latestRecoveryDecision?: RecoveryDecision;
  latestResumeDecision?: ResumeDecision;
}

export interface EmergencyCommandEnvelope {
  accountRef: VenueAccountRef;
  venue: ExecutionVenue;
  payload: EmergencyCommand;
}

export interface EmergencyCommandExecutionResult extends EmergencyCommandResult {
  accountRef: VenueAccountRef;
  venue: ExecutionVenue;
}



export interface LiveControlDecision {
  controlState: OperationalControlState;
  killSwitchState: KillSwitchState;
  killSwitchReason?: KillSwitchReason;
  lockout: LiveTradingLockout;
  reasons: string[];
  transitionedAtTs?: EpochMs;
}

export interface ExecutionHealthSummary {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  status: LiveEngineStatus;
  safetyState?: SafetyState;
  healthStatus?: HealthStatus;
  lastHeartbeatTs?: EpochMs;
  lastSyncTs?: EpochMs;
  openIncidentCount: number;
  criticalIncidentCount: number;
  latestIncident?: ExecutionIncident;
  watchdog?: WatchdogStatus;
  killSwitch?: ExecutionKillSwitchState;
  recovery?: ExecutionRecoveryState;
  liveLockout?: LiveLockoutState;
}

export interface LiveEngineState {
  mode: Extract<BotMode, 'paper' | 'live'>;
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  status: LiveEngineStatus;
  account?: AccountSnapshot;
  watchedSymbols: SymbolCode[];
  latestSyncTs?: EpochMs;
  openPositions: VenuePosition[];
  openOrders: VenueOrder[];
  latestIncidents: ExecutionIncident[];
  health: ExecutionHealthSummary;
  safety?: ExecutionSafetyState;
  operationalSummary?: OperationalStatusSummary;
  controlDecision?: LiveControlDecision;
}
