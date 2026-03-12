#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const checkCode = `
import { InMemoryDatasetRepository } from './packages/data/src/dataset-repository.ts';

const repo = new InMemoryDatasetRepository();
const datasets = repo.listDatasets();
const symbols = repo.listSymbols();

if (!datasets.length) throw new Error('No datasets available.');
if (!symbols.length) throw new Error('No symbols available.');

for (const dataset of datasets) {
  if (!dataset.candles.length) throw new Error('Dataset has no candles: ' + dataset.id);
  const first = dataset.candles[0];
  const last = dataset.candles.at(-1);
  if (!first || !last || first.ts >= last.ts) {
    throw new Error('Dataset timestamp ordering invalid: ' + dataset.id);
  }
}

console.log('[verify:dataset] OK datasets=' + datasets.length + ' symbols=' + symbols.length);
`;

const result = spawnSync('pnpm', ['tsx', '-e', checkCode], { stdio: 'inherit', shell: false });
process.exit(result.status ?? 1);
