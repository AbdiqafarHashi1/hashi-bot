import type { InstantBacktestRequest, ReplayControlAction } from '@hashi-bot/backtest';
import type { EmergencyCommand } from '@hashi-bot/core';

import {
  controlReplayRoute,
  createBacktestRoute,
  createReplayRoute,
  getBacktestByIdRoute,
  getBacktestConfigsRoute,
  getBacktestsRoute,
  getConfigRoute,
  getDatasetsRoute,
  getHealthRoute,
  getLiveHealthRoute,
  getLiveIncidentsRoute,
  getLiveRoute,
  getLiveSafetyRoute,
  getRegimeRoute,
  getReplayByIdRoute,
  getReplayRunsRoute,
  getSignalsRoute,
  getSnapshotsRoute,
  getSymbolsRoute,
  postLiveEmergencyRoute,
} from './api/routes.js';
import {
  getBacktestPageRoute,
  getLivePageRoute,
  getOverviewPageRoute,
  getReplayPageRoute,
  getSettingsPageRoute,
} from './pages/routes.js';

export async function getApiRoutePayload(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  if (path.startsWith('/api/backtests/')) {
    const runId = path.replace('/api/backtests/', '');
    return getBacktestByIdRoute(runId);
  }

  if (path === '/api/backtests' && method === 'POST') {
    return createBacktestRoute((body ?? {}) as InstantBacktestRequest);
  }

  if (path === '/api/replay' && method === 'POST') {
    return createReplayRoute((body ?? {}) as Parameters<typeof createReplayRoute>[0]);
  }

  if (path.startsWith('/api/replay/') && path.endsWith('/control') && method === 'POST') {
    const runId = path.replace('/api/replay/', '').replace('/control', '');
    return controlReplayRoute(runId, (body ?? { type: 'step', steps: 1 }) as ReplayControlAction);
  }

  if (path.startsWith('/api/replay/')) {
    const runId = path.replace('/api/replay/', '');
    return getReplayByIdRoute(runId);
  }

  if (path === '/api/live/emergency' && method === 'POST') {
    return postLiveEmergencyRoute((body ?? {}) as EmergencyCommand);
  }

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
    case '/api/backtests':
      return getBacktestsRoute();
    case '/api/backtests/configs':
      return getBacktestConfigsRoute();
    case '/api/signals':
      return getSignalsRoute();
    case '/api/replay':
      return getReplayRunsRoute();
    case '/api/live':
      return getLiveRoute();
    case '/api/live/health':
      return getLiveHealthRoute();
    case '/api/live/incidents':
      return getLiveIncidentsRoute();
    case '/api/live/safety':
      return getLiveSafetyRoute();
    default:
      return { error: 'not_found', path };
  }
}

export async function getPagePayload(path: string) {
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
