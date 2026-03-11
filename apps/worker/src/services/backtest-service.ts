import type { BacktestRunResult, RunDetailView } from '@hashi-bot/backtest';
import { runBacktest } from '@hashi-bot/backtest';
import type { RunId } from '@hashi-bot/core';
import type { BacktestRunRepository, DatasetRepository, RunHistoryRepository } from '@hashi-bot/data';

import { BacktestSignalService } from './backtest-signal.service.js';

export interface RunBacktestParams {
  datasetId?: string;
  profileCode?: 'GROWTH_HUNTER' | 'PROP_HUNTER';
  slippageBps?: number;
  commissionBps?: number;
}

export class BacktestService {
  constructor(
    private readonly datasetRepository: DatasetRepository,
    private readonly backtestRunRepository: BacktestRunRepository,
    private readonly backtestSignalService: BacktestSignalService,
    private readonly runHistoryRepository: RunHistoryRepository
  ) {}

  runBacktest(params: RunBacktestParams = {}): BacktestRunResult {
    const datasets = params.datasetId
      ? [this.mustGetDataset(params.datasetId)]
      : this.datasetRepository.listDatasets();

    const candlesBySymbol: Record<string, (typeof datasets)[number]['candles']> = {};
    const symbolSpecsBySymbol: Record<string, NonNullable<ReturnType<DatasetRepository['getSymbol']>>> = {};

    for (const dataset of datasets) {
      candlesBySymbol[dataset.symbolCode] = dataset.candles;
      const symbolSpec = this.datasetRepository.getSymbol(dataset.symbolCode);
      if (!symbolSpec) {
        throw new Error(`Symbol spec missing for ${dataset.symbolCode}`);
      }
      symbolSpecsBySymbol[dataset.symbolCode] = symbolSpec;
    }

    const minTs = Math.min(...datasets.map((d) => d.candles[0]?.ts ?? Number.MAX_SAFE_INTEGER));
    const maxTs = Math.max(...datasets.map((d) => d.candles.at(-1)?.ts ?? 0));

    const result = runBacktest({
      config: {
        runId: (`run-${Date.now()}` as unknown) as RunId,
        profileCode: params.profileCode ?? 'GROWTH_HUNTER',
        timeframe: datasets[0]?.timeframe ?? '1m',
        symbols: datasets.map((d) => d.symbolCode),
        fromTs: minTs as BacktestRunResult['config']['fromTs'],
        toTs: maxTs as BacktestRunResult['config']['toTs'],
        initialBalance: 10_000,
        slippageBps: params.slippageBps ?? 5,
        commissionBps: params.commissionBps ?? 4,
        maxConcurrentPositions: 5
      },
      dataset: {
        candlesBySymbol,
        symbolSpecsBySymbol
      },
      signalGenerator: ({ symbolCode, symbolSpec, candles }) => this.backtestSignalService.buildSignals({ symbolCode, symbolSpec, candles })
    });

    this.backtestRunRepository.saveRun(result);

    this.runHistoryRepository.saveRunSummary({
      runId: result.metadata.runId,
      mode: 'backtest',
      status: 'completed',
      profileCode: result.config.profileCode,
      timeframe: result.config.timeframe,
      symbols: result.config.symbols,
      startedAtTs: result.metadata.startedAtTs,
      completedAtTs: result.metadata.completedAtTs,
      totalTrades: result.metrics.totalTrades,
      winRatePct: result.metrics.winRatePct,
      netPnl: result.metrics.netPnl,
      maxDrawdownPct: result.metrics.maxDrawdownPct
    });

    const detail: RunDetailView = {
      summary: {
        runId: result.metadata.runId,
        mode: 'backtest',
        status: 'completed',
        profileCode: result.config.profileCode,
        timeframe: result.config.timeframe,
        symbols: result.config.symbols,
        startedAtTs: result.metadata.startedAtTs,
        completedAtTs: result.metadata.completedAtTs,
        totalTrades: result.metrics.totalTrades,
        winRatePct: result.metrics.winRatePct,
        netPnl: result.metrics.netPnl,
        maxDrawdownPct: result.metrics.maxDrawdownPct
      },
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
        closeReason: trade.closeReason
      })),
      metrics: {
        totalTrades: result.metrics.totalTrades,
        winRatePct: result.metrics.winRatePct,
        netPnl: result.metrics.netPnl,
        maxDrawdownPct: result.metrics.maxDrawdownPct
      },
      timeline: []
    };

    this.runHistoryRepository.saveRunDetail(detail);
    return result;
  }

  listRunSummaries() {
    return this.backtestRunRepository.listRunSummaries();
  }

  private mustGetDataset(datasetId: string) {
    const dataset = this.datasetRepository.getDataset(datasetId);
    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    return dataset;
  }
}
