import type { ReplayControlAction } from '@hashi-bot/backtest';
import type { EmergencyCommand, EpochMs, ProfileCode, SymbolCode, Timeframe } from '@hashi-bot/core';

import { bootstrapWorker } from './bootstrap.js';
import { runBacktestLoop } from './loops/backtest.loop.js';
import { runEvaluationLoop } from './loops/evaluation.loop.js';
import { runLiveLoop } from './loops/live.loop.js';
import { runReplayLoop } from './loops/replay.loop.js';

function parseWatchlist(raw: string | undefined): SymbolCode[] | undefined {
  if (!raw) {
    return undefined;
  }

  const parsed = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => item as SymbolCode);

  return parsed.length > 0 ? parsed : undefined;
}

function parseReplayAction(env: Record<string, string | undefined>): ReplayControlAction {
  const action = env.REPLAY_ACTION ?? 'step';

  switch (action) {
    case 'step':
      return { type: 'step', steps: env.REPLAY_STEPS == null ? 1 : Number(env.REPLAY_STEPS) };
    case 'play':
      return { type: 'play' };
    case 'pause':
      return { type: 'pause' };
    case 'jump_to_index':
      return { type: 'jump_to_index', barIndex: Number(env.REPLAY_INDEX ?? 0) };
    case 'jump_to_timestamp':
      return { type: 'jump_to_timestamp', timestamp: Number(env.REPLAY_TIMESTAMP ?? Date.now()) as EpochMs };
    case 'set_speed':
      return { type: 'set_speed', speed: Number(env.REPLAY_SPEED ?? 1) };
    case 'reset':
      return { type: 'reset' };
    default:
      return { type: 'step', steps: 1 };
  }
}

function parseEmergencyCommand(env: Record<string, string | undefined>): EmergencyCommand | undefined {
  const type = env.LIVE_EMERGENCY_COMMAND;
  if (!type) {
    return undefined;
  }

  const allowedTypes: EmergencyCommand['type'][] = ['cancel_all_orders', 'flatten_positions', 'disable_live_mode'];
  if (!allowedTypes.includes(type as EmergencyCommand['type'])) {
    return undefined;
  }

  return {
    commandId: env.LIVE_EMERGENCY_COMMAND_ID ?? `emg-${Date.now()}`,
    type: type as EmergencyCommand['type'],
    issuedAt: new Date().toISOString() as EmergencyCommand['issuedAt'],
    issuedBy: env.LIVE_EMERGENCY_ISSUED_BY ?? 'operator',
    reason: env.LIVE_EMERGENCY_REASON,
    symbol: env.LIVE_EMERGENCY_SYMBOL as SymbolCode | undefined,
    venue: env.LIVE_EMERGENCY_VENUE as EmergencyCommand['venue']
  };
}

async function main(): Promise<void> {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const datasetId = env.DATASET_ID;
  const workerMode = (env.WORKER_MODE ?? 'evaluation') as 'evaluation' | 'backtest' | 'replay' | 'live';
  const executionVenue = (env.EXECUTION_VENUE ?? 'mock') as 'mock' | 'ccxt' | 'ctrader';
  const { container, recoveryDecision, recoverySnapshot } = await bootstrapWorker({ workerMode, executionVenue, env });

  if (workerMode === 'backtest') {
    runBacktestLoop(container, datasetId);
    return;
  }

  if (workerMode === 'replay') {
    runReplayLoop(container, {
      datasetId: env.REPLAY_DATASET_ID ?? datasetId,
      symbolCodes: parseWatchlist(env.REPLAY_SYMBOLS),
      profileCode: (env.REPLAY_PROFILE as ProfileCode | undefined) ?? 'GROWTH_HUNTER',
      timeframe: (env.REPLAY_TIMEFRAME as Timeframe | undefined) ?? '1m',
      replaySpeed: env.REPLAY_SPEED == null ? 1 : Number(env.REPLAY_SPEED),
      action: parseReplayAction(env),
    });
    return;
  }

  if (workerMode === 'live') {
    await runLiveLoop(container, {
      recoveryDecision,
      recoverySnapshot,
      executionVenue,
      cycleMs: env.LIVE_LOOP_INTERVAL_MS == null ? undefined : Number(env.LIVE_LOOP_INTERVAL_MS),
      maxCycles: env.LIVE_LOOP_MAX_CYCLES == null ? undefined : Number(env.LIVE_LOOP_MAX_CYCLES),
      emergencyCommand: parseEmergencyCommand(env),
      operatorEmergencyStop: env.LIVE_OPERATOR_EMERGENCY_STOP === 'true'
    });
    return;
  }

  runEvaluationLoop(container, {
    datasetId,
    watchlistSymbolCodes: parseWatchlist(env.WATCHLIST_SYMBOLS),
    rankingLimit: env.RANKING_LIMIT == null ? undefined : Number(env.RANKING_LIMIT),
  });
}

void main();
