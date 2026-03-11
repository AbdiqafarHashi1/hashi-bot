import type { ReplayControlAction } from '@hashi-bot/backtest';

import { controlReplayRoute, createReplayRoute, getReplayByIdRoute, getReplayRunsRoute } from './routes.js';

export function getReplayRuns() {
  return getReplayRunsRoute();
}

export function postReplay(payload: Parameters<typeof createReplayRoute>[0]) {
  return createReplayRoute(payload);
}

export function getReplayById(runId: string) {
  return getReplayByIdRoute(runId);
}

export function postReplayControl(runId: string, action: ReplayControlAction) {
  return controlReplayRoute(runId, action);
}
