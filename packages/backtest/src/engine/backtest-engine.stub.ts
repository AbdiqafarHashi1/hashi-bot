import type { Candle, EpochMs, StrategySignal, SymbolCode, SymbolSpec } from '@hashi-bot/core';
import { evaluateRiskDecision, type PortfolioState } from '@hashi-bot/risk';

import { DEFAULT_FILL_CONFIG } from '../fills/fill-simulator.stub.js';
import { computeBacktestMetrics } from '../metrics/metrics.stub.js';
import type { BacktestRunConfig, BacktestRunMetadata, BacktestRunResult, EquitySnapshot } from '../types/backtest-run.js';
import type { SimulatedTrade } from '../types/simulated-trade.js';
import { advanceTradeState, createPendingTrade, DEFAULT_STATE_MACHINE_CONFIG, type StateMachineConfig } from './state-machine.js';

export interface BacktestDataset {
  candlesBySymbol: Record<string, Candle[]>;
  symbolSpecsBySymbol: Record<string, SymbolSpec>;
}

export interface SignalGenerationContext {
  symbolCode: SymbolCode;
  symbolSpec: SymbolSpec;
  candles: Candle[];
  evaluationIndex: number;
  evaluationTs: EpochMs;
}

export type SignalGenerator = (context: SignalGenerationContext) => StrategySignal[];

export interface BacktestEngineOptions {
  config: BacktestRunConfig;
  dataset: BacktestDataset;
  signalGenerator: SignalGenerator;
  stateMachine?: Partial<StateMachineConfig>;
}

interface ClosedTradeAccumulator {
  netPnl: number;
  closedTrades: SimulatedTrade[];
  consecutiveLosses: number;
  dailyTrades: number;
  dailyRealizedPnl: number;
  lastClosedAtTsBySymbol: Partial<Record<string, number>>;
}

function buildCandleIndex(candlesBySymbol: Record<string, Candle[]>): Map<number, Candle[]> {
  const map = new Map<number, Candle[]>();

  for (const candles of Object.values(candlesBySymbol)) {
    for (const candle of candles) {
      const row = map.get(candle.ts) ?? [];
      row.push(candle);
      map.set(candle.ts, row);
    }
  }

  return map;
}

function getDailyKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function calculateUnrealized(openTrades: SimulatedTrade[], latestPriceBySymbol: Record<string, number>): number {
  let unrealized = 0;

  for (const trade of openTrades) {
    if (trade.lifecycleState === 'closed' || trade.lifecycleState === 'cancelled' || trade.lifecycleState === 'rejected') {
      continue;
    }

    const mark = latestPriceBySymbol[trade.symbolCode];
    const entry = trade.position.entryPrice;
    const qty = trade.position.remainingQty ?? 0;
    if (mark === undefined || entry === undefined || qty <= 0) {
      continue;
    }

    const pnl = trade.side === 'long' ? (mark - entry) * qty : (entry - mark) * qty;
    unrealized += pnl;
  }

  return unrealized;
}

