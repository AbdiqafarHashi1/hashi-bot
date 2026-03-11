import {
  getConfigRoute,
  getDatasetsRoute,
  getHealthRoute,
  getRegimeRoute,
  getSignalsRoute,
  getSnapshotsRoute,
  getSymbolsRoute,
} from './api/routes.js';
import {
  getBacktestPageRoute,
  getLivePageRoute,
  getOverviewPageRoute,
  getReplayPageRoute,
  getSettingsPageRoute,
} from './pages/routes.js';

export function getApiRoutePayload(path: string) {
  switch (path) {
    case '/api/health':
      return getHealthRoute();
    case '/api/symbols':
      return getSymbolsRoute();
    case '/api/datasets':
      return getDatasetsRoute();
    case '/api/config':
      return getConfigRoute();
    case '/api/snapshots':
      return getSnapshotsRoute();
    case '/api/regime':
      return getRegimeRoute();
    case '/api/signals':
      return getSignalsRoute();
    default:
      return { error: 'not_found', path };
  }
}

export function getPagePayload(path: string) {
  switch (path) {
    case '/':
      return getOverviewPageRoute();
    case '/replay':
      return getReplayPageRoute();
    case '/backtest':
      return getBacktestPageRoute();
    case '/live':
      return getLivePageRoute();
    case '/settings':
      return getSettingsPageRoute();
    default:
      return { error: 'not_found', path };
  }
}
