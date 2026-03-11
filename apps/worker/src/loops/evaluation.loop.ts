import type { WorkerContainer } from '../lib/container.js';
import { runEvaluateMarketJob } from '../jobs/evaluate-market.job.js';

export function runEvaluationLoop(container: WorkerContainer, datasetId?: string): void {
  const results = runEvaluateMarketJob(container, datasetId);

  for (const result of results) {
    const { symbolCode, snapshot, regime } = result;
    console.log(
      `[worker:evaluation] symbol=${symbolCode} close=${snapshot.latestClose ?? snapshot.last} regime=${regime.regimeState} tradable=${regime.isTradable}`
    );
  }
}
