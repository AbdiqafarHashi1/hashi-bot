#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

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
    DATASET_ID: process.env.DATASET_ID ?? 'dataset-btc-1m'
  }
});

process.exit(result.status ?? 1);
