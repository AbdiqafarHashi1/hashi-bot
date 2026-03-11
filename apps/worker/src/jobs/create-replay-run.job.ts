import type { ReplayStepResult } from '@hashi-bot/backtest';

import type { WorkerContainer } from '../lib/container.js';
import type { CreateReplayRunParams } from '../services/replay-service.js';

export function runCreateReplayRunJob(container: WorkerContainer, params: CreateReplayRunParams = {}): ReplayStepResult {
  return container.replayService.createReplayRun(params);
}
