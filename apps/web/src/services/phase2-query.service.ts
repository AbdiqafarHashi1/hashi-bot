import type { ProfileCode, SymbolSpec } from '@hashi-bot/core';
import type { BacktestRunRepository, DatasetRecord, DatasetRepository } from '@hashi-bot/data';
import { runBacktest, type BacktestRunResult } from '@hashi-bot/backtest';
import { buildMarketSnapshot, buildPhase4SignalsFromCandles, classifyRegime } from '@hashi-bot/strategy';


export type BacktestRunDetailResponse =
  | {
      status: 'ok';
      run: {
        metadata: BacktestRunResult['metadata'];
        config: BacktestRunResult['config'];
        metrics: BacktestRunResult['metrics'];
        tradeLogSummary: Array<{
          tradeId: string;
          symbolCode: string;
          side: string;
          setupCode: string;
          state: string;
          netPnl: number | undefined;
          openedAtTs: number | undefined;
          closedAtTs: number | undefined;
          closeReason: string | undefined;
        }>;
        equity: BacktestRunResult['equity'];
        rejectedSignals: number;
      };
    }
  | {
      status: 'not_found';
      runId: string;
      message: string;
    };

export class Phase2QueryService {
  constructor(
    private readonly datasetRepository: DatasetRepository,
    private readonly backtestRunRepository: BacktestRunRepository
  ) {}

  getHealth() {
    return {
      ok: true,
      service: 'web-api',
      phase: 'phase-4-backtest-visible',
      ts: new Date().toISOString()
    };
  }

  getSymbols() {
    return {
      symbols: this.datasetRepository.listSymbols()
    };
  }

