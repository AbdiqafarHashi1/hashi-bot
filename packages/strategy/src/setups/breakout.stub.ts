import type { TradeSide } from '@hashi-bot/core';

import type { SetupCandidate, SetupCode, SetupReason } from '../base/signal-domain.js';

import {
  buildSetupCandidate,
  maxHigh,
  minLow,
  roundToTick,
  sliceRecentCandles,
  type SetupDetectionInput,
} from './shared.js';

export interface BreakoutThresholds {
  boxLookback: number;
  minBarsInRange: number;
  maxBoxWidthAtr: number;
  minRangeTouches: number;
  closeOutsideBoxAtr: number;
  entryBufferAtr: number;
  stopBufferAtr: number;
  target1RMultiple: number;
  target2RMultiple: number;
  minBodyToRangeRatio: number;
}

export const BREAKOUT_SETUP_CODE: SetupCode = 'breakout:compression_breakout';

export const DEFAULT_BREAKOUT_THRESHOLDS: BreakoutThresholds = {
  boxLookback: 24,
  minBarsInRange: 8,
  maxBoxWidthAtr: 2.2,
  minRangeTouches: 3,
  closeOutsideBoxAtr: 0.05,
  entryBufferAtr: 0.05,
  stopBufferAtr: 0.15,
  target1RMultiple: 1.5,
  target2RMultiple: 2.5,
  minBodyToRangeRatio: 0.4,
};

interface BreakoutBox {
  boxHigh: number;
  boxLow: number;
  boxWidth: number;
  barsInBox: number;
  touchesHigh: number;
  touchesLow: number;
}

function bodyToRangeRatio(high: number, low: number, open: number, close: number): number {
  const range = high - low;
  if (range <= 0) {
    return 0;
  }

  return Math.abs(close - open) / range;
}

function buildBox(input: SetupDetectionInput, thresholds: BreakoutThresholds): BreakoutBox | null {
  const context = sliceRecentCandles(input.candles, thresholds.boxLookback);
  if (context.length < thresholds.minBarsInRange + 1) {
    return null;
  }

  const structureBars = context.slice(0, context.length - 1);
  if (structureBars.length < thresholds.minBarsInRange) {
    return null;
  }

  const boxHigh = maxHigh(structureBars);
  const boxLow = minLow(structureBars);
  const boxWidth = boxHigh - boxLow;

  if (boxWidth <= 0) {
    return null;
  }

  const tolerance = boxWidth * 0.12;
  let touchesHigh = 0;
  let touchesLow = 0;

  for (const candle of structureBars) {
    if (Math.abs(candle.high - boxHigh) <= tolerance) {
      touchesHigh += 1;
    }

    if (Math.abs(candle.low - boxLow) <= tolerance) {
      touchesLow += 1;
    }
  }

  return {
    boxHigh,
    boxLow,
    boxWidth,
    barsInBox: structureBars.length,
    touchesHigh,
    touchesLow,
  };
}

function regimeAllows(side: TradeSide, input: SetupDetectionInput): boolean {
  if (!input.regime.isTradable) {
    return false;
  }

  if (input.regime.regimeState === 'trending_bull') {
    return side === 'long';
  }

  if (input.regime.regimeState === 'trending_bear') {
    return side === 'short';
  }

  return input.regime.regimeState === 'expanding' || input.regime.regimeState === 'neutral';
}

