import {
  InMemoryBacktestRunRepository,
  InMemoryDatasetRepository,
  InMemoryRunHistoryRepository,
  type BacktestRunRepository,
  type DatasetRepository,
  type RunHistoryRepository
} from '@hashi-bot/data';

import { EvaluationService } from '../services/evaluation-service.js';
import { BacktestService } from '../services/backtest-service.js';
import { BacktestSignalService } from '../services/backtest-signal.service.js';
import { ReplayService } from '../services/replay-service.js';

export interface WorkerContainer {
  datasetRepository: DatasetRepository;
  backtestRunRepository: BacktestRunRepository;
  evaluationService: EvaluationService;
  backtestSignalService: BacktestSignalService;
  backtestService: BacktestService;
  runHistoryRepository: RunHistoryRepository;
  replayService: ReplayService;
}

export function createWorkerContainer(): WorkerContainer {
  const datasetRepository = new InMemoryDatasetRepository();
  const backtestRunRepository = new InMemoryBacktestRunRepository();
  const backtestSignalService = new BacktestSignalService();
  const runHistoryRepository = new InMemoryRunHistoryRepository();

  return {
    datasetRepository,
    backtestRunRepository,
    evaluationService: new EvaluationService(datasetRepository),
    backtestSignalService,
    backtestService: new BacktestService(datasetRepository, backtestRunRepository, backtestSignalService, runHistoryRepository),
    runHistoryRepository,
    replayService: new ReplayService(datasetRepository, runHistoryRepository)
  };
}
