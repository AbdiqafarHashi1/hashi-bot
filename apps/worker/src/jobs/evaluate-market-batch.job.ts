import type { SymbolCode } from '@hashi-bot/core';

import type { WorkerContainer } from '../lib/container.js';
import type { BatchEvaluationResult } from '../services/evaluation-service.js';

export interface EvaluateMarketBatchJobOptions {
  watchlistSymbolCodes?: SymbolCode[];
  rankingLimit?: number;
}

export function runEvaluateMarketBatchJob(
  container: WorkerContainer,
  options: EvaluateMarketBatchJobOptions = {}
): BatchEvaluationResult {
  return container.evaluationService.evaluateBatch(options);
}
