import type { BacktestRunResult } from '@hashi-bot/backtest';

import type { WorkerContainer } from '../lib/container.js';

export function runBacktestJob(container: WorkerContainer, datasetId?: string): BacktestRunResult {
  return container.backtestService.runBacktest({ datasetId });
}
