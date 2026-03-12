import type { BotMode, ProfileCode, SymbolCode } from '@hashi-bot/core';

import type { WorkerContainer } from '../lib/container.js';

export interface LiveLoopOptions {
  mode: Extract<BotMode, 'paper' | 'live'>;
  accountRef: string;
  profileCode: ProfileCode;
  watchlistSymbolCodes?: SymbolCode[];
  rankingLimit?: number;
  staleAfterMs?: number;
  maxCycles?: number;
  cycleDelayMs?: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runLiveLoop(container: WorkerContainer, options: LiveLoopOptions): Promise<void> {
  const maxCycles = options.maxCycles ?? 1;
  const cycleDelayMs = options.cycleDelayMs ?? 0;

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    const result = await container.liveExecutionService.runCycle({
      accountRef: options.accountRef,
      profileCode: options.profileCode,
      watchlistSymbolCodes: options.watchlistSymbolCodes,
      rankingLimit: options.rankingLimit,
      staleAfterMs: options.staleAfterMs
    });

    const mismatchCount = result.reconciliation.entries.filter((entry) => entry.code !== 'in_sync').length;

    console.log(
      `[worker:live] mode=${options.mode} cycle=${cycle}/${maxCycles} venue=${container.executionAdapter.venue} symbols=${result.evaluatedSymbols.length} signals=${result.signalsEvaluated} placed=${result.ordersPlaced} skipped=${result.ordersSkipped} failed=${result.ordersFailed} incidents=${result.incidents.length} mismatches=${mismatchCount}`
    );

    if (cycle < maxCycles && cycleDelayMs > 0) {
      await wait(cycleDelayMs);
    }
  }
}
