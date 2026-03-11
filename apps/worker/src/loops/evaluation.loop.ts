import type { SymbolCode } from '@hashi-bot/core';

import type { WorkerContainer } from '../lib/container.js';
import { runEvaluateMarketBatchJob } from '../jobs/evaluate-market-batch.job.js';
import { runEvaluateMarketJob } from '../jobs/evaluate-market.job.js';

export interface EvaluationLoopOptions {
  datasetId?: string;
  watchlistSymbolCodes?: SymbolCode[];
  rankingLimit?: number;
}

export function runEvaluationLoop(container: WorkerContainer, options: EvaluationLoopOptions = {}): void {
  if (options.datasetId) {
    const results = runEvaluateMarketJob(container, options.datasetId);

    for (const result of results) {
      const { symbolCode, snapshot, regime, strategy } = result;
      console.log(
        `[worker:evaluation] symbol=${symbolCode} close=${snapshot.latestClose ?? snapshot.last} regime=${regime.regimeState} tradable=${regime.isTradable} candidates=${strategy.candidates.length} qualified=${strategy.qualifiedSetups.length} signals=${strategy.signals.length}`
      );
    }

    return;
  }

  const batch = runEvaluateMarketBatchJob(container, {
    watchlistSymbolCodes: options.watchlistSymbolCodes,
    rankingLimit: options.rankingLimit,
  });

  console.log(
    `[worker:evaluation:batch] evaluatedSymbols=${batch.evaluatedSymbols.length} rankedSignals=${batch.strategyBatch.rankedSignals.length}`
  );

  for (const ranked of batch.strategyBatch.rankedSignals) {
    console.log(
      `[worker:evaluation:rank] rank=${ranked.rank} symbol=${ranked.symbolCode} setup=${ranked.signal.setupCode} side=${ranked.signal.side} score=${ranked.score.toFixed(2)} entry=${ranked.signal.entry} stop=${ranked.signal.stop}`
    );
  }
}
