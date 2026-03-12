import type { Candle, EpochMs, MarketSnapshot, StrategySignal, SymbolCode, SymbolSpec } from '@hashi-bot/core';
import { evaluateRiskDecision } from '@hashi-bot/risk';

import { DEFAULT_FILL_CONFIG } from '../fills/fill-simulator.js';
import type {
  ReplayControlAction,
  ReplayRegimeAssessment,
  ReplayRunConfig,
  ReplayState,
  ReplayStepResult,
  ReplayTimelineEvent,
} from '../types/replay.js';
import type { SimulatedTrade } from '../types/simulated-trade.js';
import { buildPortfolioState, getDailyKey } from './portfolio-state.js';
import { advanceTradeState, createPendingTrade, DEFAULT_STATE_MACHINE_CONFIG, type StateMachineConfig } from './state-machine.js';

export interface ReplayDataset {
  candlesBySymbol: Record<string, Candle[]>;
  symbolSpecsBySymbol: Record<string, SymbolSpec>;
}

export interface ReplaySignalContext {
  symbolCode: SymbolCode;
  symbolSpec: SymbolSpec;
  candles: Candle[];
  evaluationIndex: number;
  evaluationTs: EpochMs;
}

export interface ReplaySnapshotContext {
  symbolCode: SymbolCode;
  symbolSpec: SymbolSpec;
  candles: Candle[];
  evaluationIndex: number;
  evaluationTs: EpochMs;
}

export interface ReplayRegimeContext {
  snapshot: MarketSnapshot;
  symbolCode: SymbolCode;
  evaluationIndex: number;
  evaluationTs: EpochMs;
}

export interface ReplayEngineOptions {
  config: ReplayRunConfig;
  dataset: ReplayDataset;
  signalGenerator: (context: ReplaySignalContext) => StrategySignal[];
  snapshotBuilder?: (context: ReplaySnapshotContext) => MarketSnapshot;
  regimeClassifier?: (context: ReplayRegimeContext) => ReplayRegimeAssessment;
  stateMachine?: Partial<StateMachineConfig>;
}

function createEvent(args: {
  runId: ReplayRunConfig['runId'];
  ts: EpochMs;
  barIndex: number;
  type: ReplayTimelineEvent['type'];
  symbolCode?: SymbolCode;
  message?: string;
  payload?: Record<string, unknown>;
}): ReplayTimelineEvent {
  return {
    eventId: `${args.runId}:${args.barIndex}:${args.type}:${args.symbolCode ?? 'all'}:${args.ts}`,
    runId: args.runId,
    ts: args.ts,
    barIndex: args.barIndex,
    symbolCode: args.symbolCode,
    type: args.type,
    message: args.message,
    payload: args.payload,
  };
}

export class ReplayEngine {
  private readonly symbols: SymbolCode[];
  private readonly sortedTimestamps: number[];
  private readonly candlesBySymbol: Record<string, Candle[]>;
  private readonly symbolSpecsBySymbol: Record<string, SymbolSpec>;
  private readonly symbolCandlesByTs = new Map<SymbolCode, Map<number, Candle>>();
  private readonly stateMachineConfig: Partial<StateMachineConfig>;
  private readonly candlesThroughTsBySymbol = new Map<SymbolCode, Candle[]>();

  private readonly latestPriceBySymbol: Record<string, number> = {};
  private readonly openTrades: SimulatedTrade[] = [];
  private readonly closedTrades: SimulatedTrade[] = [];
  private readonly latestSnapshotsBySymbol = new Map<SymbolCode, MarketSnapshot>();
  private readonly latestRegimesBySymbol = new Map<SymbolCode, ReplayRegimeAssessment>();

  private readonly initialBalance = 10_000;
  private balance = this.initialBalance;
  private currentDay = '';
  private dailyTrades = 0;
  private dailyRealizedPnl = 0;
  private consecutiveLosses = 0;

  private state: ReplayState;

  constructor(private readonly options: ReplayEngineOptions) {
    this.candlesBySymbol = options.dataset.candlesBySymbol;
    this.symbolSpecsBySymbol = options.dataset.symbolSpecsBySymbol;
    this.symbols = options.config.symbolScope.symbols;

    this.sortedTimestamps = this.buildSortedTimestamps();
    this.stateMachineConfig = {
      ...DEFAULT_STATE_MACHINE_CONFIG,
      ...options.stateMachine,
      fill: {
        ...DEFAULT_FILL_CONFIG,
        ...(options.stateMachine?.fill ?? {}),
      },
    };

    this.initializeSymbolIndexes();
    this.balance = this.initialBalance;
    this.state = this.createInitialState();

    if (options.config.initialCursor?.barIndex != null) {
      this.jumpToIndex(options.config.initialCursor.barIndex);
    }
  }

