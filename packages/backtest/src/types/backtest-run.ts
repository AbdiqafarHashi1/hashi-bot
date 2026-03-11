import type { Candle, EpochMs, ProfileCode, RunId, StrategySignal, SymbolCode, Timeframe, TradeSide } from '@hashi-bot/core';
import type { SimulatedTrade } from './simulated-trade.js';

export interface EquitySnapshot {
  ts: EpochMs;
  balance: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  drawdownPct: number;
  openPositions: number;
}

export interface PerSymbolBacktestStats {
  symbolCode: SymbolCode;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  lossRatePct: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  profitFactor?: number;
  averageRMultiple?: number;
  averageHoldingTimeMs?: number;
}

export interface PerSetupBacktestStats {
  setupCode: string;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  lossRatePct: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  profitFactor?: number;
  averageRMultiple?: number;
}

export interface SideBreakdownStats {
  side: TradeSide;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  lossRatePct: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  profitFactor?: number;
}

export interface BacktestMetricsSummary {
  startingBalance: number;
  endingBalance: number;
  netPnl: number;
  returnPct: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  lossRatePct: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor?: number;
  expectancy?: number;
  averageRMultiple?: number;
  maxDrawdownPct: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  averageHoldingTimeMs?: number;
  perSymbol: PerSymbolBacktestStats[];
  perSetup: PerSetupBacktestStats[];
  longShortBreakdown: SideBreakdownStats[];
}

export interface BacktestRunConfig {
  runId: RunId;
  profileCode: ProfileCode;
  timeframe: Timeframe;
  symbols: SymbolCode[];
  fromTs: EpochMs;
  toTs: EpochMs;
  initialBalance: number;
  slippageBps?: number;
  commissionBps?: number;
  maxConcurrentPositions?: number;
}

export interface BacktestRunMetadata {
  runId: RunId;
  profileCode: ProfileCode;
  timeframe: Timeframe;
  symbols: SymbolCode[];
  startedAtTs: EpochMs;
  completedAtTs?: EpochMs;
  candlesProcessed: number;
}

export interface BacktestRunResult {
  metadata: BacktestRunMetadata;
  config: BacktestRunConfig;
  trades: SimulatedTrade[];
  metrics: BacktestMetricsSummary;
  equity: EquitySnapshot[];
  perSymbolStats: PerSymbolBacktestStats[];
  perSetupStats: PerSetupBacktestStats[];
  longShortStats: SideBreakdownStats[];
  rejectedSignals?: StrategySignal[];
  candles?: Candle[];
}
