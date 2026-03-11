import type { Candle, TradeSide } from '@hashi-bot/core';

import type { SetupCandidate, SetupCode, SetupReason } from '../base/signal-domain.js';

import {
  buildSetupCandidate,
  maxHigh,
  minLow,
  roundToTick,
  sliceRecentCandles,
  type SetupDetectionInput,
} from './shared.js';

export interface PullbackV2Thresholds {
  contextLookback: number;
  impulseWindow: number;
  retraceWindow: number;
  minCandles: number;
  minImpulseAtrMultiple: number;
  minRetraceDepthPct: number;
  maxRetraceDepthPct: number;
  stopAtrBuffer: number;
  targetRMultiple: number;
  minBodyToRangeRatio: number;
}

export const PULLBACK_V2_SETUP_CODE: SetupCode = 'pullback:pullback_v2';

export const DEFAULT_PULLBACK_V2_THRESHOLDS: PullbackV2Thresholds = {
  contextLookback: 72,
  impulseWindow: 24,
  retraceWindow: 12,
  minCandles: 90,
  minImpulseAtrMultiple: 2,
  minRetraceDepthPct: 30,
  maxRetraceDepthPct: 55,
  stopAtrBuffer: 0.2,
  targetRMultiple: 2.5,
  minBodyToRangeRatio: 0.45,
};

function bodyToRangeRatio(candle: Candle): number {
  const range = candle.high - candle.low;
  if (range <= 0) {
    return 0;
  }

  return Math.abs(candle.close - candle.open) / range;
}

function hasHigherLowStructure(candles: readonly Candle[]): boolean {
  if (candles.length < 3) {
    return false;
  }

  const a = candles[candles.length - 3];
  const b = candles[candles.length - 2];
  const c = candles[candles.length - 1];
  if (!a || !b || !c) {
    return false;
  }

  return a.low < b.low && b.low <= c.low;
}

function hasLowerHighStructure(candles: readonly Candle[]): boolean {
  if (candles.length < 3) {
    return false;
  }

  const a = candles[candles.length - 3];
  const b = candles[candles.length - 2];
  const c = candles[candles.length - 1];
  if (!a || !b || !c) {
    return false;
  }

  return a.high > b.high && b.high >= c.high;
}

function detectSide(
  side: TradeSide,
  input: SetupDetectionInput,
  thresholds: PullbackV2Thresholds
): SetupCandidate | null {
  if (input.candles.length < thresholds.minCandles) {
    return null;
  }

  if (!input.regime.isTradable) {
    return null;
  }

  if (side === 'long' && input.regime.regimeState !== 'trending_bull') {
    return null;
  }

  if (side === 'short' && input.regime.regimeState !== 'trending_bear') {
    return null;
  }

  const atr = input.snapshot.atr;
  const emaFast = input.snapshot.emaFast;
  if (atr == null || atr <= 0 || emaFast == null) {
    return null;
  }

  const context = sliceRecentCandles(input.candles, thresholds.contextLookback);
  if (context.length < thresholds.impulseWindow + thresholds.retraceWindow) {
    return null;
  }

  const impulse = context.slice(0, thresholds.impulseWindow);
  const retrace = context.slice(thresholds.impulseWindow, thresholds.impulseWindow + thresholds.retraceWindow);
  const confirmation = context.slice(-3);
  const latest = context[context.length - 1];
  const prev = context[context.length - 2];

  if (!latest || !prev || retrace.length === 0 || confirmation.length < 3) {
    return null;
  }

  const impulseHigh = maxHigh(impulse);
  const impulseLow = minLow(impulse);
  const impulseMove = impulseHigh - impulseLow;

  if (impulseMove < atr * thresholds.minImpulseAtrMultiple) {
    return null;
  }

  const retraceHigh = maxHigh(retrace);
  const retraceLow = minLow(retrace);

  const retraceDepthPct =
    side === 'long'
      ? ((impulseHigh - retraceLow) / impulseMove) * 100
      : ((retraceHigh - impulseLow) / impulseMove) * 100;

  if (retraceDepthPct < thresholds.minRetraceDepthPct || retraceDepthPct > thresholds.maxRetraceDepthPct) {
    return null;
  }

  const structureOk = side === 'long' ? hasHigherLowStructure(confirmation) : hasLowerHighStructure(confirmation);

  if (!structureOk) {
    return null;
  }

  const triggerOk =
    side === 'long'
      ? latest.close > prev.high && latest.close > emaFast
      : latest.close < prev.low && latest.close < emaFast;

  if (!triggerOk || bodyToRangeRatio(latest) < thresholds.minBodyToRangeRatio) {
    return null;
  }

  const entryPrice = roundToTick(side === 'long' ? latest.high : latest.low, input.symbolSpec);
  const stopAnchor = side === 'long' ? retraceLow : retraceHigh;
  const stopOffset = atr * thresholds.stopAtrBuffer * (side === 'long' ? -1 : 1);
  const stopPrice = roundToTick(stopAnchor + stopOffset, input.symbolSpec);
  const riskDistance = side === 'long' ? entryPrice - stopPrice : stopPrice - entryPrice;

  if (riskDistance <= 0) {
    return null;
  }

  const targetPrice = roundToTick(
    side === 'long'
      ? entryPrice + riskDistance * thresholds.targetRMultiple
      : entryPrice - riskDistance * thresholds.targetRMultiple,
    input.symbolSpec
  );

  const reasons: SetupReason[] = [
    'regime_aligned',
    'structure_confirmed',
    'trigger_confirmed',
    `impulse_atr_multiple=${(impulseMove / atr).toFixed(2)}`,
    `retrace_depth_pct=${retraceDepthPct.toFixed(2)}`,
  ];

  return buildSetupCandidate(
    side,
    PULLBACK_V2_SETUP_CODE,
    input,
    {
      entry: {
        source: side === 'long' ? 'strong_confirmation_break_high' : 'strong_confirmation_break_low',
        referencePrice: entryPrice,
      },
      stop: {
        source: side === 'long' ? 'below_retrace_hl_with_atr_buffer' : 'above_retrace_lh_with_atr_buffer',
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
      swingHigh: impulseHigh,
      swingLow: impulseLow,
      pullbackDepthPct: retraceDepthPct,
      breakoutLevel: entryPrice,
      tags: ['pullback_v2', side],
      extra: {
        impulseMove,
        impulseAtrMultiple: impulseMove / atr,
        retraceHigh,
        retraceLow,
      },
    }
  );
}

export function detectPullbackV2Candidates(
  input: SetupDetectionInput,
  overrides: Partial<PullbackV2Thresholds> = {}
): SetupCandidate[] {
  const thresholds: PullbackV2Thresholds = { ...DEFAULT_PULLBACK_V2_THRESHOLDS, ...overrides };

  const longCandidate = detectSide('long', input, thresholds);
  const shortCandidate = detectSide('short', input, thresholds);

  return [longCandidate, shortCandidate].filter((candidate): candidate is SetupCandidate => candidate != null);
}
