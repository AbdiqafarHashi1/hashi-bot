import type { SymbolSpec } from '@hashi-bot/core';

import { clampPositive, floorToPrecision, type SizingInput, type SizingResult } from './common.js';

function resolveMinNotional(symbolSpec: SymbolSpec, minNotional?: number): number {
  if (symbolSpec.marketType !== 'crypto') {
    return 0;
  }

  return minNotional ?? 5;
}

export function sizeCryptoPosition(input: SizingInput): SizingResult {
  const riskAmount = clampPositive((input.equity * input.riskPct) / 100);
  const stopDistance = Math.abs(input.signal.entry - input.signal.stop);

  if (riskAmount === 0 || stopDistance <= 0) {
    return { riskAmount, stopDistance, normalizedRiskPct: 0 };
  }

  const rawQty = riskAmount / stopDistance;
  const qty = floorToPrecision(rawQty, input.symbolSpec.qtyPrecision);
  const notional = qty * input.signal.entry;

  const minNotional = resolveMinNotional(input.symbolSpec, input.minNotional);
  if (qty <= 0 || (minNotional > 0 && notional < minNotional)) {
    return { riskAmount, stopDistance, qty: 0, notional: 0, normalizedRiskPct: 0 };
  }

  const normalizedRiskAmount = qty * stopDistance;
  const normalizedRiskPct = input.equity > 0 ? (normalizedRiskAmount / input.equity) * 100 : 0;

  return {
    riskAmount,
    stopDistance,
    qty,
    notional,
    normalizedRiskPct
  };
}
