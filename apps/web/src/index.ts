import type { InstantBacktestRequest, ReplayControlAction } from '@hashi-bot/backtest';

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
  getLiveOrdersRoute,
  getLivePositionsRoute,
  getLiveRoute,
  getLiveSafetyRoute,
  postLiveEmergencyRoute,
  getRegimeRoute,
  getReplayByIdRoute,
  getReplayRunsRoute,
  getSignalsRoute,
  getSnapshotsRoute,
  getSymbolsRoute,
} from './api/routes.js';
import { getOverviewControlCenterPage } from './app/page.js';
import { getReplayWorkstationPage } from './app/replay/page.js';
import { getBacktestWorkstationPage } from './app/backtest/page.js';
import { getLiveOperationsWorkspacePage } from './app/live/page.js';
import { getSafetyOperationsWorkspacePage } from './app/safety/page.js';
import { getSettingsWorkspacePage } from './app/settings/page.js';
import { getSignalsWorkspacePage } from './app/signals/page.js';
import { getTradesWorkspacePage } from './app/trades/page.js';
import { getRunsWorkspacePage } from './app/runs/page.js';

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
    case '/api/live/orders':
      return getLiveOrdersRoute();
    case '/api/live/positions':
      return getLivePositionsRoute();
    case '/api/live/incidents':
      return getLiveIncidentsRoute();
    case '/api/live/safety':
      return getLiveSafetyRoute();
    case '/api/live/emergency':
      if (method === 'POST') {
        return postLiveEmergencyRoute((body ?? {}) as Parameters<typeof postLiveEmergencyRoute>[0]);
      }
      return { error: 'method_not_allowed', path, allowed: ['POST'] };
    default:
      return { error: 'not_found', path };
  }
}

export async function getPagePayload(path: string) {
  switch (path) {
    case '/':
      return getOverviewControlCenterPage();
    case '/replay':
      return getReplayWorkstationPage();
    case '/backtest':
      return getBacktestWorkstationPage();
    case '/live':
      return getLiveOperationsWorkspacePage();
    case '/signals':
      return getSignalsWorkspacePage();
    case '/trades':
      return getTradesWorkspacePage();
    case '/runs':
      return getRunsWorkspacePage();
    case '/safety':
      return getSafetyOperationsWorkspacePage();
    case '/settings':
      return getSettingsWorkspacePage();
    default:
      return { error: 'not_found', path };
  }
}

export * from './app/index.js';
export * from './components/index.js';
