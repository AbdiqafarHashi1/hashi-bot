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

export class InstantBacktestService {
  constructor(
    private readonly datasetRepository: DatasetRepository,
    private readonly backtestRunRepository: BacktestRunRepository,
    private readonly runHistoryRepository: RunHistoryRepository
  ) {}

  launch(request: InstantBacktestRequest): LaunchBacktestResponse {
    const datasets = this.resolveDatasets(request);
    if (datasets.length === 0) {
      throw new Error('No datasets match instant backtest request');
    }

    const runId = createRunId();
    const fromTs = request.fromTs ?? (Math.min(...datasets.map((d) => d.candles[0]?.ts ?? Number.MAX_SAFE_INTEGER)) as InstantBacktestRequest['fromTs']);
    const toTs = request.toTs ?? (Math.max(...datasets.map((d) => d.candles.at(-1)?.ts ?? 0)) as InstantBacktestRequest['toTs']);

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
        fromTs,
        toTs,
      },
    };

    const result = runBacktest({
      config: {
        runId,
        profileCode: request.profileCode,
        timeframe: request.timeframe,
        symbols: datasets.map((d) => d.symbolCode),
        fromTs: fromTs as BacktestRunResult['config']['fromTs'],
        toTs: toTs as BacktestRunResult['config']['toTs'],
        initialBalance: request.initialBalance ?? 10_000,
        slippageBps: request.slippageBps ?? 5,
        commissionBps: request.commissionBps ?? 4,
        maxConcurrentPositions: request.maxConcurrentPositions ?? 5,
      },
      dataset: { candlesBySymbol, symbolSpecsBySymbol },
      signalGenerator: ({ symbolCode, symbolSpec, candles }) =>
        buildPhase4SignalsFromCandles({ symbolCode, symbolSpec, candles }),
    });

    this.backtestRunRepository.saveRun(result);
    this.runHistoryRepository.saveLaunchRequest(runId, runRequest);

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

    this.runHistoryRepository.saveRunSummary(summary);
    this.runHistoryRepository.saveRunDetail(this.toDetail(result, summary));

    return { status: 'accepted', request: runRequest, run: summary };
  }

  listRuns() {
    return {
      status: 'ok' as const,
      runs: this.runHistoryRepository.listRunSummaries({ mode: 'backtest' }),
    };
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

    return all.filter((dataset) => request.symbols.includes(dataset.symbolCode));
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
