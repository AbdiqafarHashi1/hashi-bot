import type { SizingInput, SizingResult } from './common.js';
import { sizeCryptoPosition } from './crypto-sizing.js';
import { sizeForexPosition } from './forex-sizing.js';

export * from './common.js';
export * from './crypto-sizing.js';
export * from './forex-sizing.js';

export function sizePosition(input: SizingInput): SizingResult {
  if (input.symbolSpec.marketType === 'crypto') {
    return sizeCryptoPosition(input);
  }

  if (input.symbolSpec.marketType === 'forex') {
    return sizeForexPosition(input);
  }

  return {
    riskAmount: 0,
    stopDistance: Math.abs(input.signal.entry - input.signal.stop),
    normalizedRiskPct: 0
  };
}
