import type { Candle } from '@hashi-bot/core';

import { calculateTrueRangeSeries } from './atr.js';

export interface AdxResult {
  plusDi: Array<number | null>;
  minusDi: Array<number | null>;
  dx: Array<number | null>;
  adx: Array<number | null>;
}

export function calculateAdxSeries(
  candles: readonly Candle[],
  period: number
): AdxResult {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(`ADX period must be a positive integer. Received: ${period}`);
  }

  const length = candles.length;
  const plusDi: Array<number | null> = Array(length).fill(null);
  const minusDi: Array<number | null> = Array(length).fill(null);
  const dx: Array<number | null> = Array(length).fill(null);
  const adx: Array<number | null> = Array(length).fill(null);

  if (length <= period) {
    return { plusDi, minusDi, dx, adx };
  }

  const trSeries = calculateTrueRangeSeries(candles);
  const plusDmRaw: number[] = Array(length).fill(0);
  const minusDmRaw: number[] = Array(length).fill(0);

  for (let i = 1; i < length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    if (!current || !previous) {
      continue;
    }

    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;

    plusDmRaw[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDmRaw[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let trSmoothed = 0;
  let plusDmSmoothed = 0;
  let minusDmSmoothed = 0;

  for (let i = 1; i <= period; i += 1) {
    trSmoothed += trSeries[i] ?? 0;
    plusDmSmoothed += plusDmRaw[i] ?? 0;
    minusDmSmoothed += minusDmRaw[i] ?? 0;
  }

  for (let i = period; i < length; i += 1) {
    if (i > period) {
      trSmoothed = trSmoothed - trSmoothed / period + (trSeries[i] ?? 0);
      plusDmSmoothed = plusDmSmoothed - plusDmSmoothed / period + (plusDmRaw[i] ?? 0);
      minusDmSmoothed =
        minusDmSmoothed - minusDmSmoothed / period + (minusDmRaw[i] ?? 0);
    }

    if (trSmoothed === 0) {
      plusDi[i] = 0;
      minusDi[i] = 0;
      dx[i] = 0;
      continue;
    }

    const currentPlusDi = (plusDmSmoothed / trSmoothed) * 100;
    const currentMinusDi = (minusDmSmoothed / trSmoothed) * 100;
    const diDenominator = currentPlusDi + currentMinusDi;

    plusDi[i] = currentPlusDi;
    minusDi[i] = currentMinusDi;
    dx[i] = diDenominator === 0
      ? 0
      : (Math.abs(currentPlusDi - currentMinusDi) / diDenominator) * 100;
  }

  const firstAdxIndex = period * 2 - 1;
  if (firstAdxIndex >= length) {
    return { plusDi, minusDi, dx, adx };
  }

  let dxSum = 0;
  for (let i = period; i <= firstAdxIndex; i += 1) {
    dxSum += dx[i] ?? 0;
  }

  let prevAdx = dxSum / period;
  adx[firstAdxIndex] = prevAdx;

  for (let i = firstAdxIndex + 1; i < length; i += 1) {
    const currentDx = dx[i] ?? 0;
    prevAdx = (prevAdx * (period - 1) + currentDx) / period;
    adx[i] = prevAdx;
  }

  return { plusDi, minusDi, dx, adx };
}
