import type { RunId } from '@hashi-bot/core';
import type { BacktestRunResult } from '@hashi-bot/backtest';

export interface BacktestRunSummaryRecord {
  runId: RunId;
  profileCode: BacktestRunResult['config']['profileCode'];
  timeframe: BacktestRunResult['config']['timeframe'];
  symbols: BacktestRunResult['config']['symbols'];
  startedAtTs: BacktestRunResult['metadata']['startedAtTs'];
  completedAtTs?: BacktestRunResult['metadata']['completedAtTs'];
  totalTrades: number;
  winRatePct: number;
  netPnl: number;
  maxDrawdownPct: number;
}

export interface BacktestRunRepository {
  saveRun(result: BacktestRunResult): void;
  getRun(runId: RunId): BacktestRunResult | undefined;
  listRunSummaries(): BacktestRunSummaryRecord[];
}

export class InMemoryBacktestRunRepository implements BacktestRunRepository {
  private readonly runs = new Map<RunId, BacktestRunResult>();

  saveRun(result: BacktestRunResult): void {
    this.runs.set(result.metadata.runId, result);
  }

  getRun(runId: RunId): BacktestRunResult | undefined {
    return this.runs.get(runId);
  }

  listRunSummaries(): BacktestRunSummaryRecord[] {
    return Array.from(this.runs.values()).map((run) => ({
      runId: run.metadata.runId,
      profileCode: run.config.profileCode,
      timeframe: run.config.timeframe,
      symbols: run.config.symbols,
      startedAtTs: run.metadata.startedAtTs,
      completedAtTs: run.metadata.completedAtTs,
      totalTrades: run.metrics.totalTrades,
      winRatePct: run.metrics.winRatePct,
      netPnl: run.metrics.netPnl,
      maxDrawdownPct: run.metrics.maxDrawdownPct
    }));
  }
}
