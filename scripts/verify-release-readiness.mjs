#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

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
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false, env: process.env });
  if ((result.status ?? 1) !== 0) {
    console.error(`[verify:release] failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\n[verify:release] all checks passed.');
