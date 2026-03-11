import { InMemoryDatasetRepository, type DatasetRepository } from '@hashi-bot/data';

import { FoundationPagesService } from '../services/foundation-pages.service.js';
import { Phase2QueryService } from '../services/phase2-query.service.js';

export interface WebContainer {
  datasetRepository: DatasetRepository;
  queryService: Phase2QueryService;
  pagesService: FoundationPagesService;
}

export function createWebContainer(): WebContainer {
  const datasetRepository = new InMemoryDatasetRepository();
  const queryService = new Phase2QueryService(datasetRepository);

  return {
    datasetRepository,
    queryService,
    pagesService: new FoundationPagesService(queryService),
  };
}
