import type {
  DatasetId,
  EpochMs,
  MarketSnapshot,
  ProfileCode,
  RunId,
  StrategySignal,
  SymbolCode,
  Timeframe,
} from '@hashi-bot/core';
import type { BacktestRunConfig } from './backtest-run.js';
import type { SimulatedTrade } from './simulated-trade.js';

export type ReplayPlaybackState = 'idle' | 'playing' | 'paused' | 'completed';

export type ReplayControlAction =
  | { type: 'step'; steps?: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'jump_to_index'; barIndex: number }
  | { type: 'jump_to_timestamp'; timestamp: EpochMs }
  | { type: 'set_speed'; speed: number }
  | { type: 'reset' };

export interface ReplayCursor {
  barIndex: number;
  timestamp?: EpochMs;
  symbolCode?: SymbolCode;
}

export interface ReplaySymbolScope {
  mode: 'single' | 'watchlist';
  symbols: SymbolCode[];
  primarySymbol?: SymbolCode;
}

export interface ReplayRunConfig {
  runId: RunId;
  datasetId: DatasetId;
  profileCode: ProfileCode;
  timeframe: Timeframe;
  symbolScope: ReplaySymbolScope;
  initialCursor?: ReplayCursor;
  replaySpeed: number;
  maxTimelineEvents?: number;
}

export interface ReplayRegimeAssessment {
  symbolCode: SymbolCode;
  timeframe?: Timeframe;
  regimeState: string;
  isTradable: boolean;
  reasons: string[];
  flags?: string[];
}

export type ReplayTimelineEventType =
  | 'bar_advanced'
  | 'snapshot_updated'
  | 'regime_assessed'
  | 'signal_emitted'
  | 'signal_rejected'
  | 'trade_opened'
  | 'trade_updated'
  | 'trade_closed'
  | 'playback_state_changed'
  | 'run_completed'
  | 'note';

export interface ReplayTimelineEvent {
  eventId: string;
  runId: RunId;
  ts: EpochMs;
  barIndex: number;
  symbolCode?: SymbolCode;
  type: ReplayTimelineEventType;
  message?: string;
  payload?: Record<string, unknown>;
}

export interface ReplayClosedTradesSummary {
  totalClosed: number;
  grossPnl: number;
  netPnl: number;
  wins: number;
  losses: number;
  winRatePct: number;
}

export interface ReplayState {
  runId: RunId;
  datasetId: DatasetId;
  symbolScope: ReplaySymbolScope;
  cursor: ReplayCursor;
  playbackState: ReplayPlaybackState;
  playbackSpeed: number;
  latestSnapshots: MarketSnapshot[];
  latestRegimeAssessments: ReplayRegimeAssessment[];
  latestSignals: StrategySignal[];
  openTrades: SimulatedTrade[];
  closedTradesSummary: ReplayClosedTradesSummary;
  recentTimelineEvents: ReplayTimelineEvent[];
}

export interface ReplayStepResult {
  runId: RunId;
  state: ReplayState;
  emittedEvents: ReplayTimelineEvent[];
  hasMoreData: boolean;
}

export type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface InstantBacktestRequest {
  datasetId: DatasetId;
  profileCode: ProfileCode;
  timeframe: Timeframe;
  symbols: SymbolCode[];
  fromTs?: EpochMs;
  toTs?: EpochMs;
  initialBalance?: number;
  slippageBps?: number;
  commissionBps?: number;
  maxConcurrentPositions?: number;
  metadata?: Record<string, string>;
}

export interface RunLaunchRequest {
  mode: 'replay' | 'instant_backtest';
  replay?: ReplayRunConfig;
  instantBacktest?: InstantBacktestRequest;
  requestedBy?: string;
  requestId?: string;
}


export interface RunMetricsSummary {
  totalTrades?: number;
  winRatePct?: number;
  netPnl?: number;
  maxDrawdownPct?: number;
}

export interface RunTradeSummary {
  tradeId: string;
  symbolCode: SymbolCode;
  side: SimulatedTrade['side'];
  setupCode: string;
  lifecycleState: SimulatedTrade['lifecycleState'];
  netPnl?: number;
  openedAtTs?: EpochMs;
  closedAtTs?: EpochMs;
  closeReason?: string;
}

export interface ReplayTimelineSummary {
  totalEvents: number;
  eventTypes: Partial<Record<ReplayTimelineEventType, number>>;
  latestEventTs?: EpochMs;
}

export interface RunSummary {
  runId: RunId;
  mode: 'replay' | 'backtest';
  status: RunStatus;
  datasetId?: DatasetId;
  profileCode: ProfileCode;
  timeframe: Timeframe;
  symbols: SymbolCode[];
  startedAtTs?: EpochMs;
  completedAtTs?: EpochMs;
  totalTrades?: number;
  winRatePct?: number;
  netPnl?: number;
  maxDrawdownPct?: number;
}

export interface RunDetailView {
  summary: RunSummary;
  replayState?: ReplayState;
  backtestConfig?: BacktestRunConfig;
  tradeSummaries?: RunTradeSummary[];
  metrics?: RunMetricsSummary;
  timeline: ReplayTimelineEvent[];
  timelineSummary?: ReplayTimelineSummary;
  error?: string;
}
