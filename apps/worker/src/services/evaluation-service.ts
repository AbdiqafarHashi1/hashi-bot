import type { MarketSnapshot, SymbolCode } from '@hashi-bot/core';
import type { DatasetRecord, DatasetRepository } from '@hashi-bot/data';
import { buildMarketSnapshot, classifyRegime, type RegimeAssessment } from '@hashi-bot/strategy';

export interface EvaluationResult {
  datasetId: string;
  symbolCode: SymbolCode;
  snapshot: MarketSnapshot;
  regime: RegimeAssessment;
}

export class EvaluationService {
  constructor(private readonly datasetRepository: DatasetRepository) {}

  evaluateDataset(datasetId: string): EvaluationResult {
    const dataset = this.datasetRepository.getDataset(datasetId);
    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    return this.evaluateDatasetRecord(dataset);
  }

  evaluateLatestAcrossDatasets(): EvaluationResult[] {
    return this.datasetRepository.listDatasets().map((dataset) => this.evaluateDatasetRecord(dataset));
  }

  private evaluateDatasetRecord(dataset: DatasetRecord): EvaluationResult {
    const symbolSpec = this.datasetRepository.getSymbol(dataset.symbolCode);
    if (!symbolSpec) {
      throw new Error(`Symbol spec missing for ${dataset.symbolCode}`);
    }

    const snapshot = buildMarketSnapshot({
      candles: dataset.candles,
      symbolSpec,
      timeframe: dataset.timeframe,
    });

    const regime = classifyRegime({ snapshot });

    return {
      datasetId: dataset.id,
      symbolCode: dataset.symbolCode,
      snapshot,
      regime,
    };
  }
}
