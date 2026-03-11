export interface EmaOptions {
  seedWithSma?: boolean;
}

export function calculateEmaSeries(
  values: readonly number[],
  period: number,
  options: EmaOptions = {}
): Array<number | null> {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(`EMA period must be a positive integer. Received: ${period}`);
  }

  const result: Array<number | null> = Array(values.length).fill(null);
  if (values.length === 0) {
    return result;
  }

  const multiplier = 2 / (period + 1);
  const seedWithSma = options.seedWithSma ?? true;

  if (seedWithSma) {
    if (values.length < period) {
      return result;
    }

    let sma = 0;
    for (let i = 0; i < period; i += 1) {
      sma += values[i] ?? 0;
    }

    let prevEma = sma / period;
    result[period - 1] = prevEma;

    for (let i = period; i < values.length; i += 1) {
      const current = values[i] ?? 0;
      prevEma = (current - prevEma) * multiplier + prevEma;
      result[i] = prevEma;
    }

    return result;
  }

  let prevEma = values[0] ?? 0;
  result[0] = prevEma;

  for (let i = 1; i < values.length; i += 1) {
    const current = values[i] ?? 0;
    prevEma = (current - prevEma) * multiplier + prevEma;
    result[i] = prevEma;
  }

  return result;
}
