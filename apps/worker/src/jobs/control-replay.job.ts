import type { ReplayControlAction, ReplayStepResult } from '@hashi-bot/backtest';
import type { RunId } from '@hashi-bot/core';

import type { WorkerContainer } from '../lib/container.js';

export function runControlReplayJob(
  container: WorkerContainer,
  runId: RunId,
  action: ReplayControlAction
): ReplayStepResult {
  return container.replayService.controlReplay(runId, action);
}
