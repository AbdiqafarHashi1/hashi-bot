import type { MarketSnapshot, SymbolCode } from '@hashi-bot/core';
import type { DatasetRecord, DatasetRepository } from '@hashi-bot/data';
import {
  buildMarketSnapshot,
  classifyRegime,
  evaluateStrategyBatch,
  evaluateStrategyContext,
  type MultiSymbolStrategyContext,
  type RegimeAssessment,
  type StrategyBatchEvaluationResult,
  type StrategyContext,
  type StrategyRunResult,
} from '@hashi-bot/strategy';

export interface EvaluationResult {
  datasetId: string;
  symbolCode: SymbolCode;
  snapshot: MarketSnapshot;
  regime: RegimeAssessment;
  strategy: StrategyRunResult;
}

export interface BatchEvaluationResult {
  evaluatedSymbols: SymbolCode[];
  byDatasetId: Record<string, EvaluationResult>;
  strategyBatch: StrategyBatchEvaluationResult;
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

  evaluateBatch(options?: { watchlistSymbolCodes?: SymbolCode[]; rankingLimit?: number }): BatchEvaluationResult {
    const datasets = this.datasetRepository.listDatasets();
    const contexts = datasets.map((dataset) => {
      const result = this.evaluateDatasetRecord(dataset);
      return {
        dataset,
        result,
        context: this.toStrategyContext(dataset, result.snapshot, result.regime),
      };
    });

    const multiContext: MultiSymbolStrategyContext = {
      contextsBySymbol: Object.fromEntries(contexts.map((item) => [item.result.symbolCode, item.context])),
      snapshotsBySymbol: Object.fromEntries(contexts.map((item) => [item.result.symbolCode, item.result.snapshot])),
      regimesBySymbol: Object.fromEntries(contexts.map((item) => [item.result.symbolCode, item.result.regime])),
    };

    const strategyBatch = evaluateStrategyBatch({
      context: multiContext,
      watchlistSymbolCodes: options?.watchlistSymbolCodes,
      rankingLimit: options?.rankingLimit,
    });

    const byDatasetId = Object.fromEntries(
      contexts.map((item) => {
        const runResult = strategyBatch.batch.bySymbol[item.result.symbolCode] ?? item.result.strategy;

        return [
          item.dataset.id,
          {
            ...item.result,
            strategy: runResult,
          } satisfies EvaluationResult,
        ];
      })
    );

    return {
      evaluatedSymbols: contexts.map((item) => item.result.symbolCode),
      byDatasetId,
      strategyBatch,
    };
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
    const strategyContext = this.toStrategyContext(dataset, snapshot, regime);
    const strategy = evaluateStrategyContext(strategyContext);

    return {
      datasetId: dataset.id,
      symbolCode: dataset.symbolCode,
      snapshot,
      regime,
      strategy,
    };
  }

  private toStrategyContext(
    dataset: DatasetRecord,
    snapshot: MarketSnapshot,
    regime: RegimeAssessment
  ): StrategyContext {
    const symbolSpec = this.datasetRepository.getSymbol(dataset.symbolCode);
    if (!symbolSpec) {
      throw new Error(`Symbol spec missing for ${dataset.symbolCode}`);
    }

    return {
      symbolCode: dataset.symbolCode,
      timeframe: dataset.timeframe,
      candles: dataset.candles,
      symbolSpec,
      snapshot,
      regime,
    };
  }
}
