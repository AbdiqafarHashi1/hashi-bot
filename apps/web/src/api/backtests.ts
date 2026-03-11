import type { InstantBacktestRequest } from '@hashi-bot/backtest';

import { createBacktestRoute, getBacktestsRoute, getBacktestByIdRoute, getBacktestConfigsRoute } from './routes.js';

export function getBacktests() {
  return getBacktestsRoute();
}

export function postBacktest(request: InstantBacktestRequest) {
  return createBacktestRoute(request);
}

export function getBacktestById(id: string) {
  return getBacktestByIdRoute(id);
}

export function getBacktestConfigs() {
  return getBacktestConfigsRoute();
}
