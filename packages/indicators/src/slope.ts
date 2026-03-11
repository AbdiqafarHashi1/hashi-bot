export interface SlopeResult {
  slope: number;
  slopePercent: number;
}

export function calculateWindowSlope(
  values: readonly number[],
  startIndex: number,
  length: number
): SlopeResult | null {
  if (!Number.isInteger(length) || length < 2) {
    throw new Error(`Slope length must be an integer >= 2. Received: ${length}`);
  }

  if (!Number.isInteger(startIndex) || startIndex < 0) {
    throw new Error(`Slope startIndex must be a non-negative integer. Received: ${startIndex}`);
  }

  if (startIndex + length > values.length) {
    return null;
  }

  const n = length;
  const meanX = (n - 1) / 2;

  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumY += values[startIndex + i] ?? 0;
  }

  const meanY = sumY / n;
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i += 1) {
    const x = i;
    const y = values[startIndex + i] ?? 0;
    const xDiff = x - meanX;
    numerator += xDiff * (y - meanY);
    denominator += xDiff * xDiff;
  }

  if (denominator === 0) {
    return { slope: 0, slopePercent: 0 };
  }

  const slope = numerator / denominator;
  const slopePercent = meanY === 0 ? 0 : (slope / meanY) * 100;

  return { slope, slopePercent };
}

export function calculateSlopeSeries(
  values: readonly number[],
  lookback: number
): Array<SlopeResult | null> {
  const result: Array<SlopeResult | null> = Array(values.length).fill(null);

  if (!Number.isInteger(lookback) || lookback < 2) {
    throw new Error(`Slope lookback must be an integer >= 2. Received: ${lookback}`);
  }

  for (let endIndex = lookback - 1; endIndex < values.length; endIndex += 1) {
    const startIndex = endIndex - lookback + 1;
    result[endIndex] = calculateWindowSlope(values, startIndex, lookback);
  }

  return result;
}

export function calculateSimpleSlopePercent(
  values: readonly number[],
  lookback: number
): Array<number | null> {
  if (!Number.isInteger(lookback) || lookback < 1) {
    throw new Error(`Simple slope lookback must be an integer >= 1. Received: ${lookback}`);
  }

  const result: Array<number | null> = Array(values.length).fill(null);

  for (let i = lookback; i < values.length; i += 1) {
    const current = values[i] ?? 0;
    const previous = values[i - lookback] ?? 0;

    result[i] = previous === 0 ? 0 : ((current - previous) / previous) * 100;
  }

  return result;
}
