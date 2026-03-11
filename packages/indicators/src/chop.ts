import type { Candle } from '@hashi-bot/core';

import { calculateTrueRangeSeries } from './atr.js';

export type ChopState = 'trending' | 'neutral' | 'choppy';

export interface ChopThresholds {
  trendingMax: number;
  choppyMin: number;
}

export interface ChopResult {
  value: number | null;
  state: ChopState | null;
}

const DEFAULT_THRESHOLDS: ChopThresholds = {
  trendingMax: 38.2,
  choppyMin: 61.8,
};

export function calculateChopSeries(
  candles: readonly Candle[],
  period: number
): Array<number | null> {
  if (!Number.isInteger(period) || period <= 1) {
    throw new Error(`CHOP period must be an integer > 1. Received: ${period}`);
  }

  const result: Array<number | null> = Array(candles.length).fill(null);
  if (candles.length < period) {
    return result;
  }

  const trSeries = calculateTrueRangeSeries(candles);

  for (let i = period - 1; i < candles.length; i += 1) {
    let trSum = 0;
    let highestHigh = Number.NEGATIVE_INFINITY;
    let lowestLow = Number.POSITIVE_INFINITY;

    for (let j = i - period + 1; j <= i; j += 1) {
      trSum += trSeries[j] ?? 0;
      const candle = candles[j];
      if (!candle) {
        continue;
      }
      highestHigh = Math.max(highestHigh, candle.high);
      lowestLow = Math.min(lowestLow, candle.low);
    }

    const range = highestHigh - lowestLow;
    if (range <= 0 || trSum <= 0) {
      result[i] = 100;
      continue;
    }

    result[i] = (100 * Math.log10(trSum / range)) / Math.log10(period);
  }

  return result;
}

export function classifyChopState(
  chopValue: number | null,
  thresholds: ChopThresholds = DEFAULT_THRESHOLDS
): ChopState | null {
  if (chopValue == null) {
    return null;
  }

  if (chopValue <= thresholds.trendingMax) {
    return 'trending';
  }

  if (chopValue >= thresholds.choppyMin) {
    return 'choppy';
  }

  return 'neutral';
}

export function calculateChopStateSeries(
  candles: readonly Candle[],
  period: number,
  thresholds: ChopThresholds = DEFAULT_THRESHOLDS
): ChopResult[] {
  const chopValues = calculateChopSeries(candles, period);
  return chopValues.map((value) => ({
    value,
    state: classifyChopState(value, thresholds),
  }));
}
