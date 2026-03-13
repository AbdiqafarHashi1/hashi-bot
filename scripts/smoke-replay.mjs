#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { loadDotEnvIfPresent } from './lib/env-loader.mjs';
import { resolveDatasetSelection, verifyDatasetExists } from './lib/dataset-runtime.mjs';

loadDotEnvIfPresent();

const { replayDatasetId } = resolveDatasetSelection();
verifyDatasetExists(replayDatasetId, 'replay');

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
    WORKER_MODE: 'replay',
    REPLAY_DATASET_ID: replayDatasetId,
    REPLAY_SYMBOLS: process.env.REPLAY_SYMBOLS ?? 'BTCUSDT',
    REPLAY_ACTION: process.env.REPLAY_ACTION ?? 'step',
    REPLAY_STEPS: process.env.REPLAY_STEPS ?? '3'
  }
});

process.exit(result.status ?? 1);
