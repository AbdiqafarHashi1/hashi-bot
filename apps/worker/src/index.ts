import type { SymbolCode } from '@hashi-bot/core';

import { bootstrapWorker } from './bootstrap.js';
import { runBacktestLoop } from './loops/backtest.loop.js';
import { runEvaluationLoop } from './loops/evaluation.loop.js';

function parseWatchlist(raw: string | undefined): SymbolCode[] | undefined {
  if (!raw) {
    return undefined;
  }

  const parsed = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => item as SymbolCode);

  return parsed.length > 0 ? parsed : undefined;
}

function main(): void {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const datasetId = env.DATASET_ID;
  const workerMode = env.WORKER_MODE ?? 'evaluation';
  const { container } = bootstrapWorker();

  if (workerMode === 'backtest') {
    runBacktestLoop(container, datasetId);
    return;
  }

  runEvaluationLoop(container, datasetId);
}

main();
