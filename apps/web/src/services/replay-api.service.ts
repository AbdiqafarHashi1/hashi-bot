import {
  createReplayEngine,
  type ReplayControlAction,
  type ReplayRunConfig,
  type ReplayState,
  type ReplayStepResult,
  type RunSummary,
} from '@hashi-bot/backtest';
import { createRunId, type ProfileCode, type RunId, type SymbolCode, type Timeframe } from '@hashi-bot/core';
import type { DatasetRecord, DatasetRepository, RunHistoryRepository } from '@hashi-bot/data';
import { buildMarketSnapshot, buildPhase4SignalsFromCandles, classifyRegime } from '@hashi-bot/strategy';

export interface CreateReplayRequest {
  datasetId?: string;
  symbolCodes?: SymbolCode[];
  profileCode?: ProfileCode;
  timeframe?: Timeframe;
  replaySpeed?: number;
}

interface ReplaySessionRecord {
  config: ReplayRunConfig;
  engine: ReturnType<typeof createReplayEngine>;
}

export class ReplayApiService {
  private readonly sessions = new Map<RunId, ReplaySessionRecord>();

  constructor(
    private readonly datasetRepository: DatasetRepository,
    private readonly runHistoryRepository: RunHistoryRepository
  ) {}

  createRun(request: CreateReplayRequest): ReplayStepResult {
    const datasets = this.resolveDatasets(request);
    if (datasets.length === 0) {
      throw new Error('No datasets available for replay run creation');
    }

    const symbols = request.symbolCodes?.length ? request.symbolCodes : datasets.map((dataset) => dataset.symbolCode);
    const runId = createRunId();

    const config: ReplayRunConfig = {
      runId,
      datasetId: (request.datasetId ?? datasets[0]?.id ?? 'dataset-unknown') as ReplayRunConfig['datasetId'],
      profileCode: request.profileCode ?? 'GROWTH_HUNTER',
      timeframe: request.timeframe ?? datasets[0]?.timeframe ?? '1m',
      symbolScope: {
        mode: symbols.length > 1 ? 'watchlist' : 'single',
        symbols,
        primarySymbol: symbols[0],
      },
      replaySpeed: request.replaySpeed ?? 1,
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
        throw new Error(`Symbol spec missing for ${dataset.symbolCode}`);
      }
      candlesBySymbol[dataset.symbolCode] = dataset.candles;
      symbolSpecsBySymbol[dataset.symbolCode] = symbolSpec;
    }

    const engine = createReplayEngine({
      config,
      dataset: { candlesBySymbol, symbolSpecsBySymbol },
      signalGenerator: ({ symbolCode, symbolSpec, candles }) =>
        buildPhase4SignalsFromCandles({ symbolCode, symbolSpec, candles }),
      snapshotBuilder: ({ candles, symbolSpec, evaluationTs }) => ({
        ...buildMarketSnapshot({ candles, symbolSpec, timeframe: config.timeframe }),
        ts: evaluationTs,
      }),
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

    this.sessions.set(runId, { config, engine });

    this.runHistoryRepository.saveLaunchRequest(runId, {
      mode: 'replay',
      replay: config,
    });

    const initial = engine.step(0);
    this.persist(runId, initial.state, 'queued');

    return initial;
  }

  listRuns() {
    return {
      status: 'ok' as const,
      runs: this.runHistoryRepository.listRunSummaries({ mode: 'replay' }),
    };
  }

  getRun(runId: string) {
    const detail = this.runHistoryRepository.getRunDetail(runId as RunId);
    if (!detail) {
      return {
        status: 'not_found' as const,
        runId,
        message: `Replay run ${runId} not found`,
      };
    }

    return {
      status: 'ok' as const,
      run: detail,
    };
  }

  controlRun(runId: string, action: ReplayControlAction): ReplayStepResult {
    const session = this.sessions.get(runId as RunId);
    if (!session) {
      throw new Error(`Replay run ${runId} is not active in memory`);
    }

    const result = session.engine.applyControl(action);

    const status = result.state.playbackState === 'completed'
      ? 'completed'
      : result.state.playbackState === 'playing'
        ? 'running'
        : result.state.playbackState === 'paused'
          ? 'paused'
          : 'queued';

    this.persist(runId as RunId, result.state, status);
    return result;
  }

  private resolveDatasets(request: CreateReplayRequest): DatasetRecord[] {
    if (request.datasetId) {
      const dataset = this.datasetRepository.getDataset(request.datasetId);
      return dataset ? [dataset] : [];
    }

    const all = this.datasetRepository.listDatasets();
    if (!request.symbolCodes?.length) {
      return all;
    }

    return all.filter((dataset) => request.symbolCodes?.includes(dataset.symbolCode));
  }

  private persist(runId: RunId, state: ReplayState, status: RunSummary['status']): void {
    const session = this.sessions.get(runId);
    if (!session) {
      return;
    }

    const summary: RunSummary = {
      runId,
      mode: 'replay',
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
    this.runHistoryRepository.saveRunDetail({
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
    });
  }
}
