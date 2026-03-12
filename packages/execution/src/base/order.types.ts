import type { EpochMs, SymbolCode } from '@hashi-bot/core';
import type { PositionPlan } from '@hashi-bot/risk';
import type {
  ExecutionOrderSide,
  ExecutionOrderType,
  ExecutionRequest,
  ExecutionTimeInForce,
  RawVenuePayload,
  VenueAccountRef,
  VenueSymbol
} from '../types/execution-domain.js';

export interface BracketOrderRequest {
  entry: ExecutionRequest;
  stopLoss?: ExecutionRequest;
  takeProfit?: ExecutionRequest;
}

export interface VenueOrderPayload {
  symbol: VenueSymbol;
  side: ExecutionOrderSide;
  type: ExecutionOrderType;
  quantity: number;
  quantityLots?: number;
  price?: number;
  stopPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  timeInForce?: ExecutionTimeInForce;
  reduceOnly?: boolean;
  clientOrderId?: string;
  submittedAtTs: EpochMs;
  meta?: RawVenuePayload;
}

export interface OrderNormalizationInput {
  venueSymbol: VenueSymbol;
  accountRef: VenueAccountRef;
  request: ExecutionRequest;
}

export interface PlanOrderNormalizationInput {
  venueSymbol: VenueSymbol;
  accountRef: VenueAccountRef;
  plan: PositionPlan;
  submittedAtTs: EpochMs;
  includeBracket?: boolean;
}

export interface NormalizedOrderSet {
  symbolCode: SymbolCode;
  accountRef: VenueAccountRef;
  primary: VenueOrderPayload;
  bracket?: {
    stopLoss?: VenueOrderPayload;
    takeProfit?: VenueOrderPayload;
  };
}
