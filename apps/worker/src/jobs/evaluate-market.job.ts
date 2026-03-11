import type { EvaluationResult } from '../services/evaluation-service.js';
import type { WorkerContainer } from '../lib/container.js';

export function runEvaluateMarketJob(container: WorkerContainer, datasetId?: string): EvaluationResult[] {
  if (datasetId) {
    return [container.evaluationService.evaluateDataset(datasetId)];
  }

  return container.evaluationService.evaluateLatestAcrossDatasets();
}