  getState(): ReplayState {
    return {
      ...this.state,
      latestSnapshots: [...this.state.latestSnapshots],
      latestRegimeAssessments: [...this.state.latestRegimeAssessments],
      latestSignals: [...this.state.latestSignals],
      openTrades: [...this.state.openTrades],
      recentTimelineEvents: [...this.state.recentTimelineEvents],
    };
  }

  applyControl(action: ReplayControlAction): ReplayStepResult {
    switch (action.type) {
      case 'step':
        return this.step(action.steps ?? 1);
      case 'play':
        return this.play();
      case 'pause':
        this.state.playbackState = 'paused';
        return this.finalize([], this.hasMoreData());
      case 'jump_to_index':
        this.jumpToIndex(action.barIndex);
        return this.finalize([], this.hasMoreData());
      case 'jump_to_timestamp': {
        const targetIndex = this.sortedTimestamps.findIndex((ts) => ts >= action.timestamp);
        this.jumpToIndex(targetIndex >= 0 ? targetIndex : this.sortedTimestamps.length - 1);
        return this.finalize([], this.hasMoreData());
      }
      case 'set_speed':
        this.state.playbackSpeed = Math.max(0.1, action.speed);
        return this.finalize([], this.hasMoreData());
      case 'reset':
        this.reset();
        return this.finalize([], this.hasMoreData());
    }
  }

  step(steps = 1): ReplayStepResult {
    const emittedEvents: ReplayTimelineEvent[] = [];
    this.state.playbackState = 'paused';

    for (let i = 0; i < Math.max(steps, 0); i += 1) {
      if (!this.hasMoreData()) {
        this.state.playbackState = 'completed';
        emittedEvents.push(
          createEvent({
            runId: this.options.config.runId,
            ts: (this.state.cursor.timestamp ?? Date.now()) as EpochMs,
            barIndex: this.state.cursor.barIndex,
            type: 'run_completed',
            message: 'Replay completed',
          })
        );
        break;
      }

      emittedEvents.push(...this.advanceOneBar());
    }

    return this.finalize(emittedEvents, this.hasMoreData());
  }

  play(maxSteps = 1): ReplayStepResult {
    this.state.playbackState = 'playing';
    return this.step(maxSteps);
  }

  pause(): ReplayState {
    this.state.playbackState = 'paused';
    return this.getState();
  }

  jumpToIndex(targetIndex: number): ReplayState {
    const bounded = Math.max(0, Math.min(targetIndex, this.sortedTimestamps.length - 1));
    this.reset();
    if (this.sortedTimestamps.length === 0) {
      return this.getState();
    }
    this.step(bounded + 1);
    return this.getState();
  }

  jumpToTimestamp(targetTimestamp: EpochMs): ReplayState {
    const idx = this.sortedTimestamps.findIndex((ts) => ts >= targetTimestamp);
    return this.jumpToIndex(idx >= 0 ? idx : this.sortedTimestamps.length - 1);
  }

  reset(): ReplayState {
    this.openTrades.length = 0;
    this.closedTrades.length = 0;
    this.latestSnapshotsBySymbol.clear();
    this.latestRegimesBySymbol.clear();
    this.candlesThroughTsBySymbol.clear();
    for (const key of Object.keys(this.latestPriceBySymbol)) {
      delete this.latestPriceBySymbol[key];
    }
    this.balance = this.initialBalance;
    this.currentDay = '';
    this.dailyTrades = 0;
    this.dailyRealizedPnl = 0;
    this.consecutiveLosses = 0;
    this.state = this.createInitialState();
    return this.getState();
  }

  private createInitialState(): ReplayState {
    return {
      runId: this.options.config.runId,
      datasetId: this.options.config.datasetId,
      symbolScope: this.options.config.symbolScope,
      cursor: {
        barIndex: -1,
      },
      playbackState: 'idle',
      playbackSpeed: this.options.config.replaySpeed,
      latestSnapshots: [],
      latestRegimeAssessments: [],
      latestSignals: [],
      openTrades: [],
      closedTradesSummary: {
        totalClosed: 0,
        grossPnl: 0,
        netPnl: 0,
        wins: 0,
        losses: 0,
        winRatePct: 0,
      },
      recentTimelineEvents: [],
    };
  }

