import {
  InMemoryBacktestRunRepository,
  InMemoryDatasetRepository,
  type BacktestRunRepository,
  type DatasetRepository
} from '@hashi-bot/data';

import { EvaluationService } from '../services/evaluation-service.js';
import { BacktestService } from '../services/backtest-service.js';
import { BacktestSignalService } from '../services/backtest-signal.service.js';

export interface WorkerContainer {
  datasetRepository: DatasetRepository;
  backtestRunRepository: BacktestRunRepository;
  evaluationService: EvaluationService;
  backtestSignalService: BacktestSignalService;
  backtestService: BacktestService;
}

export function createWorkerContainer(): WorkerContainer {
  const datasetRepository = new InMemoryDatasetRepository();
  const backtestRunRepository = new InMemoryBacktestRunRepository();
  const backtestSignalService = new BacktestSignalService();

  return {
    datasetRepository,
    backtestRunRepository,
    evaluationService: new EvaluationService(datasetRepository),
    backtestSignalService,
    backtestService: new BacktestService(datasetRepository, backtestRunRepository, backtestSignalService)
  };
}
