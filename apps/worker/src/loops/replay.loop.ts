import type { ReplayControlAction } from '@hashi-bot/backtest';
import type { ProfileCode, RunId, SymbolCode, Timeframe } from '@hashi-bot/core';

import { runControlReplayJob } from '../jobs/control-replay.job.js';
import { runCreateReplayRunJob } from '../jobs/create-replay-run.job.js';
import { runGetReplayStateJob } from '../jobs/get-replay-state.job.js';
import type { WorkerContainer } from '../lib/container.js';

export interface ReplayLoopOptions {
  datasetId?: string;
  symbolCodes?: SymbolCode[];
  profileCode?: ProfileCode;
  timeframe?: Timeframe;
  replaySpeed?: number;
  runId?: RunId;
  action?: ReplayControlAction;
}

export function runReplayLoop(container: WorkerContainer, options: ReplayLoopOptions = {}): void {
  try {
    const created = runCreateReplayRunJob(container, {
      datasetId: options.datasetId,
      symbolCodes: options.symbolCodes,
      profileCode: options.profileCode,
      timeframe: options.timeframe,
      replaySpeed: options.replaySpeed,
      runId: options.runId,
    });

    const replayRunId = created.runId;
    const action: ReplayControlAction = options.action ?? { type: 'step', steps: 1 };
    const result = runControlReplayJob(container, replayRunId, action);
    const state = runGetReplayStateJob(container, replayRunId);

    console.log(
      JSON.stringify({
        scope: 'worker:replay',
        event: 'replay_loop_completed',
        runId: replayRunId,
        action: action.type,
        playbackState: state.playbackState,
        barIndex: state.cursor.barIndex,
        timestamp: state.cursor.timestamp,
        openTrades: state.openTrades.length,
        closedTrades: state.closedTradesSummary.totalClosed,
        emittedEvents: result.emittedEvents.length,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_replay_error';
    console.error(
      JSON.stringify({
        scope: 'worker:replay',
        event: 'replay_loop_failed',
        message,
      })
    );
    throw error;
  }
}
