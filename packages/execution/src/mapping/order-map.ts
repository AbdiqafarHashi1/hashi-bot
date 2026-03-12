import type { EpochMs, SymbolSpec, TradeSide } from '@hashi-bot/core';
import type {
  ExecutionOrderSide,
  ExecutionRequest,
  ExecutionTimeInForce
} from '../types/execution-domain.js';
import type { NormalizedOrderSet, PlanOrderNormalizationInput, VenueOrderPayload } from '../base/order.types.js';

export interface NormalizationOptions {
  defaultTimeInForce?: ExecutionTimeInForce;
  allowFractionalLots?: boolean;
}

function precisionFactor(precision: number): number {
  return 10 ** Math.max(0, precision);
}

export function normalizePrice(price: number, symbolSpec: SymbolSpec): number {
  const factor = precisionFactor(symbolSpec.pricePrecision);
  return Math.round(price * factor) / factor;
}

export function normalizeQuantity(quantity: number, symbolSpec: SymbolSpec): number {
  const factor = precisionFactor(symbolSpec.qtyPrecision);
  return Math.floor(Math.max(0, quantity) * factor) / factor;
}

export function normalizeLots(lots: number, symbolSpec: SymbolSpec, allowFractional = true): number {
  if (!allowFractional || !symbolSpec.lotStep || symbolSpec.lotStep <= 0) {
    return Math.max(0, lots);
  }

  const steps = Math.floor(Math.max(0, lots) / symbolSpec.lotStep);
  return steps * symbolSpec.lotStep;
}

export function mapTradeSideToExecutionSide(side: TradeSide): ExecutionOrderSide {
  return side === 'long' ? 'buy' : 'sell';
}

export function buildVenueOrderPayload(request: ExecutionRequest, symbolSpec: SymbolSpec, opts?: NormalizationOptions): VenueOrderPayload {
  const quantity = normalizeQuantity(request.quantity, symbolSpec);

  return {
    symbol: request.venueSymbol,
    side: request.side,
    type: request.orderType,
    quantity,
    quantityLots: request.quantityLots !== undefined
      ? normalizeLots(request.quantityLots, symbolSpec, opts?.allowFractionalLots ?? true)
      : undefined,
    price: request.price !== undefined ? normalizePrice(request.price, symbolSpec) : undefined,
    stopPrice: request.stopPrice !== undefined ? normalizePrice(request.stopPrice, symbolSpec) : undefined,
    stopLossPrice: request.stopLossPrice !== undefined ? normalizePrice(request.stopLossPrice, symbolSpec) : undefined,
    takeProfitPrice: request.takeProfitPrice !== undefined ? normalizePrice(request.takeProfitPrice, symbolSpec) : undefined,
    timeInForce: request.timeInForce ?? opts?.defaultTimeInForce,
    reduceOnly: request.reduceOnly,
    clientOrderId: request.clientOrderId,
    submittedAtTs: request.submittedAtTs
  };
}

function buildPlanPayload(input: {
  venueSymbol: string;
  side: ExecutionOrderSide;
  quantity: number;
  quantityLots?: number;
  orderType: 'limit' | 'stop';
  submittedAtTs: EpochMs;
  price?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
}, symbolSpec: SymbolSpec, opts?: NormalizationOptions): VenueOrderPayload {
  return {
    symbol: input.venueSymbol,
    side: input.side,
    type: input.orderType,
    quantity: normalizeQuantity(input.quantity, symbolSpec),
    quantityLots: input.quantityLots !== undefined
      ? normalizeLots(input.quantityLots, symbolSpec, opts?.allowFractionalLots ?? true)
      : undefined,
    price: input.price !== undefined ? normalizePrice(input.price, symbolSpec) : undefined,
    stopPrice: input.stopPrice !== undefined ? normalizePrice(input.stopPrice, symbolSpec) : undefined,
    reduceOnly: input.reduceOnly,
    timeInForce: opts?.defaultTimeInForce,
    submittedAtTs: input.submittedAtTs
  };
}

export function normalizePlanToOrderSet(
  input: PlanOrderNormalizationInput,
  symbolSpec: SymbolSpec,
  opts?: NormalizationOptions
): NormalizedOrderSet {
  const quantity = input.plan.qty ?? 0;
  const quantityLots = input.plan.lots;
  const entrySide = mapTradeSideToExecutionSide(input.plan.side);
  const exitSide: ExecutionOrderSide = entrySide === 'buy' ? 'sell' : 'buy';

  const primary = buildPlanPayload(
    {
      venueSymbol: input.venueSymbol,
      side: entrySide,
      orderType: 'limit',
      quantity,
      quantityLots,
      price: input.plan.entry,
      submittedAtTs: input.submittedAtTs
    },
    symbolSpec,
    opts
  );

  let stopLoss: VenueOrderPayload | undefined;
  let takeProfit: VenueOrderPayload | undefined;

  if (input.includeBracket) {
    stopLoss = buildPlanPayload(
      {
        venueSymbol: input.venueSymbol,
        side: exitSide,
        orderType: 'stop',
        quantity,
        quantityLots,
        stopPrice: input.plan.stop,
        reduceOnly: true,
        submittedAtTs: input.submittedAtTs
      },
      symbolSpec,
      opts
    );

    takeProfit = buildPlanPayload(
      {
        venueSymbol: input.venueSymbol,
        side: exitSide,
        orderType: 'limit',
        quantity,
        quantityLots,
        price: input.plan.tp1,
        reduceOnly: true,
        submittedAtTs: input.submittedAtTs
      },
      symbolSpec,
      opts
    );
  }

  return {
    symbolCode: input.plan.symbolCode,
    accountRef: input.accountRef,
    primary,
    bracket: input.includeBracket ? { stopLoss, takeProfit } : undefined
  };
}
