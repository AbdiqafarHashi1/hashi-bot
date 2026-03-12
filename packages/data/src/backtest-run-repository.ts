import type { BacktestRunResult, RunMetricsSummary, RunTradeSummary } from '@hashi-bot/backtest';
import type { RunId, SymbolCode } from '@hashi-bot/core';

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

export interface BacktestRunSummaryQuery {
  profileCode?: BacktestRunSummaryRecord['profileCode'];
  symbolCode?: SymbolCode;
  limit?: number;
  offset?: number;
}

export interface BacktestTradeSummaryQuery {
  symbolCode?: SymbolCode;
  limit?: number;
  offset?: number;
}

export interface BacktestRunRepository {
  saveRun(result: BacktestRunResult): void;
  getRun(runId: RunId): BacktestRunResult | undefined;
  getRunMetrics(runId: RunId): RunMetricsSummary | undefined;
  getRunTradeSummaries(runId: RunId, query?: BacktestTradeSummaryQuery): RunTradeSummary[];
  listRunSummaries(query?: BacktestRunSummaryQuery): BacktestRunSummaryRecord[];
}

function normalizeRange(query?: { offset?: number; limit?: number }): { offset: number; limit: number } {
  const offset = Math.max(0, query?.offset ?? 0);
  const limit = Math.max(0, query?.limit ?? Number.MAX_SAFE_INTEGER);
  return { offset, limit };
}

function summarizeTrade(result: BacktestRunResult): RunTradeSummary[] {
  return result.trades.map((trade): RunTradeSummary => ({
    tradeId: trade.tradeId,
    symbolCode: trade.symbolCode,
    side: trade.side,
    setupCode: trade.setupCode,
    lifecycleState: trade.lifecycleState,
    netPnl: trade.netPnl,
    openedAtTs: trade.position.openedAtTs,
    closedAtTs: trade.position.closedAtTs,
    closeReason: trade.closeReason
  }));
}

function summarizeRun(result: BacktestRunResult): BacktestRunSummaryRecord {
  return {
    runId: result.metadata.runId,
    profileCode: result.config.profileCode,
    timeframe: result.config.timeframe,
    symbols: result.config.symbols,
    startedAtTs: result.metadata.startedAtTs,
    completedAtTs: result.metadata.completedAtTs,
    totalTrades: result.metrics.totalTrades,
    winRatePct: result.metrics.winRatePct,
    netPnl: result.metrics.netPnl,
    maxDrawdownPct: result.metrics.maxDrawdownPct
  };
}

export class InMemoryBacktestRunRepository implements BacktestRunRepository {
  private readonly runs = new Map<RunId, BacktestRunResult>();
  private readonly summaries = new Map<RunId, BacktestRunSummaryRecord>();
  private readonly tradeSummaries = new Map<RunId, RunTradeSummary[]>();

  saveRun(result: BacktestRunResult): void {
    const runId = result.metadata.runId;
    this.runs.set(runId, result);
    this.summaries.set(runId, summarizeRun(result));
    this.tradeSummaries.set(runId, summarizeTrade(result));
  }

  getRun(runId: RunId): BacktestRunResult | undefined {
    return this.runs.get(runId);
  }

  getRunMetrics(runId: RunId): RunMetricsSummary | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }

    return {
      totalTrades: run.metrics.totalTrades,
      winRatePct: run.metrics.winRatePct,
      netPnl: run.metrics.netPnl,
      maxDrawdownPct: run.metrics.maxDrawdownPct
    };
  }

  getRunTradeSummaries(runId: RunId, query?: BacktestTradeSummaryQuery): RunTradeSummary[] {
    const trades = this.tradeSummaries.get(runId) ?? [];
    const { offset, limit } = normalizeRange(query);

    let skipped = 0;
    const result: RunTradeSummary[] = [];

    for (const trade of trades) {
      if (query?.symbolCode && trade.symbolCode !== query.symbolCode) {
        continue;
      }

      if (skipped < offset) {
        skipped += 1;
        continue;
      }

      if (result.length >= limit) {
        break;
      }

      result.push(trade);
    }

    return result;
  }

  listRunSummaries(query?: BacktestRunSummaryQuery): BacktestRunSummaryRecord[] {
    const { offset, limit } = normalizeRange(query);
    let skipped = 0;
    const result: BacktestRunSummaryRecord[] = [];

    for (const summary of this.summaries.values()) {
      if (query?.profileCode && summary.profileCode !== query.profileCode) {
        continue;
      }
      if (query?.symbolCode && !summary.symbols.includes(query.symbolCode)) {
        continue;
      }

      if (skipped < offset) {
        skipped += 1;
        continue;
      }

      if (result.length >= limit) {
        break;
      }

      result.push(summary);
    }

    return result;
  }
}
