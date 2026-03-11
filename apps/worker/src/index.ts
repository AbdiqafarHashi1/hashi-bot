import type { SymbolCode } from '@hashi-bot/core';

import { bootstrapWorker } from './bootstrap.js';
import { runEvaluationLoop } from './loops/evaluation.loop.js';

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

function main(): void {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const datasetId = env.DATASET_ID;
  const watchlist = parseWatchlist(env.WATCHLIST_SYMBOLS);
  const rankingLimit = env.BATCH_RANKING_LIMIT == null ? undefined : Number(env.BATCH_RANKING_LIMIT);

  const { container } = bootstrapWorker();

  runEvaluationLoop(container, {
    datasetId,
    watchlistSymbolCodes: watchlist,
    rankingLimit: Number.isFinite(rankingLimit ?? NaN) ? rankingLimit : undefined,
  });
}

main();
