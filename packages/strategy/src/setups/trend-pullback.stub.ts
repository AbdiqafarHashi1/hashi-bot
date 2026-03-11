import type { TradeSide } from '@hashi-bot/core';

import type { SetupCandidate, SetupCode, SetupReason } from '../base/signal-domain.js';

import {
  buildSetupCandidate,
  maxHigh,
  minLow,
  roundToTick,
  sliceRecentCandles,
  type SetupDetectionInput,
  type TrendLeg,
} from './shared.js';

export interface TrendPullbackThresholds {
  contextLookback: number;
  pullbackWindow: number;
  minCandles: number;
  minRetraceDepthPct: number;
  maxRetraceDepthPct: number;
  valueZoneAtrMultiplier: number;
  stopAtrBuffer: number;
  targetRMultiple: number;
  minConfirmCloseDistanceAtr: number;
}

export const TREND_PULLBACK_SETUP_CODE: SetupCode = 'pullback:trend_pullback';

export const DEFAULT_TREND_PULLBACK_THRESHOLDS: TrendPullbackThresholds = {
  contextLookback: 48,
  pullbackWindow: 10,
  minCandles: 60,
  minRetraceDepthPct: 25,
  maxRetraceDepthPct: 65,
  valueZoneAtrMultiplier: 0.8,
  stopAtrBuffer: 0.3,
  targetRMultiple: 2,
  minConfirmCloseDistanceAtr: 0.1,
};

function deriveLongTrendLeg(input: SetupDetectionInput, window: number, pullbackWindow: number): TrendLeg | null {
  const context = sliceRecentCandles(input.candles, window);
  if (context.length < 8) {
    return null;
  }

  const pullbackSegment = context.slice(-Math.min(pullbackWindow, context.length - 2));
  const trendSegment = context.slice(0, context.length - pullbackSegment.length);

  if (trendSegment.length < 3 || pullbackSegment.length < 2) {
    return null;
  }

  const impulseHigh = maxHigh(trendSegment);
  const impulseLow = minLow(trendSegment);
  const retraceLow = minLow(pullbackSegment);
  const retraceHigh = maxHigh(pullbackSegment);

  const impulseMove = impulseHigh - impulseLow;
  if (impulseMove <= 0) {
    return null;
  }

  const retraceDepthPct = ((impulseHigh - retraceLow) / impulseMove) * 100;

  return {
    impulseMove,
    impulseHigh,
    impulseLow,
    retraceHigh,
    retraceLow,
    retraceDepthPct,
  };
}

function deriveShortTrendLeg(input: SetupDetectionInput, window: number, pullbackWindow: number): TrendLeg | null {
  const context = sliceRecentCandles(input.candles, window);
  if (context.length < 8) {
    return null;
  }

  const pullbackSegment = context.slice(-Math.min(pullbackWindow, context.length - 2));
  const trendSegment = context.slice(0, context.length - pullbackSegment.length);

  if (trendSegment.length < 3 || pullbackSegment.length < 2) {
    return null;
  }

  const impulseLow = minLow(trendSegment);
  const impulseHigh = maxHigh(trendSegment);
  const retraceHigh = maxHigh(pullbackSegment);
  const retraceLow = minLow(pullbackSegment);

  const impulseMove = impulseHigh - impulseLow;
  if (impulseMove <= 0) {
    return null;
  }

  const retraceDepthPct = ((retraceHigh - impulseLow) / impulseMove) * 100;

  return {
    impulseMove,
    impulseHigh,
    impulseLow,
    retraceHigh,
    retraceLow,
    retraceDepthPct,
  };
}

function isRegimeAligned(side: TradeSide, input: SetupDetectionInput): boolean {
  if (!input.regime.isTradable) {
    return false;
  }

  return side === 'long'
    ? input.regime.regimeState === 'trending_bull' && input.snapshot.trendBias === 'bullish'
    : input.regime.regimeState === 'trending_bear' && input.snapshot.trendBias === 'bearish';
}

