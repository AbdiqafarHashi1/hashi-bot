import { getBacktestsRoute, getBacktestByIdRoute, getBacktestConfigsRoute } from './routes.js';

export function getBacktests() {
  return getBacktestsRoute();
}

export function getBacktestById(id: string) {
  return getBacktestByIdRoute(id);
}

export function getBacktestConfigs() {
  return getBacktestConfigsRoute();
}
