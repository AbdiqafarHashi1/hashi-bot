import {
  createReplayEngine,
  type ReplayControlAction,
  type ReplayRunConfig,
  type ReplayState,
  type ReplayStepResult,
  type RunDetailView,
  type RunStatus,
} from '@hashi-bot/backtest';
import { createRunId, type ProfileCode, type RunId, type SymbolCode, type Timeframe } from '@hashi-bot/core';
import type { DatasetRecord, DatasetRepository, RunHistoryRepository } from '@hashi-bot/data';
import { buildMarketSnapshot, buildPhase4SignalsFromCandles, classifyRegime } from '@hashi-bot/strategy';

export interface CreateReplayRunParams {
  datasetId?: string;
  symbolCodes?: SymbolCode[];
  profileCode?: ProfileCode;
  timeframe?: Timeframe;
  replaySpeed?: number;
  runId?: RunId;
}

interface ReplayRunSession {
  config: ReplayRunConfig;
  engine: ReturnType<typeof createReplayEngine>;
  status: RunStatus;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled replay action: ${String(value)}`);
}

export class ReplayService {
  private readonly sessions = new Map<RunId, ReplayRunSession>();

  constructor(
    private readonly datasetRepository: DatasetRepository,
    private readonly runHistoryRepository: RunHistoryRepository
  ) {}

  createReplayRun(params: CreateReplayRunParams = {}): ReplayStepResult {
    const datasets = this.resolveDatasets(params);
    if (datasets.length === 0) {
      throw new Error('No datasets available for replay run creation');
    }

    const symbols = params.symbolCodes?.length
      ? params.symbolCodes
      : datasets.map((dataset) => dataset.symbolCode);

    const runId = params.runId ?? createRunId();
    const config: ReplayRunConfig = {
      runId,
      datasetId: (params.datasetId ?? datasets[0]?.id ?? 'dataset-unknown') as ReplayRunConfig['datasetId'],
      profileCode: params.profileCode ?? 'GROWTH_HUNTER',
      timeframe: params.timeframe ?? datasets[0]?.timeframe ?? '1m',
      symbolScope: {
        mode: symbols.length > 1 ? 'watchlist' : 'single',
        symbols,
        primarySymbol: symbols[0],
      },
      replaySpeed: params.replaySpeed ?? 1,
      maxTimelineEvents: 300,
    };

    const candlesBySymbol: Record<string, DatasetRecord['candles']> = {};
    const symbolSpecsBySymbol: Record<string, NonNullable<ReturnType<DatasetRepository['getSymbol']>>> = {};

    for (const dataset of datasets) {
      if (!symbols.includes(dataset.symbolCode)) {
        continue;
      }

      const symbolSpec = this.datasetRepository.getSymbol(dataset.symbolCode);
      if (!symbolSpec) {
        throw new Error(`Symbol spec missing for replay symbol ${dataset.symbolCode}`);
      }

      candlesBySymbol[dataset.symbolCode] = dataset.candles;
      symbolSpecsBySymbol[dataset.symbolCode] = symbolSpec;
    }

    const engine = createReplayEngine({
      config,
      dataset: {
        candlesBySymbol,
        symbolSpecsBySymbol,
      },
      signalGenerator: ({ symbolCode, symbolSpec, candles }) =>
        buildPhase4SignalsFromCandles({ symbolCode, symbolSpec, candles }),
      snapshotBuilder: ({ candles, symbolSpec, evaluationTs }) => {
        const snapshot = buildMarketSnapshot({ candles, symbolSpec, timeframe: config.timeframe });
        return {
          ...snapshot,
          ts: evaluationTs,
        };
      },
      regimeClassifier: ({ snapshot }) => {
        const regime = classifyRegime({ snapshot });
        return {
          symbolCode: regime.symbolCode,
          timeframe: regime.timeframe,
          regimeState: regime.regimeState,
          isTradable: regime.isTradable,
          reasons: regime.reasons,
          flags: regime.flags,
        };
      },
    });

    this.sessions.set(runId, { config, engine, status: 'queued' });

    this.runHistoryRepository.saveLaunchRequest(runId, {
      mode: 'replay',
      replay: config
    });

    const initial = engine.step(0);
    this.saveRunState(runId, initial.state, 'queued');
    return initial;
  }

  loadRunConfig(runId: RunId): ReplayRunConfig {
    return this.mustGetSession(runId).config;
  }

  stepReplay(runId: RunId, steps = 1): ReplayStepResult {
    const session = this.mustGetSession(runId);
    session.status = 'running';

    const result = session.engine.step(steps);
    session.status = result.state.playbackState === 'completed' ? 'completed' : 'paused';

    this.saveRunState(runId, result.state, session.status);
    return result;
  }

  controlReplay(runId: RunId, action: ReplayControlAction): ReplayStepResult {
    const session = this.mustGetSession(runId);

    switch (action.type) {
      case 'step':
        return this.stepReplay(runId, action.steps ?? 1);
      case 'play': {
        session.status = 'running';
        const result = session.engine.play();
        session.status = result.state.playbackState === 'completed' ? 'completed' : 'running';
        this.saveRunState(runId, result.state, session.status);
        return result;
      }
      case 'pause': {
        const result = session.engine.applyControl(action);
        session.status = 'paused';
        this.saveRunState(runId, result.state, session.status);
        return result;
      }
      case 'jump_to_index':
      case 'jump_to_timestamp':
      case 'set_speed':
      case 'reset': {
        const result = session.engine.applyControl(action);
        session.status = action.type === 'reset' ? 'queued' : session.status;
        this.saveRunState(runId, result.state, session.status);
        return result;
      }
      default:
        assertNever(action);
    }
  }

  getReplayState(runId: RunId): ReplayState {
    return this.mustGetSession(runId).engine.getState();
  }

  private resolveDatasets(params: CreateReplayRunParams): DatasetRecord[] {
    if (params.datasetId) {
      const dataset = this.datasetRepository.getDataset(params.datasetId);
      if (!dataset) {
        throw new Error(`Replay dataset not found: ${params.datasetId}`);
      }
      return [dataset];
    }

    const allDatasets = this.datasetRepository.listDatasets();
    if (!params.symbolCodes?.length) {
      return allDatasets;
    }

    return allDatasets.filter((dataset) => params.symbolCodes?.includes(dataset.symbolCode));
  }

  private mustGetSession(runId: RunId): ReplayRunSession {
    const session = this.sessions.get(runId);
    if (!session) {
      throw new Error(`Replay run not found: ${runId}`);
    }
    return session;
  }

  private saveRunState(runId: RunId, state: ReplayState, status: RunStatus): void {
    const session = this.mustGetSession(runId);
    const summary = {
      runId,
      mode: 'replay' as const,
      status,
      datasetId: state.datasetId,
      profileCode: session.config.profileCode,
      timeframe: session.config.timeframe,
      symbols: state.symbolScope.symbols,
      startedAtTs: state.recentTimelineEvents[0]?.ts,
      completedAtTs: state.playbackState === 'completed' ? state.cursor.timestamp : undefined,
      totalTrades: state.closedTradesSummary.totalClosed + state.openTrades.length,
      winRatePct: state.closedTradesSummary.winRatePct,
      netPnl: state.closedTradesSummary.netPnl,
    };

    this.runHistoryRepository.saveRunSummary(summary);

    const detail: RunDetailView = {
      summary,
      replayState: state,
      tradeSummaries: state.openTrades.map((trade) => ({
        tradeId: trade.tradeId,
        symbolCode: trade.symbolCode,
        side: trade.side,
        setupCode: trade.setupCode,
        lifecycleState: trade.lifecycleState,
        netPnl: trade.netPnl,
        openedAtTs: trade.position.openedAtTs,
        closedAtTs: trade.position.closedAtTs,
        closeReason: trade.closeReason,
      })),
      metrics: {
        totalTrades: summary.totalTrades,
        winRatePct: summary.winRatePct,
        netPnl: summary.netPnl,
      },
      timeline: state.recentTimelineEvents,
      timelineSummary: {
        totalEvents: state.recentTimelineEvents.length,
        eventTypes: state.recentTimelineEvents.reduce((acc, event) => {
          acc[event.type] = (acc[event.type] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        latestEventTs: state.recentTimelineEvents.at(-1)?.ts,
      },
    };

    this.runHistoryRepository.saveRunDetail(detail);
  }
}
