import { bootstrapWorker } from './bootstrap.js';
import { runEvaluationLoop } from './loops/evaluation.loop.js';

function main(): void {
  const datasetId =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.DATASET_ID;
  const { container } = bootstrapWorker();

  runEvaluationLoop(container, datasetId);
}

main();
