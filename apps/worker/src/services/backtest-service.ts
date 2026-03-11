import type { BacktestRunResult } from '@hashi-bot/backtest';
import { runBacktest } from '@hashi-bot/backtest';
import type { RunId } from '@hashi-bot/core';
import type { BacktestRunRepository, DatasetRepository } from '@hashi-bot/data';

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
    private readonly backtestSignalService: BacktestSignalService
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