function detectForSide(
  side: TradeSide,
  input: SetupDetectionInput,
  thresholds: TrendPullbackThresholds
): SetupCandidate | null {
  if (input.candles.length < thresholds.minCandles) {
    return null;
  }

  if (!isRegimeAligned(side, input)) {
    return null;
  }

  const atr = input.snapshot.atr;
  const emaFast = input.snapshot.emaFast;
  const emaSlow = input.snapshot.emaSlow;

  if (atr == null || emaFast == null || emaSlow == null || atr <= 0) {
    return null;
  }

  const latest = input.candles[input.candles.length - 1];
  const previous = input.candles[input.candles.length - 2];

  if (!latest || !previous) {
    return null;
  }

  const leg =
    side === 'long'
      ? deriveLongTrendLeg(input, thresholds.contextLookback, thresholds.pullbackWindow)
      : deriveShortTrendLeg(input, thresholds.contextLookback, thresholds.pullbackWindow);

  if (!leg) {
    return null;
  }

  if (leg.retraceDepthPct < thresholds.minRetraceDepthPct || leg.retraceDepthPct > thresholds.maxRetraceDepthPct) {
    return null;
  }

  const valueZoneOk =
    side === 'long'
      ? leg.retraceLow <= emaFast + atr * thresholds.valueZoneAtrMultiplier &&
        leg.retraceLow >= emaSlow - atr * thresholds.valueZoneAtrMultiplier
      : leg.retraceHigh >= emaFast - atr * thresholds.valueZoneAtrMultiplier &&
        leg.retraceHigh <= emaSlow + atr * thresholds.valueZoneAtrMultiplier;

  if (!valueZoneOk) {
    return null;
  }

  const confirmationOk =
    side === 'long'
      ? latest.close > previous.high && latest.close > emaFast + atr * thresholds.minConfirmCloseDistanceAtr
      : latest.close < previous.low && latest.close < emaFast - atr * thresholds.minConfirmCloseDistanceAtr;

  if (!confirmationOk) {
    return null;
  }

  const entryRef = side === 'long' ? Math.max(latest.high, previous.high) : Math.min(latest.low, previous.low);
  const stopRef = side === 'long' ? leg.retraceLow : leg.retraceHigh;

  const stopOffset = atr * thresholds.stopAtrBuffer * (side === 'long' ? -1 : 1);
  const stopPrice = roundToTick(stopRef + stopOffset, input.symbolSpec);
  const entryPrice = roundToTick(entryRef, input.symbolSpec);
  const riskDistance = side === 'long' ? entryPrice - stopPrice : stopPrice - entryPrice;

  if (riskDistance <= 0) {
    return null;
  }

  const targetPrice =
    side === 'long'
      ? roundToTick(entryPrice + riskDistance * thresholds.targetRMultiple, input.symbolSpec)
      : roundToTick(entryPrice - riskDistance * thresholds.targetRMultiple, input.symbolSpec);

  const reasons: SetupReason[] = [
    'regime_aligned',
    'structure_confirmed',
    'trigger_confirmed',
    'volatility_acceptable',
    `retrace_depth_pct=${leg.retraceDepthPct.toFixed(2)}`,
  ];

  return buildSetupCandidate(
    side,
    TREND_PULLBACK_SETUP_CODE,
    input,
    {
      entry: {
        source: side === 'long' ? 'break_above_confirmation_high' : 'break_below_confirmation_low',
        referencePrice: entryPrice,
      },
      stop: {
        source: side === 'long' ? 'below_pullback_swing_low_with_atr_buffer' : 'above_pullback_swing_high_with_atr_buffer',
        referencePrice: stopPrice,
        offset: stopOffset,
      },
      target: {
        source: 'fixed_r_multiple_from_entry',
        referencePrice: targetPrice,
        offset: riskDistance * thresholds.targetRMultiple,
      },
    },
    reasons,
    [],
    {
      regimeState: input.regime.regimeState,
      regimeAlignment: 'aligned',
      swingHigh: leg.impulseHigh,
      swingLow: leg.impulseLow,
      pullbackDepthPct: leg.retraceDepthPct,
      breakoutLevel: entryPrice,
      tags: ['trend_pullback', side],
      extra: {
        retraceHigh: leg.retraceHigh,
        retraceLow: leg.retraceLow,
        atr,
        emaFast,
        emaSlow,
      },
    }
  );
}

export function detectTrendPullbackCandidates(
  input: SetupDetectionInput,
  overrides: Partial<TrendPullbackThresholds> = {}
): SetupCandidate[] {
  const thresholds: TrendPullbackThresholds = { ...DEFAULT_TREND_PULLBACK_THRESHOLDS, ...overrides };
  const longCandidate = detectForSide('long', input, thresholds);
  const shortCandidate = detectForSide('short', input, thresholds);

  return [longCandidate, shortCandidate].filter((item): item is SetupCandidate => item != null);
}
