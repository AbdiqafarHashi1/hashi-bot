import type { ReplayState } from '@hashi-bot/backtest';
import type { RunId } from '@hashi-bot/core';

import type { WorkerContainer } from '../lib/container.js';

export function runGetReplayStateJob(container: WorkerContainer, runId: RunId): ReplayState {
  return container.replayService.getReplayState(runId);
}
