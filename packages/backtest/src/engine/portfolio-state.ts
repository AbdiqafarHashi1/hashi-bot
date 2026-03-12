import type { SymbolCode } from '@hashi-bot/core';
import type { PortfolioState } from '@hashi-bot/risk';

import type { SimulatedTrade } from '../types/simulated-trade.js';

function isTradeOpen(trade: SimulatedTrade): boolean {
  return trade.lifecycleState !== 'closed' && trade.lifecycleState !== 'cancelled' && trade.lifecycleState !== 'rejected';
}

export function getDailyKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function calculateUnrealized(openTrades: SimulatedTrade[], latestPriceBySymbol: Record<string, number>): number {
  let unrealized = 0;

  for (const trade of openTrades) {
    if (!isTradeOpen(trade)) {
      continue;
    }

    const mark = latestPriceBySymbol[trade.symbolCode];
    const entry = trade.position.entryPrice;
    const qty = trade.position.remainingQty ?? 0;
    if (mark === undefined || entry === undefined || qty <= 0) {
      continue;
    }

    unrealized += trade.side === 'long' ? (mark - entry) * qty : (entry - mark) * qty;
  }

  return unrealized;
}

export function buildPortfolioState(args: {
  ts: number;
  balance: number;
  openTrades: SimulatedTrade[];
  latestPriceBySymbol: Record<string, number>;
  dailyTrades: number;
  dailyRealizedPnl: number;
  consecutiveLosses: number;
}): PortfolioState {
  const perSymbol = new Map<string, { openRiskPct: number; openNotional: number; openPositions: number }>();

  for (const trade of args.openTrades) {
    if (!isTradeOpen(trade)) {
      continue;
    }

    const qty = trade.position.remainingQty ?? 0;
    if (qty <= 0) {
      continue;
    }

    const existing = perSymbol.get(trade.symbolCode) ?? { openRiskPct: 0, openNotional: 0, openPositions: 0 };
    perSymbol.set(trade.symbolCode, {
      openRiskPct: existing.openRiskPct + trade.plan.riskPct,
      openNotional: existing.openNotional + trade.plan.entry * qty,
      openPositions: existing.openPositions + 1
    });
  }

  const unrealizedPnl = calculateUnrealized(args.openTrades, args.latestPriceBySymbol);
  const equity = args.balance + unrealizedPnl;
  const portfolioHeatPct = Array.from(perSymbol.values()).reduce((acc, item) => acc + item.openRiskPct, 0);

  return {
    asOfTs: args.ts,
    equity,
    balance: args.balance,
    unrealizedPnl,
    realizedPnl: args.balance,
    openPositions: args.openTrades.filter(isTradeOpen).length,
    portfolioHeatPct,
    dailyPnl: args.dailyRealizedPnl,
    dailyTrades: args.dailyTrades,
    consecutiveLosses: args.consecutiveLosses,
    perSymbolExposure: Array.from(perSymbol.entries()).map(([symbolCode, value]) => ({
      symbolCode: symbolCode as SymbolCode,
      openRiskPct: value.openRiskPct,
      openNotional: value.openNotional,
      openPositions: value.openPositions
    }))
  };
}
