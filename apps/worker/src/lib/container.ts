import { InMemoryDatasetRepository, type DatasetRepository } from '@hashi-bot/data';

import { EvaluationService } from '../services/evaluation-service.js';

export interface WorkerContainer {
  datasetRepository: DatasetRepository;
  evaluationService: EvaluationService;
}

export function createWorkerContainer(): WorkerContainer {
  const datasetRepository = new InMemoryDatasetRepository();

  return {
    datasetRepository,
    evaluationService: new EvaluationService(datasetRepository),
  };
}
