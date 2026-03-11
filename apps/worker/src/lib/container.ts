import {
  InMemoryBacktestRunRepository,
  InMemoryDatasetRepository,
  InMemoryRunHistoryRepository,
  type BacktestRunRepository,
  type DatasetRepository,
  type RunHistoryRepository
} from '@hashi-bot/data';
import { JsonOperationalStateRepository, type OperationalStateRepository } from '@hashi-bot/storage';

import { EvaluationService } from '../services/evaluation-service.js';
import { BacktestService } from '../services/backtest-service.js';
import { BacktestSignalService } from '../services/backtest-signal.service.js';
import { ReplayService } from '../services/replay-service.js';
import { OperationalSafetyService } from '../services/operational-safety.service.js';
import { LiveStateStoreService } from '../services/live-state-store.service.js';
import { LiveVenueSyncService } from '../services/live-venue-sync.service.js';
import { WorkerStartupRecoveryService } from '../services/startup-recovery.service.js';
import { OperatorSafetyRailsService } from '../services/operator-safety-rails.service.js';

export interface WorkerContainer {
  datasetRepository: DatasetRepository;
  backtestRunRepository: BacktestRunRepository;
  evaluationService: EvaluationService;
  backtestSignalService: BacktestSignalService;
  backtestService: BacktestService;
  runHistoryRepository: RunHistoryRepository;
  replayService: ReplayService;
  operationalSafetyService: OperationalSafetyService;
  liveStateStoreService: LiveStateStoreService;
  liveVenueSyncService: LiveVenueSyncService;
  startupRecoveryService: WorkerStartupRecoveryService;
  operatorSafetyRailsService: OperatorSafetyRailsService;
  operationalStateRepository: OperationalStateRepository;
}

export interface WorkerContainerOptions {
  executionVenue?: 'mock' | 'ccxt' | 'ctrader';
}

export function createWorkerContainer(options: WorkerContainerOptions = {}): WorkerContainer {
  const datasetRepository = new InMemoryDatasetRepository();
  const backtestRunRepository = new InMemoryBacktestRunRepository();
  const backtestSignalService = new BacktestSignalService();
  const runHistoryRepository = new InMemoryRunHistoryRepository();
  const executionVenue = options.executionVenue ?? 'mock';
  const liveStateStoreService = new LiveStateStoreService();
  const liveVenueSyncService = new LiveVenueSyncService(executionVenue);
  const operationalStateRepository = new JsonOperationalStateRepository();

  return {
    datasetRepository,
    backtestRunRepository,
    evaluationService: new EvaluationService(datasetRepository),
    backtestSignalService,
    backtestService: new BacktestService(datasetRepository, backtestRunRepository, backtestSignalService, runHistoryRepository),
    runHistoryRepository,
    replayService: new ReplayService(datasetRepository, runHistoryRepository),
    operationalSafetyService: new OperationalSafetyService(executionVenue, operationalStateRepository),
    liveStateStoreService,
    liveVenueSyncService,
    startupRecoveryService: new WorkerStartupRecoveryService(liveStateStoreService, liveVenueSyncService),
    operatorSafetyRailsService: new OperatorSafetyRailsService(),
    operationalStateRepository
  };
}
