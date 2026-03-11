import type { WorkerContainer } from '../lib/container.js';
import { runBacktestJob } from '../jobs/run-backtest.job.js';

export function runBacktestLoop(container: WorkerContainer, datasetId?: string): void {
  try {
    const result = runBacktestJob(container, datasetId);
    console.log(
      `[worker:backtest] runId=${result.metadata.runId} symbols=${result.metadata.symbols.join(',')} trades=${result.metrics.totalTrades} winRate=${result.metrics.winRatePct.toFixed(2)}% netPnl=${result.metrics.netPnl.toFixed(2)} maxDD=${result.metrics.maxDrawdownPct.toFixed(2)}%`
    );
  } catch (error) {
    console.error('[worker:backtest] execution failed', error);
    throw error;
  }
}