  private buildSortedTimestamps(): number[] {
    const tsSet = new Set<number>();

    for (const symbol of this.symbols) {
      const candles = this.options.dataset.candlesBySymbol[symbol] ?? [];
      for (const candle of candles) {
        tsSet.add(candle.ts);
      }
    }

    return Array.from(tsSet).sort((a, b) => a - b);
  }

  private initializeSymbolIndexes(): void {
    for (const symbol of this.symbols) {
      const candles = this.candlesBySymbol[symbol] ?? [];
      this.symbolCandlesByTs.set(
        symbol,
        new Map<number, Candle>(candles.map((candle) => [candle.ts, candle]))
      );
    }
  }

  private hasMoreData(): boolean {
    return this.state.cursor.barIndex + 1 < this.sortedTimestamps.length;
  }

  private advanceOneBar(): ReplayTimelineEvent[] {
    const nextIndex = this.state.cursor.barIndex + 1;
    const ts = this.sortedTimestamps[nextIndex];
    const evaluationTs = ts as EpochMs;
    const emittedEvents: ReplayTimelineEvent[] = [];

    if (ts == null) {
      return emittedEvents;
    }

    const dayKey = getDailyKey(ts);
    if (dayKey !== this.currentDay) {
      this.currentDay = dayKey;
      this.dailyTrades = 0;
      this.dailyRealizedPnl = 0;
    }

    this.state.cursor = {
      barIndex: nextIndex,
      timestamp: evaluationTs,
    };

    emittedEvents.push(
      createEvent({
        runId: this.options.config.runId,
        ts: evaluationTs,
        barIndex: nextIndex,
        type: 'bar_advanced',
        message: `Advanced to bar index ${nextIndex}`,
      })
    );

    const signals: StrategySignal[] = [];

    for (const symbolCode of this.symbols) {
      const candle = this.symbolCandlesByTs.get(symbolCode)?.get(ts);
      if (!candle) {
        continue;
      }

      this.latestPriceBySymbol[symbolCode] = candle.close;
      const candlesThroughTs = this.candlesThroughTsBySymbol.get(symbolCode) ?? [];
      candlesThroughTs.push(candle);
      this.candlesThroughTsBySymbol.set(symbolCode, candlesThroughTs);

      for (const trade of this.openTrades.filter((item) => item.symbolCode === symbolCode)) {
        const result = advanceTradeState(trade, { candle }, this.stateMachineConfig);
        if (result.transitions.length > 0) {
          emittedEvents.push(
            createEvent({
              runId: this.options.config.runId,
              ts: evaluationTs,
              barIndex: nextIndex,
              symbolCode,
              type: result.trade.lifecycleState === 'closed' ? 'trade_closed' : 'trade_updated',
              message: `Trade ${trade.tradeId} transitioned`,
              payload: {
                lifecycleState: trade.lifecycleState,
                transitions: result.transitions.map((transition) => ({
                  from: transition.from,
                  to: transition.to,
                  reason: transition.reason,
                })),
              },
            })
          );
        }
      }

      const closedNow = this.openTrades.filter((trade) => trade.lifecycleState === 'closed');
      for (const trade of closedNow) {
        this.closedTrades.push(trade);
        this.balance += trade.netPnl ?? 0;
        this.dailyTrades += 1;
        this.dailyRealizedPnl += trade.netPnl ?? 0;
        this.consecutiveLosses = (trade.netPnl ?? 0) < 0 ? this.consecutiveLosses + 1 : 0;
      }

      for (let idx = this.openTrades.length - 1; idx >= 0; idx -= 1) {
        if (this.openTrades[idx]?.lifecycleState === 'closed') {
          this.openTrades.splice(idx, 1);
        }
      }

      const symbolSpec = this.symbolSpecsBySymbol[symbolCode];
      if (!symbolSpec) {
        continue;
      }

      if (this.options.snapshotBuilder) {
        const snapshot = this.options.snapshotBuilder({
          symbolCode,
          symbolSpec,
          candles: candlesThroughTs,
          evaluationIndex: nextIndex,
          evaluationTs,
        });
        this.latestSnapshotsBySymbol.set(symbolCode, snapshot);
        emittedEvents.push(
          createEvent({
            runId: this.options.config.runId,
            ts: evaluationTs,
            barIndex: nextIndex,
            symbolCode,
            type: 'snapshot_updated',
          })
        );

        if (this.options.regimeClassifier) {
          const regime = this.options.regimeClassifier({
            snapshot,
            symbolCode,
            evaluationIndex: nextIndex,
            evaluationTs,
          });
          this.latestRegimesBySymbol.set(symbolCode, regime);
          emittedEvents.push(
            createEvent({
              runId: this.options.config.runId,
              ts: evaluationTs,
              barIndex: nextIndex,
              symbolCode,
              type: 'regime_assessed',
              payload: { regimeState: regime.regimeState, isTradable: regime.isTradable },
            })
          );
        }
      }

      const symbolSignals = this.options.signalGenerator({
        symbolCode,
        symbolSpec,
        candles: candlesThroughTs,
        evaluationIndex: nextIndex,
        evaluationTs,
      });

      for (const signal of symbolSignals) {
        signals.push(signal);
        emittedEvents.push(
          createEvent({
            runId: this.options.config.runId,
            ts: evaluationTs,
            barIndex: nextIndex,
            symbolCode,
            type: 'signal_emitted',
            payload: { setupCode: signal.setupCode, side: signal.side, score: signal.score },
          })
        );

        const portfolioState = buildPortfolioState({
          ts,
          balance: this.balance,
          openTrades: this.openTrades,
          latestPriceBySymbol: this.latestPriceBySymbol,
          dailyTrades: this.dailyTrades,
          dailyRealizedPnl: this.dailyRealizedPnl,
          consecutiveLosses: this.consecutiveLosses,
        });

        const riskDecision = evaluateRiskDecision({
          profileCode: this.options.config.profileCode,
          signal,
          symbolSpec,
          portfolioState,
          governanceContext: {
            currentTs: ts,
            baselineEquity: this.initialBalance,
            currentDrawdownPct: 0,
            correlatedExposurePct: undefined,
            lastTradeClosedAtTsBySymbol: undefined,
          },
        });

        if (riskDecision.status !== 'allowed' || !riskDecision.positionPlan) {
          emittedEvents.push(
            createEvent({
              runId: this.options.config.runId,
              ts: evaluationTs,
              barIndex: nextIndex,
              symbolCode,
              type: 'signal_rejected',
              payload: { reason: riskDecision.reason },
            })
          );
          continue;
        }

        const trade = createPendingTrade({
          tradeId: `${this.options.config.runId}-${signal.symbolCode}-${signal.createdAtTs}-${this.openTrades.length + this.closedTrades.length}`,
          runId: this.options.config.runId,
          plan: riskDecision.positionPlan,
        });

        this.openTrades.push(trade);

        emittedEvents.push(
          createEvent({
            runId: this.options.config.runId,
            ts: evaluationTs,
            barIndex: nextIndex,
            symbolCode,
            type: 'trade_opened',
            payload: { tradeId: trade.tradeId, setupCode: signal.setupCode },
          })
        );
      }
    }

    this.state.latestSignals = signals;
    this.state.latestSnapshots = Array.from(this.latestSnapshotsBySymbol.values());
    this.state.latestRegimeAssessments = Array.from(this.latestRegimesBySymbol.values());
    this.state.openTrades = [...this.openTrades];
    this.state.closedTradesSummary = this.toClosedTradesSummary();

    return emittedEvents;
  }

