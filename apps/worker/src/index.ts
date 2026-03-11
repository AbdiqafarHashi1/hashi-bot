import type { ReplayControlAction } from '@hashi-bot/backtest';
import type { EpochMs, ProfileCode, SymbolCode, Timeframe } from '@hashi-bot/core';

import { bootstrapWorker } from './bootstrap.js';
import { runBacktestLoop } from './loops/backtest.loop.js';
import { runEvaluationLoop } from './loops/evaluation.loop.js';
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

function main(): void {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const datasetId = env.DATASET_ID;
  const workerMode = env.WORKER_MODE ?? 'evaluation';
  const { container } = bootstrapWorker();

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

  runEvaluationLoop(container, {
    datasetId,
    watchlistSymbolCodes: parseWatchlist(env.WATCHLIST_SYMBOLS),
    rankingLimit: env.RANKING_LIMIT == null ? undefined : Number(env.RANKING_LIMIT),
  });
}

main();
