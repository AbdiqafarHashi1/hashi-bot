#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

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