function buildPortfolioState(args: {
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
    if (trade.lifecycleState === 'closed' || trade.lifecycleState === 'cancelled' || trade.lifecycleState === 'rejected') {
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
    openPositions: args.openTrades.filter((t) => t.lifecycleState !== 'closed' && t.lifecycleState !== 'cancelled' && t.lifecycleState !== 'rejected').length,
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

export function runBacktest(options: BacktestEngineOptions): BacktestRunResult {
  const candleIndex = buildCandleIndex(options.dataset.candlesBySymbol);
  const sortedTimestamps = Array.from(candleIndex.keys())
    .filter((ts) => ts >= options.config.fromTs && ts <= options.config.toTs)
    .sort((a, b) => a - b);

  const stateMachineConfig: Partial<StateMachineConfig> = {
    ...DEFAULT_STATE_MACHINE_CONFIG,
    ...options.stateMachine,
    fill: {
      ...DEFAULT_FILL_CONFIG,
      slippageBps: options.config.slippageBps ?? DEFAULT_FILL_CONFIG.slippageBps,
      feeBps: options.config.commissionBps ?? DEFAULT_FILL_CONFIG.feeBps,
      ...(options.stateMachine?.fill ?? {})
    }
  };

  const allTrades: SimulatedTrade[] = [];
  const openTrades: SimulatedTrade[] = [];
  const rejectedSignals: StrategySignal[] = [];
  const equitySnapshots: EquitySnapshot[] = [];
  const latestPriceBySymbol: Record<string, number> = {};

  let balance = options.config.initialBalance;
  let highWatermark = balance;
  let currentDay = '';

  const closedState: ClosedTradeAccumulator = {
    netPnl: 0,
    closedTrades: [],
    consecutiveLosses: 0,
    dailyTrades: 0,
    dailyRealizedPnl: 0,
    lastClosedAtTsBySymbol: {}
  };

  for (const ts of sortedTimestamps) {
    const candlesAtTs = candleIndex.get(ts) ?? [];
    const dayKey = getDailyKey(ts);
    if (dayKey !== currentDay) {
      currentDay = dayKey;
      closedState.dailyTrades = 0;
      closedState.dailyRealizedPnl = 0;
    }

    for (const candle of candlesAtTs) {
      latestPriceBySymbol[candle.symbolCode] = candle.close;

      for (const trade of openTrades.filter((item) => item.symbolCode === candle.symbolCode)) {
        const { trade: updated } = advanceTradeState(trade, { candle }, { fill: stateMachineConfig.fill, timeStopBars: stateMachineConfig.timeStopBars });

        if (updated.lifecycleState === 'closed' && !closedState.closedTrades.includes(updated)) {
          const pnl = updated.netPnl ?? 0;
          balance += pnl;
          closedState.netPnl += pnl;
          closedState.dailyRealizedPnl += pnl;
          closedState.dailyTrades += 1;
          closedState.consecutiveLosses = pnl < 0 ? closedState.consecutiveLosses + 1 : 0;
          closedState.lastClosedAtTsBySymbol[updated.symbolCode] = candle.ts;
          closedState.closedTrades.push(updated);
        }
      }

      for (let i = openTrades.length - 1; i >= 0; i -= 1) {
        const trade = openTrades[i];
        if (trade?.lifecycleState === 'closed') {
          openTrades.splice(i, 1);
        }
      }
    }

    const portfolioStateAfterTradeUpdates = buildPortfolioState({
      ts,
      balance,
      openTrades,
      latestPriceBySymbol,
      dailyTrades: closedState.dailyTrades,
      dailyRealizedPnl: closedState.dailyRealizedPnl,
      consecutiveLosses: closedState.consecutiveLosses
    });

    highWatermark = Math.max(highWatermark, portfolioStateAfterTradeUpdates.equity);
    const drawdownPct = highWatermark > 0 ? ((highWatermark - portfolioStateAfterTradeUpdates.equity) / highWatermark) * 100 : 0;
    equitySnapshots.push({
      ts: ts as EpochMs,
      balance,
      equity: portfolioStateAfterTradeUpdates.equity,
      realizedPnl: closedState.netPnl,
      unrealizedPnl: portfolioStateAfterTradeUpdates.unrealizedPnl,
      drawdownPct,
      openPositions: portfolioStateAfterTradeUpdates.openPositions
    });

    for (const symbolCode of options.config.symbols) {
      const symbolCandles = options.dataset.candlesBySymbol[symbolCode] ?? [];
      const symbolSpec = options.dataset.symbolSpecsBySymbol[symbolCode];
      if (!symbolSpec) {
        continue;
      }

      const evalIndex = symbolCandles.findIndex((c) => c.ts === ts);
      if (evalIndex < 1) {
        continue;
      }

      const generatedSignals = options.signalGenerator({
        symbolCode,
        symbolSpec,
        candles: symbolCandles.slice(0, evalIndex + 1),
        evaluationIndex: evalIndex,
        evaluationTs: ts as EpochMs
      });

      for (const signal of generatedSignals) {
        const portfolioStateForRisk = buildPortfolioState({
          ts,
          balance,
          openTrades,
          latestPriceBySymbol,
          dailyTrades: closedState.dailyTrades,
          dailyRealizedPnl: closedState.dailyRealizedPnl,
          consecutiveLosses: closedState.consecutiveLosses
        });

        const currentDrawdownPct = highWatermark > 0 ? ((highWatermark - portfolioStateForRisk.equity) / highWatermark) * 100 : 0;
        const risk = evaluateRiskDecision({
          profileCode: options.config.profileCode,
          signal,
          symbolSpec,
          portfolioState: portfolioStateForRisk,
          governanceContext: {
            currentTs: ts,
            baselineEquity: options.config.initialBalance,
            currentDrawdownPct,
            correlatedExposurePct: portfolioStateForRisk.portfolioHeatPct,
            lastTradeClosedAtTsBySymbol: closedState.lastClosedAtTsBySymbol
          },
          feeBps: options.config.commissionBps,
          slippageBps: options.config.slippageBps
        });

        if (risk.status !== 'allowed' || !risk.positionPlan) {
          rejectedSignals.push(signal);
          continue;
        }

        if (options.config.maxConcurrentPositions && openTrades.length >= options.config.maxConcurrentPositions) {
          rejectedSignals.push(signal);
          continue;
        }

        const trade = createPendingTrade({
          tradeId: `${options.config.runId}-${signal.symbolCode}-${signal.createdAtTs}-${allTrades.length + 1}`,
          runId: options.config.runId,
          plan: risk.positionPlan
        });

        allTrades.push(trade);
        openTrades.push(trade);
      }
    }
  }

  const metadata: BacktestRunMetadata = {
    runId: options.config.runId,
    profileCode: options.config.profileCode,
    timeframe: options.config.timeframe,
    symbols: options.config.symbols,
    startedAtTs: sortedTimestamps[0] as EpochMs,
    completedAtTs: sortedTimestamps.at(-1) as EpochMs,
    candlesProcessed: sortedTimestamps.length
  };

  const computed = computeBacktestMetrics({
    initialBalance: options.config.initialBalance,
    closedTrades: closedState.closedTrades,
    equitySnapshots
  });

  return {
    metadata,
    config: options.config,
    trades: allTrades,
    metrics: computed.summary,
    equity: equitySnapshots,
    perSymbolStats: computed.perSymbol,
    perSetupStats: computed.perSetup,
    longShortStats: computed.longShort,
    rejectedSignals
  };
}
