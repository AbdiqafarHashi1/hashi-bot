import type { EpochMs, RunId, SymbolCode, TradeSide } from '@hashi-bot/core';
import type { PositionPlan } from '@hashi-bot/risk';
import type { LifecycleTransition, TradeLifecycleState } from './trade-lifecycle.js';

export type SimulatedOrderType = 'market' | 'limit' | 'stop';
export type SimulatedOrderStatus = 'created' | 'filled' | 'cancelled' | 'rejected' | 'expired';

export interface SimulatedOrder {
  orderId: string;
  symbolCode: SymbolCode;
  side: TradeSide;
  type: SimulatedOrderType;
  status: SimulatedOrderStatus;
  requestedPrice?: number;
  executedPrice?: number;
  qty?: number;
  lots?: number;
  notional?: number;
  feePaid?: number;
  slippagePaid?: number;
  submittedAtTs: EpochMs;
  updatedAtTs: EpochMs;
}

export interface SimulatedPosition {
  positionId: string;
  runId: RunId;
  symbolCode: SymbolCode;
  side: TradeSide;
  state: TradeLifecycleState;
  entryPrice?: number;
  stopPrice: number;
  tp1Price: number;
  tp2Price: number;
  qty?: number;
  lots?: number;
  remainingQty?: number;
  openedAtTs?: EpochMs;
  closedAtTs?: EpochMs;
  realizedPnl?: number;
  unrealizedPnl?: number;
}

export interface SimulatedTrade {
  tradeId: string;
  runId: RunId;
  symbolCode: SymbolCode;
  side: TradeSide;
  setupCode: string;
  lifecycleState: TradeLifecycleState;
  transitions: LifecycleTransition[];
  barsInTrade: number;
  plan: PositionPlan;
  position: SimulatedPosition;
  orders: SimulatedOrder[];
  entryFilledAtTs?: EpochMs;
  tp1FilledAtTs?: EpochMs;
  exitFilledAtTs?: EpochMs;
  closeReason?: string;
  grossPnl?: number;
  netPnl?: number;
  totalFees?: number;
  totalSlippage?: number;
  roiPct?: number;
}
