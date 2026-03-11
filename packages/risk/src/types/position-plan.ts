import type { ProfileCode, StrategySignal, SymbolCode, TradeSide } from '@hashi-bot/core';

export interface SignalReference {
  signalId?: string;
  setupCode: string;
  createdAtTs: number;
}

export interface FillAssumptions {
  slippageBps?: number;
  feeBps?: number;
}

export interface PositionPlan {
  profileCode: ProfileCode;
  signalRef: SignalReference;
  symbolCode: SymbolCode;
  side: TradeSide;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  riskPct: number;
  riskAmount: number;
  qty?: number;
  lots?: number;
  notional?: number;
  assumptions?: FillAssumptions;
  sourceSignal?: StrategySignal;
}
