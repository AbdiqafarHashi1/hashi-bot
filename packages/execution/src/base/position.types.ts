import type { EpochMs, SymbolCode, TradeSide } from '@hashi-bot/core';
import type { RawVenuePayload, VenueAccountRef } from '../types/execution-domain.js';

export interface PositionSyncFilter {
  symbolCode?: SymbolCode;
  side?: TradeSide;
  includeClosed?: boolean;
}

export interface PositionDelta {
  symbolCode: SymbolCode;
  previousQuantity: number;
  currentQuantity: number;
  observedAtTs: EpochMs;
}

export interface PositionSyncState {
  accountRef: VenueAccountRef;
  latestSyncTs: EpochMs;
  deltas: PositionDelta[];
  raw?: RawVenuePayload;
}
