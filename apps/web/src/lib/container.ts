import {
  InMemoryBacktestRunRepository,
  InMemoryDatasetRepository,
  type BacktestRunRepository,
  type DatasetRepository
} from '@hashi-bot/data';

import { FoundationPagesService } from '../services/foundation-pages.service.js';
import { Phase2QueryService } from '../services/phase2-query.service.js';

export interface WebContainer {
  datasetRepository: DatasetRepository;
  backtestRunRepository: BacktestRunRepository;
  queryService: Phase2QueryService;
  pagesService: FoundationPagesService;
}

export function createWebContainer(): WebContainer {
  const datasetRepository = new InMemoryDatasetRepository();
  const backtestRunRepository = new InMemoryBacktestRunRepository();
  const queryService = new Phase2QueryService(datasetRepository, backtestRunRepository);

  return {
    datasetRepository,
    backtestRunRepository,
    queryService,
    pagesService: new FoundationPagesService(queryService)
  };
}
