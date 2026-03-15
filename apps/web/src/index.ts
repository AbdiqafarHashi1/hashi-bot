import type { InstantBacktestRequest, ReplayControlAction } from '@hashi-bot/backtest';
import type { DatasetId, EpochMs, ProfileCode, SymbolCode, Timeframe } from '@hashi-bot/core';
import 'dotenv/config';
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
  getSymbolsRoute
} from './api/routes.js';
import {
  getBacktestPageRoute,
  getLivePageRoute,
  getOverviewPageRoute,
  getReplayPageRoute,
  getRunsPageRoute,
  getSafetyPageRoute,
  getSettingsPageRoute,
  getTradesPageRoute
} from './pages/routes.js';
import { validateWebRuntimeEnvironment } from './lib/runtime-env.js';

validateWebRuntimeEnvironment();

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toReplayControlAction(body: unknown): ReplayControlAction {
  const source = asRecord(body) ?? {};
  const type = readString(source.type) ?? 'step';

  if (type === 'step') {
    const steps = Math.max(1, Math.floor(readNumber(source.steps) ?? 1));
    return { type: 'step', steps };
  }
  if (type === 'play') {
    return { type: 'play' };
  }
  if (type === 'pause') {
    return { type: 'pause' };
  }
  if (type === 'jump_to_index') {
    const barIndex = Math.max(0, Math.floor(readNumber(source.barIndex) ?? 0));
    return { type: 'jump_to_index', barIndex };
  }
  if (type === 'jump_to_timestamp') {
    const timestamp = Math.max(0, Math.floor(readNumber(source.timestamp) ?? Date.now()));
    return { type: 'jump_to_timestamp', timestamp: timestamp as EpochMs };
  }
  if (type === 'set_speed') {
    const speed = readNumber(source.speed) ?? 1;
    return { type: 'set_speed', speed: Math.min(100, Math.max(0.1, speed)) };
  }
  if (type === 'reset') {
    return { type: 'reset' };
  }

  throw new Error(`Invalid replay control action type: ${String(type)}`);
}

function toBacktestRequest(body: unknown): InstantBacktestRequest {
  const source = asRecord(body) ?? {};
  const datasetId = readString(source.datasetId);
  const profileCode = readString(source.profileCode);
  const timeframe = readString(source.timeframe);
  const symbols = Array.isArray(source.symbols)
    ? source.symbols.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  if (!datasetId || !profileCode || !timeframe || symbols.length === 0) {
    throw new Error('Invalid backtest payload: datasetId, profileCode, timeframe, and at least one symbol are required.');
  }

  return {
    datasetId: datasetId as DatasetId,
    profileCode: profileCode as ProfileCode,
    timeframe: timeframe as Timeframe,
    symbols: symbols as SymbolCode[],
    fromTs: readNumber(source.fromTs) as EpochMs | undefined,
    toTs: readNumber(source.toTs) as EpochMs | undefined,
    initialBalance: readNumber(source.initialBalance),
    slippageBps: readNumber(source.slippageBps),
    commissionBps: readNumber(source.commissionBps),
    maxConcurrentPositions: readNumber(source.maxConcurrentPositions),
    metadata: asRecord(source.metadata)
      ? Object.fromEntries(
          Object.entries(source.metadata as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      : undefined
  };
}

function errorPayload(path: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'unexpected_error';
  return { error: 'request_failed', path, message };
}

export async function getApiRoutePayload(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  try {
    if (path.startsWith('/api/backtests/')) {
      const runId = path.replace('/api/backtests/', '').trim();
      if (!runId) {
        return { error: 'invalid_run_id', path };
      }
      return getBacktestByIdRoute(runId);
    }

    if (path === '/api/backtests' && method === 'POST') {
      return createBacktestRoute(toBacktestRequest(body));
    }

    if (path === '/api/replay' && method === 'POST') {
      const payload = asRecord(body) ?? {};
      return createReplayRoute(payload as Parameters<typeof createReplayRoute>[0]);
    }

    if (path.startsWith('/api/replay/') && path.endsWith('/control') && method === 'POST') {
      const runId = path.replace('/api/replay/', '').replace('/control', '').trim();
      if (!runId) {
        return { error: 'invalid_run_id', path };
      }

      return controlReplayRoute(runId, toReplayControlAction(body));
    }

    if (path.startsWith('/api/replay/')) {
      const runId = path.replace('/api/replay/', '').trim();
      if (!runId) {
        return { error: 'invalid_run_id', path };
      }
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
          const payload = asRecord(body) ?? {};
          return postLiveEmergencyRoute(payload as Parameters<typeof postLiveEmergencyRoute>[0]);
        }
        return { error: 'method_not_allowed', path, allowed: ['POST'] };
      default:
        return { error: 'not_found', path };
    }
  } catch (error) {
    return errorPayload(path, error);
  }
}

export async function getPagePayload(path: string) {
  try {
    switch (path) {
      case '/':
      case '/overview':
      case '/signals':
        return getOverviewPageRoute();
      case '/runs':
        return getRunsPageRoute();
      case '/trades':
        return getTradesPageRoute();
      case '/replay':
        return getReplayPageRoute();
      case '/backtest':
        return getBacktestPageRoute();
      case '/live':
        return getLivePageRoute();
      case '/safety':
        return getSafetyPageRoute();
      case '/settings':
        return getSettingsPageRoute();
      default:
        return { error: 'not_found', path };
    }
  } catch (error) {
    return errorPayload(path, error);
  }
}
