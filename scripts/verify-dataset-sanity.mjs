#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { loadDotEnvIfPresent } from './lib/env-loader.mjs';
import { resolveDatasetSelection } from './lib/dataset-runtime.mjs';

loadDotEnvIfPresent();

const { datasetId } = resolveDatasetSelection();

const checkCode = `
import { InMemoryDatasetRepository } from './packages/data/src/dataset-repository.ts';

const requestedDatasetId = ${JSON.stringify(datasetId)};
const repo = new InMemoryDatasetRepository();
const datasets = repo.listDatasets();
const symbols = repo.listSymbols();

if (!datasets.length) throw new Error('No datasets available. Add built-in fixtures or set DATASET_CSV_PATH to a CSV file.');
if (!symbols.length) throw new Error('No symbols available.');

for (const dataset of datasets) {
  if (!dataset.candles.length) throw new Error('Dataset has no candles: ' + dataset.id);
  const first = dataset.candles[0];
  const last = dataset.candles.at(-1);
  if (!first || !last || first.ts >= last.ts) {
    throw new Error('Dataset timestamp ordering invalid: ' + dataset.id);
  }
}

const requested = repo.getDataset(requestedDatasetId);
if (!requested) {
  const availableIds = datasets.map((dataset) => dataset.id).join(', ');
  console.error('[verify:dataset] Configured DATASET_ID not found: ' + requestedDatasetId);
  console.error('[verify:dataset] Available dataset ids: ' + availableIds);
  console.error('[verify:dataset] If using ETH CSV, set DATASET_CSV_PATH=./datasets/ETHUSDT_15m.csv and DATASET_ID=dataset-ethusdt-15m.');
  process.exit(1);
}

console.log('[verify:dataset] OK datasets=' + datasets.length + ' symbols=' + symbols.length + ' requested=' + requestedDatasetId);
`;

const result = spawnSync('pnpm', ['tsx', '-e', checkCode], { stdio: 'inherit', shell: false, env: process.env });
process.exit(result.status ?? 1);
