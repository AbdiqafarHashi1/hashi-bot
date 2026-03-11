import type { TradeSide } from '@hashi-bot/core';

import type {
  BacktestMetricsSummary,
  EquitySnapshot,
  PerSetupBacktestStats,
  PerSymbolBacktestStats,
  SideBreakdownStats
} from '../types/backtest-run.js';
import type { SimulatedTrade } from '../types/simulated-trade.js';

interface ScalarStats {
  trades: number;
  wins: number;
  losses: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  rSum: number;
  rCount: number;
  holdingMsSum: number;
  holdingMsCount: number;
}

function emptyStats(): ScalarStats {
  return {
    trades: 0,
    wins: 0,
    losses: 0,
    grossProfit: 0,
    grossLoss: 0,
    netPnl: 0,
    rSum: 0,
    rCount: 0,
    holdingMsSum: 0,
    holdingMsCount: 0
  };
}

function mergeTrade(stats: ScalarStats, trade: SimulatedTrade): void {
  const net = trade.netPnl ?? 0;
  stats.trades += 1;
  stats.netPnl += net;

  if (net >= 0) {
    stats.wins += 1;
    stats.grossProfit += net;
  } else {
    stats.losses += 1;
    stats.grossLoss += Math.abs(net);
  }

  if (trade.plan.riskAmount > 0) {
    stats.rSum += net / trade.plan.riskAmount;
    stats.rCount += 1;
  }

  const opened = trade.position.openedAtTs;
  const closed = trade.position.closedAtTs;
  if (opened !== undefined && closed !== undefined && closed >= opened) {
    stats.holdingMsSum += closed - opened;
    stats.holdingMsCount += 1;
  }
}

function profitFactor(grossProfit: number, grossLoss: number): number | undefined {
  if (grossLoss === 0) {
    return grossProfit > 0 ? Infinity : undefined;
  }

  return grossProfit / grossLoss;
}

function maxStreaks(closedTrades: SimulatedTrade[]): { maxWins: number; maxLosses: number } {
  let maxWins = 0;
  let maxLosses = 0;
  let wins = 0;
  let losses = 0;

  const ordered = [...closedTrades].sort((a, b) => (a.exitFilledAtTs ?? 0) - (b.exitFilledAtTs ?? 0));
  for (const trade of ordered) {
    const net = trade.netPnl ?? 0;
    if (net >= 0) {
      wins += 1;
      losses = 0;
    } else {
      losses += 1;
      wins = 0;
    }

    maxWins = Math.max(maxWins, wins);
    maxLosses = Math.max(maxLosses, losses);
  }

  return { maxWins, maxLosses };
}

function toPerSymbol(symbolCode: string, stats: ScalarStats): PerSymbolBacktestStats {
  const winRatePct = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;
  const lossRatePct = stats.trades > 0 ? (stats.losses / stats.trades) * 100 : 0;

  return {
    symbolCode: symbolCode as PerSymbolBacktestStats['symbolCode'],
    trades: stats.trades,
    wins: stats.wins,
    losses: stats.losses,
    winRatePct,
    lossRatePct,
    grossProfit: stats.grossProfit,
    grossLoss: stats.grossLoss,
    netPnl: stats.netPnl,
    profitFactor: profitFactor(stats.grossProfit, stats.grossLoss),
    averageRMultiple: stats.rCount > 0 ? stats.rSum / stats.rCount : undefined,
    averageHoldingTimeMs: stats.holdingMsCount > 0 ? stats.holdingMsSum / stats.holdingMsCount : undefined
  };
}

function toPerSetup(setupCode: string, stats: ScalarStats): PerSetupBacktestStats {
  const winRatePct = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;
  const lossRatePct = stats.trades > 0 ? (stats.losses / stats.trades) * 100 : 0;

  return {
    setupCode,
    trades: stats.trades,
    wins: stats.wins,
    losses: stats.losses,
    winRatePct,
    lossRatePct,
    grossProfit: stats.grossProfit,
    grossLoss: stats.grossLoss,
    netPnl: stats.netPnl,
    profitFactor: profitFactor(stats.grossProfit, stats.grossLoss),
    averageRMultiple: stats.rCount > 0 ? stats.rSum / stats.rCount : undefined
  };
}

