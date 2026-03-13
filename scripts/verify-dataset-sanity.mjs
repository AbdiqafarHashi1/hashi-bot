#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { loadDotEnvIfPresent } from './lib/env-loader.mjs';
import { resolveDatasetSelection } from './lib/dataset-runtime.mjs';

loadDotEnvIfPresent();

const { datasetId } = resolveDatasetSelection();

const checkCode = `
import { InMemoryDatasetRepository } from './packages/data/src/dataset-repository.ts';

const requestedDatasetId = ${JSON.stringify(datasetId)};

try {
  const repo = new InMemoryDatasetRepository();
  const datasets = repo.listDatasets();
  const symbols = repo.listSymbols();

  if (!datasets.length) {
    throw new Error('No datasets available. Add built-in fixtures or set DATASET_CSV_PATH to a CSV file.');
  }

  if (!symbols.length) {
    throw new Error('No symbols available.');
  }

  for (const dataset of datasets) {
    if (!dataset.candles.length) {
      throw new Error('Dataset has no candles: ' + dataset.id);
    }

    const first = dataset.candles[0];
    const last = dataset.candles.at(-1);
    if (!first || !last || first.ts >= last.ts) {
      throw new Error('Dataset timestamp ordering invalid: ' + dataset.id);
    }
  }

  const requested = repo.getDataset(requestedDatasetId);
  if (!requested) {
    const availableIds = datasets.map((dataset) => dataset.id).join(', ') || '(none)';
    throw new Error(
      'Configured DATASET_ID not found: ' + requestedDatasetId + '. Available dataset ids: ' + availableIds
    );
  }

  console.log('[verify:dataset] OK datasets=' + datasets.length + ' symbols=' + symbols.length + ' requested=' + requestedDatasetId);
} catch (error) {
  const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error('[verify:dataset] Failed: ' + details);
  console.error('[verify:dataset] Runtime context: DATASET_ID=' + (process.env.DATASET_ID ?? '(unset)') + ' DATASET_CSV_PATH=' + (process.env.DATASET_CSV_PATH ?? '(unset)') + ' DATASET_SYMBOL=' + (process.env.DATASET_SYMBOL ?? '(unset)') + ' DATASET_SYMBOL_CODE=' + (process.env.DATASET_SYMBOL_CODE ?? '(unset)') + ' DATASET_TIMEFRAME=' + (process.env.DATASET_TIMEFRAME ?? '(unset)'));
  console.error('[verify:dataset] Action: ensure DATASET_ID matches the loaded CSV dataset id and DATASET_CSV_PATH points to an existing OHLCV CSV file.');
  process.exit(1);
}
`;

const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const result = spawnSync(pnpmBin, ['tsx', '-e', checkCode], {
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

if (result.error) {
  console.error('[verify:dataset] Failed to execute tsx check: ' + result.error.message);
  process.exit(1);
}

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.signal) {
  console.error('[verify:dataset] Dataset verification terminated by signal: ' + result.signal);
  process.exit(1);
}

console.error('[verify:dataset] Dataset verification failed with an unknown execution state.');
process.exit(1);
