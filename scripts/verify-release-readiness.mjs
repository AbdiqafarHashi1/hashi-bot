#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { loadDotEnvIfPresent } from './lib/env-loader.mjs';

loadDotEnvIfPresent();

const releaseEnv = {
  ...process.env,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? 'hashi-bot',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/hashi_bot',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  LIVE_ACCOUNT_REF: process.env.LIVE_ACCOUNT_REF ?? 'paper-account',
  EXECUTION_VENUE: process.env.EXECUTION_VENUE ?? 'mock',
};

const checks = [
  ['pnpm', ['verify:env']],
  ['pnpm', ['typecheck']],
  ['pnpm', ['lint']],
  ['pnpm', ['build']],
  ['pnpm', ['verify:migrations']],
  ['pnpm', ['verify:dataset']],
  ['pnpm', ['smoke:backtest']],
  ['pnpm', ['smoke:replay']],
  ['pnpm', ['smoke:live:mock']]
];

for (const [cmd, args] of checks) {
  console.log(`\n[verify:release] running: ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false, env: releaseEnv });
  if ((result.status ?? 1) !== 0) {
    console.error(`[verify:release] failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\n[verify:release] all checks passed.');
