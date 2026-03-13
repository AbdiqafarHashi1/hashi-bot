#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { loadDotEnvIfPresent } from './lib/env-loader.mjs';
import { resolveDatasetSelection, verifyDatasetExists } from './lib/dataset-runtime.mjs';

loadDotEnvIfPresent();

const { datasetId } = resolveDatasetSelection();
verifyDatasetExists(datasetId, 'backtest');

const build = spawnSync('pnpm', ['build'], {
  stdio: 'inherit',
  shell: false,
  env: process.env
});

if ((build.status ?? 1) !== 0) {
  process.exit(build.status ?? 1);
}

const result = spawnSync('pnpm', ['tsx', 'apps/worker/src/index.ts'], {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    WORKER_MODE: 'backtest',
    DATASET_ID: datasetId
  }
});

process.exit(result.status ?? 1);
