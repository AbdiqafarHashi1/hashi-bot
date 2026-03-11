import type { Timeframe } from '../enums/timeframe.js';
import type { EpochMs, SymbolCode } from './common.js';

export type TrendBias = 'bullish' | 'bearish' | 'neutral';
export type VolatilityState = 'low' | 'normal' | 'expanding' | 'high';

export interface MarketSnapshot {
  symbolCode: SymbolCode;
  timeframe?: Timeframe;

  // Legacy Phase 1 market fields (kept for backward compatibility).
  ts: EpochMs;
  last: number;
  bid?: number;
  ask?: number;
  mark?: number;
  index?: number;
  spread?: number;
  volume24h?: number;

  // Phase 2 indicator/regime-ready fields.
  latestTs?: EpochMs;
  latestClose?: number;
  trendBias?: TrendBias;

  emaFast?: number;
  emaSlow?: number;
  atr?: number;
  atrPct?: number;
  adx?: number;
  slopePct?: number;
  chopRatio?: number;

  volatilityState?: VolatilityState;
  flags?: string[];
  notes?: string[];
}
