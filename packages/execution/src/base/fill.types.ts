import type { EpochMs, ExecutionVenue, SymbolCode } from '@hashi-bot/core';
import type { ExecutionOrderSide, ExecutionOrderType, RawVenuePayload, VenueAccountRef, VenueOrderId } from '../types/execution-domain.js';

export interface VenueFill {
  venue: ExecutionVenue;
  accountRef: VenueAccountRef;
  orderId: VenueOrderId;
  fillId?: string;
  symbolCode: SymbolCode;
  venueSymbol: string;
  side: ExecutionOrderSide;
  orderType: ExecutionOrderType;
  quantity: number;
  quantityLots?: number;
  price: number;
  fee?: number;
  feeAsset?: string;
  executedAtTs: EpochMs;
  raw?: RawVenuePayload;
}

export interface FillSummary {
  fills: VenueFill[];
  filledQuantity: number;
  weightedAveragePrice?: number;
  totalFees?: number;
}
