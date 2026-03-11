import type { Candle, TradeSide } from '@hashi-bot/core';

import type { SimulatedOrderType } from '../types/simulated-trade.js';

export type IntraBarFillPolicy = 'conservative' | 'optimistic';

export interface FillSimulatorConfig {
  slippageBps: number;
  feeBps: number;
  tp1ExitFraction: number;
  intraBarFillPolicy: IntraBarFillPolicy;
}

export interface FillExecution {
  requestedPrice: number;
  executedPrice: number;
  feePaid: number;
  slippagePaid: number;
}

export interface FillTouchResult {
  touched: boolean;
  touchedAtPrice?: number;
}

export const DEFAULT_FILL_CONFIG: FillSimulatorConfig = {
  slippageBps: 5,
  feeBps: 4,
  tp1ExitFraction: 0.5,
  intraBarFillPolicy: 'conservative'
};

function applySlippage(price: number, side: TradeSide, slippageBps: number, isExit: boolean): number {
  const bps = slippageBps / 10_000;

  if (side === 'long') {
    const multiplier = isExit ? 1 - bps : 1 + bps;
    return price * multiplier;
  }

  const multiplier = isExit ? 1 + bps : 1 - bps;
  return price * multiplier;
}

export function estimateFee(notional: number, feeBps: number): number {
  return Math.abs(notional) * (feeBps / 10_000);
}

export function executeFill(
  side: TradeSide,
  requestedPrice: number,
  qty: number,
  config: FillSimulatorConfig,
  isExit: boolean
): FillExecution {
  const executedPrice = applySlippage(requestedPrice, side, config.slippageBps, isExit);
  const notional = qty * executedPrice;
  const feePaid = estimateFee(notional, config.feeBps);

  return {
    requestedPrice,
    executedPrice,
    feePaid,
    slippagePaid: Math.abs(executedPrice - requestedPrice) * qty
  };
}

export function candleTouchesPrice(candle: Candle, price: number): FillTouchResult {
  if (price >= candle.low && price <= candle.high) {
    return { touched: true, touchedAtPrice: price };
  }

  return { touched: false };
}

export interface IntraBarTargets {
  stop: number;
  tp1?: number;
  tp2?: number;
}

export type IntraBarHit = 'stop' | 'tp1' | 'tp2' | 'none';

export function resolveIntraBarHit(
  candle: Candle,
  side: TradeSide,
  targets: IntraBarTargets,
  policy: IntraBarFillPolicy
): IntraBarHit {
  const stopHit = candleTouchesPrice(candle, targets.stop).touched;
  const tp1Hit = targets.tp1 !== undefined ? candleTouchesPrice(candle, targets.tp1).touched : false;
  const tp2Hit = targets.tp2 !== undefined ? candleTouchesPrice(candle, targets.tp2).touched : false;

  if (policy === 'conservative') {
    if (stopHit) {
      return 'stop';
    }

    if (side === 'long') {
      if (tp1Hit) {
        return 'tp1';
      }
      if (tp2Hit) {
        return 'tp2';
      }
    } else {
      if (tp1Hit) {
        return 'tp1';
      }
      if (tp2Hit) {
        return 'tp2';
      }
    }

    return 'none';
  }

  if (side === 'long') {
    if (tp2Hit) {
      return 'tp2';
    }
    if (tp1Hit) {
      return 'tp1';
    }
    if (stopHit) {
      return 'stop';
    }
    return 'none';
  }

  if (tp2Hit) {
    return 'tp2';
  }
  if (tp1Hit) {
    return 'tp1';
  }
  if (stopHit) {
    return 'stop';
  }

  return 'none';
}
