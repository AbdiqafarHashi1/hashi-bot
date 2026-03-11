import type { SymbolSpec } from '@hashi-bot/core';

export function getPipSize(symbolSpec: SymbolSpec): number {
  return symbolSpec.pipSize ?? symbolSpec.tickSize;
}

export function normalizeMoveToPips(move: number, symbolSpec: SymbolSpec): number {
  const pipSize = getPipSize(symbolSpec);
  if (pipSize === 0) {
    return 0;
  }

  return move / pipSize;
}

export function normalizeMoveToTicks(move: number, symbolSpec: SymbolSpec): number {
  if (symbolSpec.tickSize === 0) {
    return 0;
  }

  return move / symbolSpec.tickSize;
}

export function safePercentFromPriceMove(move: number, referencePrice: number): number | null {
  if (referencePrice === 0) {
    return null;
  }

  return (move / referencePrice) * 100;
}