  getDatasets() {
    const datasets = this.datasetRepository.listDatasets().map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      symbolCode: dataset.symbolCode,
      timeframe: dataset.timeframe,
      candleCount: dataset.candles.length
    }));

    return { datasets };
  }

  getConfig() {
    return {
      mode: 'phase4',
      supports: {
        replay: true,
        backtest: true,
        paper: false,
        live: false
      },
      features: {
        snapshots: true,
        regime: true,
        riskDecisioning: true,
        lifecycleSimulation: true,
        metrics: true
      }
    };
  }

  getSnapshots() {
    const snapshots = this.buildSnapshots();

    if (snapshots.length === 0) {
      return {
        snapshots: [],
        status: 'no_datasets',
        message: 'No datasets imported yet.'
      };
    }

    return {
      snapshots,
      status: 'ok',
    };
  }

  getRegimes() {
    const snapshots = this.buildSnapshots();

    if (snapshots.length === 0) {
      return {
        regimes: [],
        status: 'no_datasets',
        message: 'No datasets imported yet.',
      };
    }

    const regimes = snapshots.map((item) => ({
      datasetId: item.datasetId,
      symbolCode: item.symbolCode,
      regime: classifyRegime({ snapshot: item.snapshot }),
    }));

    return {
      regimes,
      status: 'ok',
    };
  }

  getSignals() {
    const contexts = this.buildStrategyContexts();

    if (contexts.length === 0) {
      return {
        symbolsEvaluated: [],
        qualifiedSignals: [],
        unqualifiedSummary: { totalUnqualifiedSetups: 0, bySymbol: {} },
        bestSignals: { bySymbol: {}, top: undefined },
        status: 'no_datasets',
      };
    }

    const multiContext: MultiSymbolStrategyContext = {
      contextsBySymbol: Object.fromEntries(contexts.map((item) => [item.symbolCode, item.context])),
      snapshotsBySymbol: Object.fromEntries(contexts.map((item) => [item.symbolCode, item.context.snapshot])),
      regimesBySymbol: Object.fromEntries(contexts.map((item) => [item.symbolCode, item.context.regime])),
    };

    const batch = evaluateStrategyBatch({ context: multiContext });

    const qualifiedSignals = contexts.flatMap((item) =>
      batch.batch.bySymbol[item.symbolCode]?.signals.map((signal) => ({
        datasetId: item.datasetId,
        symbolCode: item.symbolCode,
        signal,
      })) ?? []
    );

    const unqualifiedBySymbol = Object.fromEntries(
      contexts.map((item) => {
        const result = batch.batch.bySymbol[item.symbolCode];
        return [item.symbolCode, result ? result.rejectedSetups.length : 0];
      })
    );

    const bestBySymbol = Object.fromEntries(
      contexts.map((item) => {
        const signal = batch.batch.bySymbol[item.symbolCode]?.bestSignal;
        return [item.symbolCode, signal];
      })
    );

    return {
      symbolsEvaluated: contexts.map((item) => item.symbolCode),
      qualifiedSignals,
      unqualifiedSummary: {
        totalUnqualifiedSetups: Object.values(unqualifiedBySymbol).reduce((sum, value) => sum + value, 0),
        bySymbol: unqualifiedBySymbol,
      },
      bestSignals: {
        bySymbol: bestBySymbol,
        top: batch.rankedSignals[0],
      },
      ranking: batch.rankedSignals,
      status: 'ok',
    };
  }

  private buildSnapshots(): SnapshotRecord[] {
    return this.datasetRepository.listDatasets()
      .map((dataset) => {
        const symbolSpec = this.datasetRepository.getSymbol(dataset.symbolCode);
        if (!symbolSpec) {
          return null;
        }

        const snapshot = buildMarketSnapshot({
          candles: dataset.candles,
          symbolSpec,
          timeframe: dataset.timeframe
        });

        return {
          datasetId: dataset.id,
          symbolCode: dataset.symbolCode,
          snapshot
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);

    return {
      snapshots,
      status: 'ok'
    };
  }

  private buildStrategyContexts() {
    return this.datasetRepository.listDatasets()
      .map((dataset) => {
        const symbolSpec = this.datasetRepository.getSymbol(dataset.symbolCode);
        if (!symbolSpec) {
          return null;
        }

    if (snapshotPayload.status !== 'ok') {
      return {
        regimes: [],
        status: snapshotPayload.status,
        message: snapshotPayload.message
      };
    }

    const regimes = snapshotPayload.snapshots.map((item) => ({
      datasetId: item.datasetId,
      symbolCode: item.symbolCode,
      regime: classifyRegime({ snapshot: item.snapshot })
    }));

    return {
      regimes,
      status: 'ok'
    };
  }

  getBacktestConfigs() {
    const datasets = this.getDatasets().datasets;

    return {
      profiles: ['GROWTH_HUNTER', 'PROP_HUNTER'] as ProfileCode[],
      datasets,
      defaults: {
        initialBalance: 10_000,
        slippageBps: 5,
        commissionBps: 4,
        maxConcurrentPositions: 5
      }
    };
  }

  getBacktestRuns() {
    this.ensureBacktestSeedRun();

    return {
      runs: this.backtestRunRepository.listRunSummaries(),
      status: 'ok'
    };
  }

  getBacktestRun(runId: string): BacktestRunDetailResponse {
    this.ensureBacktestSeedRun();

    const run = this.backtestRunRepository.getRun(runId as BacktestRunResult['metadata']['runId']);
    if (!run) {
      return {
        status: 'not_found',
        runId,
        message: `Backtest run ${runId} not found`
      };
    }

    return {
      status: 'ok',
      run: {
        metadata: run.metadata,
        config: run.config,
        metrics: run.metrics,
        tradeLogSummary: run.trades.map((trade) => ({
          tradeId: trade.tradeId,
          symbolCode: trade.symbolCode,
          side: trade.side,
          setupCode: trade.setupCode,
          state: trade.lifecycleState,
          netPnl: trade.netPnl,
          openedAtTs: trade.position.openedAtTs,
          closedAtTs: trade.position.closedAtTs,
          closeReason: trade.closeReason
        })),
        equity: run.equity,
        rejectedSignals: run.rejectedSignals?.length ?? 0
      }
    };
  }

  private ensureBacktestSeedRun(): void {
    if (this.backtestRunRepository.listRunSummaries().length > 0) {
      return;
    }

    const datasets = this.datasetRepository.listDatasets();
    if (datasets.length === 0) {
      return;
    }

    const candlesBySymbol: Record<string, DatasetRecord['candles']> = {};
    const symbolSpecsBySymbol: Record<string, SymbolSpec> = {};

    for (const dataset of datasets) {
      candlesBySymbol[dataset.symbolCode] = dataset.candles;
      const spec = this.datasetRepository.getSymbol(dataset.symbolCode);
      if (!spec) {
        continue;
      }
      symbolSpecsBySymbol[dataset.symbolCode] = spec;
    }

    const minTs = Math.min(...datasets.map((d) => d.candles[0]?.ts ?? Number.MAX_SAFE_INTEGER));
    const maxTs = Math.max(...datasets.map((d) => d.candles.at(-1)?.ts ?? 0));

    const result = runBacktest({
      config: {
        runId: `web-seed-${Date.now()}` as BacktestRunResult['metadata']['runId'],
        profileCode: 'GROWTH_HUNTER',
        timeframe: datasets[0]?.timeframe ?? '1m',
        symbols: datasets.map((d) => d.symbolCode),
        fromTs: minTs as BacktestRunResult['config']['fromTs'],
        toTs: maxTs as BacktestRunResult['config']['toTs'],
        initialBalance: 10_000,
        slippageBps: 5,
        commissionBps: 4,
        maxConcurrentPositions: 5
      },
      dataset: { candlesBySymbol, symbolSpecsBySymbol },
      signalGenerator: ({ symbolCode, symbolSpec, candles }) =>
        buildPhase4SignalsFromCandles({ symbolCode, symbolSpec, candles })
    });

    this.backtestRunRepository.saveRun(result);
  }

}
