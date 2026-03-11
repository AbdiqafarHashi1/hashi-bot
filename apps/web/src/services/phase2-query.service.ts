import type { DatasetRepository } from '@hashi-bot/data';
import type { SymbolCode } from '@hashi-bot/core';
import {
  buildMarketSnapshot,
  classifyRegime,
  evaluateStrategyBatch,
  type MultiSymbolStrategyContext
} from '@hashi-bot/strategy';

export interface SnapshotRecord {
  datasetId: string;
  symbolCode: SymbolCode;
  snapshot: ReturnType<typeof buildMarketSnapshot>;
}

export class Phase2QueryService {
  constructor(private readonly datasetRepository: DatasetRepository) {}

  getHealth() {
    return {
      ok: true,
      service: 'web-api',
      phase: 'phase-3-signal-layer',
      ts: new Date().toISOString(),
    };
  }

  getSymbols() {
    return {
      symbols: this.datasetRepository.listSymbols(),
    };
  }

  getDatasets() {
    const datasets = this.datasetRepository.listDatasets().map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      symbolCode: dataset.symbolCode,
      timeframe: dataset.timeframe,
      candleCount: dataset.candles.length,
    }));

    return { datasets };
  }

  getConfig() {
    return {
      mode: 'phase3_signal_ready',
      supports: {
        replay: true,
        backtest: true,
        paper: false,
        live: false,
      },
      features: {
        snapshots: true,
        regime: true,
        signals: true,
      },
    };
  }

  getSnapshots() {
    const snapshots = this.buildSnapshots();

    if (snapshots.length === 0) {
      return {
        snapshots: [],
        status: 'no_datasets',
        message: 'No datasets imported yet.',
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
          timeframe: dataset.timeframe,
        });

        return {
          datasetId: dataset.id,
          symbolCode: dataset.symbolCode,
          snapshot,
        };
      })
      .filter((item): item is SnapshotRecord => item != null);
  }

  private buildStrategyContexts() {
    return this.datasetRepository.listDatasets()
      .map((dataset) => {
        const symbolSpec = this.datasetRepository.getSymbol(dataset.symbolCode);
        if (!symbolSpec) {
          return null;
        }

        const snapshot = buildMarketSnapshot({
          candles: dataset.candles,
          symbolSpec,
          timeframe: dataset.timeframe,
        });
        const regime = classifyRegime({ snapshot });

        const context = {
          symbolCode: dataset.symbolCode,
          timeframe: dataset.timeframe,
          candles: dataset.candles,
          symbolSpec,
          snapshot,
          regime,
        };

        return {
          datasetId: dataset.id,
          symbolCode: dataset.symbolCode,
          context,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);
  }
}
