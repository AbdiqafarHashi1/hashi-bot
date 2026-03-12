import type { ExecutionVenue, SymbolCode, SymbolSpec } from '@hashi-bot/core';

export interface VenueSymbolMap {
  ccxt?: string;
  ctrader?: string;
}

export interface SymbolMapEntry {
  symbolCode: SymbolCode;
  defaultVenueSymbol: string;
  venues?: VenueSymbolMap;
}

export interface SymbolMapConfig {
  entries: SymbolMapEntry[];
}

export function createSymbolMap(config: SymbolMapConfig): Map<SymbolCode, SymbolMapEntry> {
  return new Map(config.entries.map((entry) => [entry.symbolCode, entry]));
}

export function resolveVenueSymbol(
  symbolCode: SymbolCode,
  venue: ExecutionVenue,
  symbolMap: Map<SymbolCode, SymbolMapEntry>
): string {
  const entry = symbolMap.get(symbolCode);
  if (!entry) {
    throw new Error(`Missing symbol map for ${symbolCode}`);
  }

  if (venue === 'ccxt' && entry.venues?.ccxt) {
    return entry.venues.ccxt;
  }

  if (venue === 'ctrader' && entry.venues?.ctrader) {
    return entry.venues.ctrader;
  }

  return entry.defaultVenueSymbol;
}

export function inferForexVenueSymbol(symbolSpec: SymbolSpec): string {
  return `${symbolSpec.baseCurrency}${symbolSpec.quoteCurrency}`;
}

export function inferCryptoVenueSymbol(symbolSpec: SymbolSpec): string {
  return `${symbolSpec.baseCurrency}/${symbolSpec.quoteCurrency}`;
}

export function buildDefaultVenueSymbol(symbolSpec: SymbolSpec, venue: ExecutionVenue): string {
  if (symbolSpec.marketType === 'forex') {
    return inferForexVenueSymbol(symbolSpec);
  }

  if (venue === 'ccxt') {
    return inferCryptoVenueSymbol(symbolSpec);
  }

  return `${symbolSpec.baseCurrency}${symbolSpec.quoteCurrency}`;
}
