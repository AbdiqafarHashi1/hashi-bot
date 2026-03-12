#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['tsx', 'apps/worker/src/index.ts'], {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    WORKER_MODE: 'paper',
    EXECUTION_VENUE: 'mock',
    LIVE_ACCOUNT_REF: process.env.LIVE_ACCOUNT_REF ?? 'paper-account',
    LIVE_ENABLED: process.env.LIVE_ENABLED ?? 'false',
    LIVE_MAX_CYCLES: process.env.LIVE_MAX_CYCLES ?? '1',
    LIVE_CYCLE_DELAY_MS: '0'
  }
});

process.exit(result.status ?? 1);
