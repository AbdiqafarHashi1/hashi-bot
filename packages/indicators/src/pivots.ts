export interface PivotPoint {
  index: number;
  value: number;
}

export interface PivotDetectionResult {
  pivotHighs: PivotPoint[];
  pivotLows: PivotPoint[];
}

function isPivotHighAt(
  highs: readonly number[],
  index: number,
  leftBars: number,
  rightBars: number
): boolean {
  const candidate = highs[index];
  if (candidate == null) {
    return false;
  }

  for (let i = index - leftBars; i < index; i += 1) {
    if ((highs[i] ?? Number.NEGATIVE_INFINITY) >= candidate) {
      return false;
    }
  }

  for (let i = index + 1; i <= index + rightBars; i += 1) {
    if ((highs[i] ?? Number.NEGATIVE_INFINITY) > candidate) {
      return false;
    }
  }

  return true;
}

function isPivotLowAt(
  lows: readonly number[],
  index: number,
  leftBars: number,
  rightBars: number
): boolean {
  const candidate = lows[index];
  if (candidate == null) {
    return false;
  }

  for (let i = index - leftBars; i < index; i += 1) {
    if ((lows[i] ?? Number.POSITIVE_INFINITY) <= candidate) {
      return false;
    }
  }

  for (let i = index + 1; i <= index + rightBars; i += 1) {
    if ((lows[i] ?? Number.POSITIVE_INFINITY) < candidate) {
      return false;
    }
  }

  return true;
}

export function detectPivotPoints(
  highs: readonly number[],
  lows: readonly number[],
  leftBars: number,
  rightBars: number
): PivotDetectionResult {
  if (!Number.isInteger(leftBars) || !Number.isInteger(rightBars) || leftBars < 1 || rightBars < 1) {
    throw new Error(
      `Pivot windows must be positive integers. Received leftBars=${leftBars}, rightBars=${rightBars}`
    );
  }

  if (highs.length !== lows.length) {
    throw new Error('High and low series length mismatch in pivot detection.');
  }

  const pivotHighs: PivotPoint[] = [];
  const pivotLows: PivotPoint[] = [];

  const start = leftBars;
  const end = highs.length - rightBars;

  for (let i = start; i < end; i += 1) {
    if (isPivotHighAt(highs, i, leftBars, rightBars)) {
      pivotHighs.push({ index: i, value: highs[i] ?? 0 });
    }

    if (isPivotLowAt(lows, i, leftBars, rightBars)) {
      pivotLows.push({ index: i, value: lows[i] ?? 0 });
    }
  }

  return { pivotHighs, pivotLows };
}
