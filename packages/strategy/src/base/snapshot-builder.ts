import type { Candle, MarketSnapshot, SymbolSpec, Timeframe, TrendBias, VolatilityState } from '@hashi-bot/core';
import {
  calculateAdxSeries,
  calculateAtrSeries,
  calculateChopSeries,
  calculateEmaSeries,
  calculateSlopeSeries,
} from '@hashi-bot/indicators';
import {
  normalizeMoveToPips,
  normalizeMoveToTicks,
  safePercentFromPriceMove,
} from '@hashi-bot/market';

export interface SnapshotBuildConfig {
  emaFastPeriod: number;
  emaSlowPeriod: number;
  atrPeriod: number;
  adxPeriod: number;
  slopeLookback: number;
  chopPeriod: number;
  lowVolAtrPctThreshold: number;
  highVolAtrPctThreshold: number;
}

export interface SnapshotBuildInput {
  candles: readonly Candle[];
  symbolSpec: SymbolSpec;
  timeframe?: Timeframe;
}

export const DEFAULT_SNAPSHOT_BUILD_CONFIG: SnapshotBuildConfig = {
  emaFastPeriod: 20,
  emaSlowPeriod: 50,
  atrPeriod: 14,
  adxPeriod: 14,
  slopeLookback: 20,
  chopPeriod: 14,
  lowVolAtrPctThreshold: 0.25,
  highVolAtrPctThreshold: 1,
};

function latestValue(series: Array<number | null>): number | undefined {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (value != null) {
      return value;
    }
  }

  return undefined;
}

function deriveTrendBias(emaFast?: number, emaSlow?: number, slopePct?: number): TrendBias {
  if (emaFast == null || emaSlow == null || slopePct == null) {
    return 'neutral';
  }

  if (emaFast > emaSlow && slopePct > 0) {
    return 'bullish';
  }

  if (emaFast < emaSlow && slopePct < 0) {
    return 'bearish';
  }

  return 'neutral';
}

function deriveVolatilityState(
  atrPct: number | undefined,
  config: SnapshotBuildConfig
): VolatilityState | undefined {
  if (atrPct == null) {
    return undefined;
  }

  if (atrPct <= config.lowVolAtrPctThreshold) {
    return 'low';
  }

  if (atrPct >= config.highVolAtrPctThreshold * 1.5) {
    return 'high';
  }

  if (atrPct >= config.highVolAtrPctThreshold) {
    return 'expanding';
  }

  return 'normal';
}

export function buildMarketSnapshot(
  input: SnapshotBuildInput,
  config: Partial<SnapshotBuildConfig> = {}
): MarketSnapshot {
  const resolvedConfig: SnapshotBuildConfig = { ...DEFAULT_SNAPSHOT_BUILD_CONFIG, ...config };
  const { candles, symbolSpec } = input;

  if (candles.length === 0) {
    throw new Error(`Cannot build snapshot without candles for ${symbolSpec.symbolCode}.`);
  }

  const latest = candles[candles.length - 1];
  if (!latest) {
    throw new Error(`Latest candle is missing for ${symbolSpec.symbolCode}.`);
  }

  const closes = candles.map((candle) => candle.close);
  const emaFast = latestValue(calculateEmaSeries(closes, resolvedConfig.emaFastPeriod));
  const emaSlow = latestValue(calculateEmaSeries(closes, resolvedConfig.emaSlowPeriod));
  const atr = latestValue(calculateAtrSeries(candles, resolvedConfig.atrPeriod));
  const adxResult = calculateAdxSeries(candles, resolvedConfig.adxPeriod);
  const adx = latestValue(adxResult.adx);
  const chopRatio = latestValue(calculateChopSeries(candles, resolvedConfig.chopPeriod));

  const slopeSeries = calculateSlopeSeries(closes, resolvedConfig.slopeLookback);
  const slope = slopeSeries[candles.length - 1];
  const slopePct = slope?.slopePercent;

  // atrPct is ATR as a percent of latest close.
  const atrPct = atr == null ? undefined : safePercentFromPriceMove(atr, latest.close) ?? undefined;

  // Normalize slope to latest close percent to keep cross-asset comparisons stable.
  const normalizedSlopePct =
    slopePct == null
      ? undefined
      : safePercentFromPriceMove((slopePct / 100) * latest.close, latest.close) ?? undefined;

  const trendBias = deriveTrendBias(emaFast, emaSlow, normalizedSlopePct);
  const volatilityState = deriveVolatilityState(atrPct, resolvedConfig);

  const flags: string[] = [];

  if (emaFast == null) flags.push('insufficient_ema_fast_history');
  if (emaSlow == null) flags.push('insufficient_ema_slow_history');
  if (atr == null) flags.push('insufficient_atr_history');
  if (adx == null) flags.push('insufficient_adx_history');
  if (normalizedSlopePct == null) flags.push('insufficient_slope_history');
  if (chopRatio == null) flags.push('insufficient_chop_history');

  const atrPips = atr == null ? undefined : normalizeMoveToPips(atr, symbolSpec);
  const atrTicks = atr == null ? undefined : normalizeMoveToTicks(atr, symbolSpec);

  return {
    symbolCode: symbolSpec.symbolCode,
    timeframe: input.timeframe ?? latest.timeframe,
    ts: latest.ts,
    last: latest.close,
    bid: undefined,
    ask: undefined,
    mark: undefined,
    index: undefined,
    spread: undefined,
    volume24h: undefined,
    latestTs: latest.ts,
    latestClose: latest.close,
    trendBias,
    emaFast,
    emaSlow,
    atr,
    atrPct,
    adx,
    slopePct: normalizedSlopePct,
    chopRatio,
    volatilityState,
    flags,
    notes: [
      `atr_pips=${atrPips?.toFixed(2) ?? 'n/a'}`,
      `atr_ticks=${atrTicks?.toFixed(2) ?? 'n/a'}`,
      'atrPct = (atr / latestClose) * 100',
      'slopePct = linear-regression slope normalized to percent-of-price',
    ],
  };
}

export function buildMarketSnapshotsBatch(
  inputs: readonly SnapshotBuildInput[],
  config: Partial<SnapshotBuildConfig> = {}
): MarketSnapshot[] {
  return inputs.map((input) => buildMarketSnapshot(input, config));
}