  private toClosedTradesSummary(): ReplayState['closedTradesSummary'] {
    const totalClosed = this.closedTrades.length;
    const grossPnl = this.closedTrades.reduce((sum, trade) => sum + (trade.grossPnl ?? 0), 0);
    const netPnl = this.closedTrades.reduce((sum, trade) => sum + (trade.netPnl ?? 0), 0);
    const wins = this.closedTrades.filter((trade) => (trade.netPnl ?? 0) > 0).length;
    const losses = this.closedTrades.filter((trade) => (trade.netPnl ?? 0) < 0).length;

    return {
      totalClosed,
      grossPnl,
      netPnl,
      wins,
      losses,
      winRatePct: totalClosed > 0 ? (wins / totalClosed) * 100 : 0,
    };
  }

  private finalize(emittedEvents: ReplayTimelineEvent[], hasMoreData: boolean): ReplayStepResult {
    if (emittedEvents.length > 0) {
      this.state.recentTimelineEvents = [...this.state.recentTimelineEvents, ...emittedEvents].slice(
        -(this.options.config.maxTimelineEvents ?? 200)
      );
    }

    return {
      runId: this.options.config.runId,
      state: this.getState(),
      emittedEvents,
      hasMoreData,
    };
  }
}

export function createReplayEngine(options: ReplayEngineOptions): ReplayEngine {
  return new ReplayEngine(options);
}
