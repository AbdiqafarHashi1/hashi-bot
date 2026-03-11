import {
  InMemoryBacktestRunRepository,
  InMemoryDatasetRepository,
  InMemoryRunHistoryRepository,
  type BacktestRunRepository,
  type DatasetRepository,
  type RunHistoryRepository
} from '@hashi-bot/data';

import { FoundationPagesService } from '../services/foundation-pages.service.js';
import { Phase2QueryService } from '../services/phase2-query.service.js';
import { InstantBacktestService } from '../services/instant-backtest.service.js';
import { ReplayApiService } from '../services/replay-api.service.js';

export interface WebContainer {
  datasetRepository: DatasetRepository;
  backtestRunRepository: BacktestRunRepository;
  queryService: Phase2QueryService;
  instantBacktestService: InstantBacktestService;
  runHistoryRepository: RunHistoryRepository;
  replayApiService: ReplayApiService;
  pagesService: FoundationPagesService;
}

export function createWebContainer(): WebContainer {
  const datasetRepository = new InMemoryDatasetRepository();
  const backtestRunRepository = new InMemoryBacktestRunRepository();
  const runHistoryRepository = new InMemoryRunHistoryRepository();
  const queryService = new Phase2QueryService(datasetRepository, backtestRunRepository);
  const instantBacktestService = new InstantBacktestService(datasetRepository, backtestRunRepository, runHistoryRepository);
  const replayApiService = new ReplayApiService(datasetRepository, runHistoryRepository);

  return {
    datasetRepository,
    backtestRunRepository,
    queryService,
    instantBacktestService,
    runHistoryRepository,
    replayApiService,
    pagesService: new FoundationPagesService(queryService, instantBacktestService, replayApiService)
  };
}