function toSide(side: TradeSide, stats: ScalarStats): SideBreakdownStats {
  const winRatePct = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;
  const lossRatePct = stats.trades > 0 ? (stats.losses / stats.trades) * 100 : 0;

  return {
    side,
    trades: stats.trades,
    wins: stats.wins,
    losses: stats.losses,
    winRatePct,
    lossRatePct,
    grossProfit: stats.grossProfit,
    grossLoss: stats.grossLoss,
    netPnl: stats.netPnl,
    profitFactor: profitFactor(stats.grossProfit, stats.grossLoss)
  };
}

export interface MetricsComputationResult {
  summary: BacktestMetricsSummary;
  perSymbol: PerSymbolBacktestStats[];
  perSetup: PerSetupBacktestStats[];
  longShort: SideBreakdownStats[];
}

export function computeBacktestMetrics(params: {
  initialBalance: number;
  closedTrades: SimulatedTrade[];
  equitySnapshots: EquitySnapshot[];
}): MetricsComputationResult {
  const total = emptyStats();
  const bySymbol = new Map<string, ScalarStats>();
  const bySetup = new Map<string, ScalarStats>();
  const bySide = new Map<TradeSide, ScalarStats>([
    ['long', emptyStats()],
    ['short', emptyStats()]
  ]);

  for (const trade of params.closedTrades) {
    mergeTrade(total, trade);

    const symbolStats = bySymbol.get(trade.symbolCode) ?? emptyStats();
    mergeTrade(symbolStats, trade);
    bySymbol.set(trade.symbolCode, symbolStats);

    const setupStats = bySetup.get(trade.setupCode) ?? emptyStats();
    mergeTrade(setupStats, trade);
    bySetup.set(trade.setupCode, setupStats);

    const sideStats = bySide.get(trade.side) ?? emptyStats();
    mergeTrade(sideStats, trade);
    bySide.set(trade.side, sideStats);
  }

  const endingBalance = params.equitySnapshots.at(-1)?.balance ?? params.initialBalance;
  const maxDrawdownPct = params.equitySnapshots.reduce((acc, item) => Math.max(acc, item.drawdownPct), 0);
  const { maxWins, maxLosses } = maxStreaks(params.closedTrades);

  const winRatePct = total.trades > 0 ? (total.wins / total.trades) * 100 : 0;
  const lossRatePct = total.trades > 0 ? (total.losses / total.trades) * 100 : 0;
  const averageR = total.rCount > 0 ? total.rSum / total.rCount : undefined;

  const summary: BacktestMetricsSummary = {
    startingBalance: params.initialBalance,
    endingBalance,
    netPnl: total.netPnl,
    returnPct: params.initialBalance > 0 ? (total.netPnl / params.initialBalance) * 100 : 0,
    totalTrades: total.trades,
    wins: total.wins,
    losses: total.losses,
    winRatePct,
    lossRatePct,
    grossProfit: total.grossProfit,
    grossLoss: total.grossLoss,
    profitFactor: profitFactor(total.grossProfit, total.grossLoss),
    expectancy: total.trades > 0 ? total.netPnl / total.trades : undefined,
    averageRMultiple: averageR,
    maxDrawdownPct,
    maxConsecutiveWins: maxWins,
    maxConsecutiveLosses: maxLosses,
    averageHoldingTimeMs: total.holdingMsCount > 0 ? total.holdingMsSum / total.holdingMsCount : undefined,
    perSymbol: Array.from(bySymbol.entries()).map(([symbol, stats]) => toPerSymbol(symbol, stats)),
    perSetup: Array.from(bySetup.entries()).map(([setup, stats]) => toPerSetup(setup, stats)),
    longShortBreakdown: Array.from(bySide.entries()).map(([side, stats]) => toSide(side, stats))
  };

  return {
    summary,
    perSymbol: summary.perSymbol,
    perSetup: summary.perSetup,
    longShort: summary.longShortBreakdown
  };
}
