import type { DatasetRepository } from '@hashi-bot/data';
import { buildMarketSnapshot, classifyRegime } from '@hashi-bot/strategy';

export class Phase2QueryService {
  constructor(private readonly datasetRepository: DatasetRepository) {}

  getHealth() {
    return {
      ok: true,
      service: 'web-api',
      phase: 'phase-2-foundation',
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
      mode: 'foundation',
      supports: {
        replay: true,
        backtest: true,
        paper: false,
        live: false,
      },
      features: {
        snapshots: true,
        regime: true,
      },
    };
  }

  getSnapshots() {
    const datasets = this.datasetRepository.listDatasets();

    if (datasets.length === 0) {
      return {
        snapshots: [],
        status: 'no_datasets',
        message: 'No datasets imported yet.',
      };
    }

    const snapshots = datasets
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
      .filter((item): item is NonNullable<typeof item> => item != null);

    return {
      snapshots,
      status: 'ok',
    };
  }

  getRegimes() {
    const snapshotPayload = this.getSnapshots();

    if (snapshotPayload.status !== 'ok') {
      return {
        regimes: [],
        status: snapshotPayload.status,
        message: snapshotPayload.message,
      };
    }

    const regimes = snapshotPayload.snapshots.map((item) => ({
      datasetId: item.datasetId,
      symbolCode: item.symbolCode,
      regime: classifyRegime({ snapshot: item.snapshot }),
    }));

    return {
      regimes,
      status: 'ok',
    };
  }
}
