import type {
  MarketSnapshot,
  SymbolCode,
  Timeframe,
  TrendBias,
  VolatilityState,
} from '@hashi-bot/core';

export type RegimeState =
  | 'trending_bull'
  | 'trending_bear'
  | 'chop'
  | 'neutral'
  | 'expanding'
  | 'low_vol';

export interface RegimeAssessment {
  symbolCode: SymbolCode;
  timeframe?: Timeframe;
  regimeState: RegimeState;
  isTradable: boolean;
  trendBias: TrendBias;
  volatilityState?: VolatilityState;
  reasons: string[];
  flags?: string[];
  snapshot: MarketSnapshot;
}
