import type { ReplayControlAction } from '@hashi-bot/backtest';
import type { EpochMs, ProfileCode, SymbolCode, Timeframe } from '@hashi-bot/core';

import { bootstrapWorker } from './bootstrap.js';
import { runBacktestLoop } from './loops/backtest.loop.js';
import { runEvaluationLoop } from './loops/evaluation.loop.js';
import { runLiveLoop } from './loops/live.loop.js';
import { runReplayLoop } from './loops/replay.loop.js';
import { resolveWorkerRuntimeEnv } from './lib/runtime-env.js';
import { buildRecoveryEmergencyCommands } from './services/operational-guard.service.js';

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



function parseFiniteNumber(raw: string | undefined, fallback: number): number {
  if (raw == null) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = parseFiniteNumber(raw, fallback);
  return Math.max(1, Math.floor(parsed));
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const parsed = parseFiniteNumber(raw, fallback);
  return Math.max(0, Math.floor(parsed));
}

function parseReplayAction(env: Record<string, string | undefined>): ReplayControlAction {
  const action = env.REPLAY_ACTION ?? 'step';

  switch (action) {
    case 'step':
      return { type: 'step', steps: parsePositiveInt(env.REPLAY_STEPS, 1) };
    case 'play':
      return { type: 'play' };
    case 'pause':
      return { type: 'pause' };
    case 'jump_to_index':
      return { type: 'jump_to_index', barIndex: parseNonNegativeInt(env.REPLAY_INDEX, 0) };
    case 'jump_to_timestamp':
      return { type: 'jump_to_timestamp', timestamp: parseNonNegativeInt(env.REPLAY_TIMESTAMP, Date.now()) as EpochMs };
    case 'set_speed':
      return { type: 'set_speed', speed: Math.min(100, Math.max(0.1, parseFiniteNumber(env.REPLAY_SPEED, 1))) };
    case 'reset':
      return { type: 'reset' };
    default:
      return { type: 'step', steps: 1 };
  }
}

async function main(): Promise<void> {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const runtime = resolveWorkerRuntimeEnv(env);
  const datasetId = env.DATASET_ID;
  const workerMode = runtime.mode;
  const accountRef = runtime.accountRef;
  const staleAfterMs = parseNonNegativeInt(env.LIVE_STALE_AFTER_MS, 60_000);

  const { container, startupRecovery } = await bootstrapWorker({
    mode: workerMode,
    accountRef,
    staleAfterMs,
    env
  });
  console.log(`[worker] startup mode=${workerMode} venue=${runtime.executionVenue} nodeEnv=${runtime.nodeEnv}`);



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
      replaySpeed: Math.min(100, Math.max(0.1, parseFiniteNumber(env.REPLAY_SPEED, 1))),
      action: parseReplayAction(env),
    });
    return;
  }

  if (workerMode === 'live' || workerMode === 'paper') {
    await runLiveLoop(container, {
      mode: workerMode,
      accountRef,
      profileCode: (env.LIVE_PROFILE as ProfileCode | undefined) ?? 'PROP_HUNTER',
      watchlistSymbolCodes: parseWatchlist(env.WATCHLIST_SYMBOLS),
      rankingLimit: env.RANKING_LIMIT == null ? undefined : parsePositiveInt(env.RANKING_LIMIT, 5),
      staleAfterMs,
      maxCycles: parsePositiveInt(env.LIVE_MAX_CYCLES, 1),
      cycleDelayMs: parseNonNegativeInt(env.LIVE_CYCLE_DELAY_MS, 0),
      startupRecovery,
      startupEmergencyCommands: buildRecoveryEmergencyCommands({
        outcome: startupRecovery?.decision.outcome,
        nowTs: Date.now() as EpochMs,
        issuedBy: 'startup_recovery'
      })
    });
    return;
  }

  runEvaluationLoop(container, {
    datasetId,
    watchlistSymbolCodes: parseWatchlist(env.WATCHLIST_SYMBOLS),
    rankingLimit: env.RANKING_LIMIT == null ? undefined : parsePositiveInt(env.RANKING_LIMIT, 5),
  });
}

main().catch((error) => {
  console.error('[worker] fatal error', error);
  const runtime = globalThis as { process?: { exitCode?: number } };
  if (runtime.process) {
    runtime.process.exitCode = 1;
  }
});
