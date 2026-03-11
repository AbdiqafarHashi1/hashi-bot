import type { Candle, MarketSnapshot, SymbolSpec, SymbolCode, Timeframe } from '@hashi-bot/core';

import type { RegimeAssessment } from './regime-assessment.js';

export interface StrategyContext {
  symbolCode: SymbolCode;
  timeframe?: Timeframe;
  candles: Candle[];
  symbolSpec: SymbolSpec;
  snapshot: MarketSnapshot;
  regime: RegimeAssessment;
}

export interface MultiSymbolStrategyContext {
  contextsBySymbol: Record<string, StrategyContext>;
  snapshotsBySymbol: Record<string, MarketSnapshot>;
  regimesBySymbol: Record<string, RegimeAssessment>;
}
