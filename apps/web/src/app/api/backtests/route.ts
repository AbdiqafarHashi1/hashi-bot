import type { InstantBacktestRequest } from '@hashi-bot/backtest';

import { createBacktestRoute, getBacktestsRoute } from '../../../api/routes.js';

export function GET() {
  return getBacktestsRoute();
}

export function POST(payload: InstantBacktestRequest) {
  return createBacktestRoute(payload);
}