function detectSide(
  side: TradeSide,
  input: SetupDetectionInput,
  thresholds: BreakoutThresholds,
  box: BreakoutBox
): SetupCandidate | null {
  if (!regimeAllows(side, input)) {
    return null;
  }

  const atr = input.snapshot.atr;
  if (atr == null || atr <= 0) {
    return null;
  }

  if (box.barsInBox < thresholds.minBarsInRange) {
    return null;
  }

  if (box.boxWidth > atr * thresholds.maxBoxWidthAtr) {
    return null;
  }

  if (box.touchesHigh < thresholds.minRangeTouches || box.touchesLow < thresholds.minRangeTouches) {
    return null;
  }

  const latest = input.candles[input.candles.length - 1];
  const prev = input.candles[input.candles.length - 2];
  if (!latest || !prev) {
    return null;
  }

  const closeOutsideDistance = atr * thresholds.closeOutsideBoxAtr;
  const brokeOut =
    side === 'long'
      ? latest.close > box.boxHigh + closeOutsideDistance
      : latest.close < box.boxLow - closeOutsideDistance;

  if (!brokeOut) {
    return null;
  }

  const confirmationBody = bodyToRangeRatio(latest.high, latest.low, latest.open, latest.close);
  if (confirmationBody < thresholds.minBodyToRangeRatio) {
    return null;
  }

  const noImmediateReject =
    side === 'long' ? latest.low >= box.boxLow && latest.close >= prev.close : latest.high <= box.boxHigh && latest.close <= prev.close;

  if (!noImmediateReject) {
    return null;
  }

  const entryBuffer = atr * thresholds.entryBufferAtr;
  const stopBuffer = atr * thresholds.stopBufferAtr;

  const entryPrice = roundToTick(
    side === 'long' ? Math.max(latest.high, box.boxHigh + entryBuffer) : Math.min(latest.low, box.boxLow - entryBuffer),
    input.symbolSpec
  );

  const stopPrice = roundToTick(
    side === 'long' ? box.boxLow - stopBuffer : box.boxHigh + stopBuffer,
    input.symbolSpec
  );

  const riskDistance = side === 'long' ? entryPrice - stopPrice : stopPrice - entryPrice;
  if (riskDistance <= 0) {
    return null;
  }

  const target1 = roundToTick(
    side === 'long' ? entryPrice + riskDistance * thresholds.target1RMultiple : entryPrice - riskDistance * thresholds.target1RMultiple,
    input.symbolSpec
  );

  const target2 = roundToTick(
    side === 'long' ? entryPrice + riskDistance * thresholds.target2RMultiple : entryPrice - riskDistance * thresholds.target2RMultiple,
    input.symbolSpec
  );

  const reasons: SetupReason[] = [
    'structure_confirmed',
    'trigger_confirmed',
    'volatility_acceptable',
    `box_width_atr=${(box.boxWidth / atr).toFixed(2)}`,
    `box_touches=${Math.min(box.touchesHigh, box.touchesLow)}`,
  ];

  return buildSetupCandidate(
    side,
    BREAKOUT_SETUP_CODE,
    input,
    {
      entry: {
        source: side === 'long' ? 'close_break_above_box_high_with_buffer' : 'close_break_below_box_low_with_buffer',
        referencePrice: entryPrice,
        offset: side === 'long' ? entryBuffer : -entryBuffer,
      },
      stop: {
        source: side === 'long' ? 'box_low_minus_atr_buffer' : 'box_high_plus_atr_buffer',
        referencePrice: stopPrice,
        offset: side === 'long' ? -stopBuffer : stopBuffer,
      },
      target: {
        source: 'r_multiple_projection_tp2_anchor',
        referencePrice: target2,
        notes: [`tp1=${target1}`, `tp2=${target2}`],
      },
    },
    reasons,
    [],
    {
      regimeState: input.regime.regimeState,
      regimeAlignment: input.regime.isTradable ? 'aligned' : 'unknown',
      swingHigh: box.boxHigh,
      swingLow: box.boxLow,
      breakoutLevel: side === 'long' ? box.boxHigh : box.boxLow,
      tags: ['breakout', 'compression', side],
      extra: {
        boxWidth: box.boxWidth,
        boxWidthAtr: box.boxWidth / atr,
        barsInBox: box.barsInBox,
        touchesHigh: box.touchesHigh,
        touchesLow: box.touchesLow,
        target1,
        target2,
      },
    }
  );
}

export function detectBreakoutCandidates(
  input: SetupDetectionInput,
  overrides: Partial<BreakoutThresholds> = {}
): SetupCandidate[] {
  const thresholds: BreakoutThresholds = { ...DEFAULT_BREAKOUT_THRESHOLDS, ...overrides };

  const box = buildBox(input, thresholds);
  if (!box) {
    return [];
  }

  const longCandidate = detectSide('long', input, thresholds, box);
  const shortCandidate = detectSide('short', input, thresholds, box);

  return [longCandidate, shortCandidate].filter((candidate): candidate is SetupCandidate => candidate != null);
}
