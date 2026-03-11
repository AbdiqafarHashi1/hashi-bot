import { bootstrapWorker } from './bootstrap.js';
import { runBacktestLoop } from './loops/backtest.loop.js';
import { runEvaluationLoop } from './loops/evaluation.loop.js';

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
