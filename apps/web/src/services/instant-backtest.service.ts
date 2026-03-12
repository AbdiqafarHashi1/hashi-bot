import type {
  BacktestRunResult,
  InstantBacktestRequest,
  RunDetailView,
  RunLaunchRequest,
  RunSummary,
} from '@hashi-bot/backtest';
import { runBacktest } from '@hashi-bot/backtest';
import { createRunId, type RunId } from '@hashi-bot/core';
import type { BacktestRunRepository, DatasetRecord, DatasetRepository, RunHistoryRepository } from '@hashi-bot/data';
import { buildPhase4SignalsFromCandles } from '@hashi-bot/strategy';

export interface LaunchBacktestResponse {
  status: 'accepted';
  request: RunLaunchRequest;
  run: RunSummary;
}


function toFiniteNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizePositiveNumber(value: number | undefined, fallback: number): number {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined) {
    return fallback;
  }
  return parsed > 0 ? parsed : fallback;
}

function sanitizeNonNegativeNumber(value: number | undefined, fallback: number): number {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined) {
    return fallback;
  }
  return parsed >= 0 ? parsed : fallback;
}
export class InstantBacktestService {
  constructor(
    private readonly datasetRepository: DatasetRepository,
    private readonly backtestRunRepository: BacktestRunRepository,
    private readonly runHistoryRepository: RunHistoryRepository
  ) {}

  launch(request: InstantBacktestRequest): LaunchBacktestResponse {
    if (!request.symbols || request.symbols.length === 0) {
      throw new Error('Instant backtest requires at least one symbol.');
    }

    const datasets = this.resolveDatasets(request);
    if (datasets.length === 0) {
      throw new Error('No datasets match instant backtest request');
    }

    const runId = createRunId();
    const fromTsRaw = request.fromTs ?? (Math.min(...datasets.map((d) => d.candles[0]?.ts ?? Number.MAX_SAFE_INTEGER)) as InstantBacktestRequest['fromTs']);
    const toTsRaw = request.toTs ?? (Math.max(...datasets.map((d) => d.candles.at(-1)?.ts ?? 0)) as InstantBacktestRequest['toTs']);
    const fromTs = Number(fromTsRaw);
    const toTs = Number(toTsRaw);

    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || fromTs > toTs) {
      throw new Error('Invalid backtest window: fromTs must be <= toTs and finite.');
    }

    const resolvedFromTs = fromTs as NonNullable<InstantBacktestRequest['fromTs']>;
    const resolvedToTs = toTs as NonNullable<InstantBacktestRequest['toTs']>;

    const candlesBySymbol: Record<string, DatasetRecord['candles']> = {};
    const symbolSpecsBySymbol: Record<string, NonNullable<ReturnType<DatasetRepository['getSymbol']>>> = {};

    for (const dataset of datasets) {
      candlesBySymbol[dataset.symbolCode] = dataset.candles;
      const spec = this.datasetRepository.getSymbol(dataset.symbolCode);
      if (!spec) {
        throw new Error(`Symbol spec missing for ${dataset.symbolCode}`);
      }
      symbolSpecsBySymbol[dataset.symbolCode] = spec;
    }

    const runRequest: RunLaunchRequest = {
      mode: 'instant_backtest',
      instantBacktest: {
        ...request,
        symbols: datasets.map((d) => d.symbolCode),
        fromTs: resolvedFromTs,
        toTs: resolvedToTs,
      },
    };

    const result = runBacktest({
      config: {
        runId,
        profileCode: request.profileCode,
        timeframe: request.timeframe,
        symbols: datasets.map((d) => d.symbolCode),
        fromTs: resolvedFromTs as BacktestRunResult['config']['fromTs'],
        toTs: resolvedToTs as BacktestRunResult['config']['toTs'],
        initialBalance: sanitizePositiveNumber(request.initialBalance, 10_000),
        slippageBps: sanitizeNonNegativeNumber(request.slippageBps, 5),
        commissionBps: sanitizeNonNegativeNumber(request.commissionBps, 4),
        maxConcurrentPositions: Math.max(1, Math.floor(sanitizePositiveNumber(request.maxConcurrentPositions, 5))),
      },
      dataset: { candlesBySymbol, symbolSpecsBySymbol },
      signalGenerator: ({ symbolCode, symbolSpec, candles }) =>
        buildPhase4SignalsFromCandles({ symbolCode, symbolSpec, candles }),
    });

    try {
      this.backtestRunRepository.saveRun(result);
      this.runHistoryRepository.saveLaunchRequest(runId, runRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_backtest_persistence_error';
      throw new Error(`Backtest persistence failed: ${message}`);
    }

    const summary: RunSummary = {
      runId,
      mode: 'backtest',
      status: 'completed',
      datasetId: request.datasetId,
      profileCode: result.config.profileCode,
      timeframe: result.config.timeframe,
      symbols: result.config.symbols,
      startedAtTs: result.metadata.startedAtTs,
      completedAtTs: result.metadata.completedAtTs,
      totalTrades: result.metrics.totalTrades,
      winRatePct: result.metrics.winRatePct,
      netPnl: result.metrics.netPnl,
      maxDrawdownPct: result.metrics.maxDrawdownPct,
    };

    try {
      this.runHistoryRepository.saveRunSummary(summary);
      this.runHistoryRepository.saveRunDetail(this.toDetail(result, summary));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_run_history_persistence_error';
      throw new Error(`Run history persistence failed: ${message}`);
    }

    return { status: 'accepted', request: runRequest, run: summary };
  }

  listRuns(query: { limit?: number; offset?: number } = {}) {
    try {
      return {
        status: 'ok' as const,
        runs: this.runHistoryRepository.listRunSummaries({ mode: 'backtest', limit: query.limit, offset: query.offset })
      };
    } catch (error) {
      return {
        status: 'unavailable' as const,
        runs: [],
        message: error instanceof Error ? error.message : 'unknown_run_list_error'
      };
    }
  }

  getRun(runId: string) {
    const detail = this.runHistoryRepository.getRunDetail(runId as RunId);
    if (!detail) {
      return { status: 'not_found' as const, runId, message: `Backtest run ${runId} not found` };
    }

    return { status: 'ok' as const, run: detail };
  }

  private resolveDatasets(request: InstantBacktestRequest): DatasetRecord[] {
    if (request.datasetId) {
      const dataset = this.datasetRepository.getDataset(request.datasetId);
      return dataset ? [dataset] : [];
    }

    const all = this.datasetRepository.listDatasets();
    if (!request.symbols.length) {
      return all;
    }

    const symbolSet = new Set(request.symbols);
    return all.filter((dataset) => symbolSet.has(dataset.symbolCode));
  }

  private toDetail(result: BacktestRunResult, summary: RunSummary): RunDetailView {
    return {
      summary,
      backtestConfig: result.config,
      tradeSummaries: result.trades.map((trade) => ({
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
        totalTrades: result.metrics.totalTrades,
        winRatePct: result.metrics.winRatePct,
        netPnl: result.metrics.netPnl,
        maxDrawdownPct: result.metrics.maxDrawdownPct,
      },
      timeline: [],
      timelineSummary: {
        totalEvents: 0,
        eventTypes: {},
      },
    };
  }
}
