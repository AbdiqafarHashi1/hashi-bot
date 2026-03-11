import type { ReplayControlAction } from '@hashi-bot/backtest';

import { controlReplayRoute } from '../../../../../api/routes.js';

export function POST(runId: string, action: ReplayControlAction) {
  return controlReplayRoute(runId, action);
}
