import type { Candle } from '@hashi-bot/core';

export function trueRange(current: Candle, previousClose?: number): number {
  if (previousClose == null) {
    return current.high - current.low;
  }

  const highLow = current.high - current.low;
  const highClose = Math.abs(current.high - previousClose);
  const lowClose = Math.abs(current.low - previousClose);

  return Math.max(highLow, highClose, lowClose);
}

export function calculateTrueRangeSeries(candles: readonly Candle[]): number[] {
  if (candles.length === 0) {
    return [];
  }

  const ranges: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const current = candles[i];
    if (!current) {
      continue;
    }
    const prevClose = candles[i - 1]?.close;
    ranges.push(trueRange(current, prevClose));
  }

  return ranges;
}

export function calculateAtrSeries(
  candles: readonly Candle[],
  period: number
): Array<number | null> {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(`ATR period must be a positive integer. Received: ${period}`);
  }

  const tr = calculateTrueRangeSeries(candles);
  const atr: Array<number | null> = Array(tr.length).fill(null);

  if (tr.length < period) {
    return atr;
  }

  let trSum = 0;
  for (let i = 0; i < period; i += 1) {
    trSum += tr[i] ?? 0;
  }

  let prevAtr = trSum / period;
  atr[period - 1] = prevAtr;

  for (let i = period; i < tr.length; i += 1) {
    const trValue = tr[i] ?? 0;
    prevAtr = (prevAtr * (period - 1) + trValue) / period;
    atr[i] = prevAtr;
  }

  return atr;
}
