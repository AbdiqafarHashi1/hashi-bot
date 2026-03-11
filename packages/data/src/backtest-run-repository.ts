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

export class InMemoryBacktestRunRepository implements BacktestRunRepository {
  private readonly runs = new Map<RunId, BacktestRunResult>();

  saveRun(result: BacktestRunResult): void {
    this.runs.set(result.metadata.runId, result);
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
      maxDrawdownPct: run.metrics.maxDrawdownPct,
    };
  }

  getRunTradeSummaries(runId: RunId, query?: BacktestTradeSummaryQuery): RunTradeSummary[] {
    const run = this.runs.get(runId);
    if (!run) {
      return [];
    }

    const filtered = run.trades
      .map((trade): RunTradeSummary => ({
        tradeId: trade.tradeId,
        symbolCode: trade.symbolCode,
        side: trade.side,
        setupCode: trade.setupCode,
        lifecycleState: trade.lifecycleState,
        netPnl: trade.netPnl,
        openedAtTs: trade.position.openedAtTs,
        closedAtTs: trade.position.closedAtTs,
        closeReason: trade.closeReason,
      }))
      .filter((trade) => {
        if (query?.symbolCode && trade.symbolCode !== query.symbolCode) {
          return false;
        }
        return true;
      });

    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? filtered.length;

    return filtered.slice(offset, offset + limit);
  }

  listRunSummaries(query?: BacktestRunSummaryQuery): BacktestRunSummaryRecord[] {
    const summaries = Array.from(this.runs.values()).map((run) => ({
      runId: run.metadata.runId,
      profileCode: run.config.profileCode,
      timeframe: run.config.timeframe,
      symbols: run.config.symbols,
      startedAtTs: run.metadata.startedAtTs,
      completedAtTs: run.metadata.completedAtTs,
      totalTrades: run.metrics.totalTrades,
      winRatePct: run.metrics.winRatePct,
      netPnl: run.metrics.netPnl,
      maxDrawdownPct: run.metrics.maxDrawdownPct,
    }));

    const filtered = summaries.filter((summary) => {
      if (query?.profileCode && summary.profileCode !== query.profileCode) {
        return false;
      }
      if (query?.symbolCode && !summary.symbols.includes(query.symbolCode)) {
        return false;
      }
      return true;
    });

    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? filtered.length;

    return filtered.slice(offset, offset + limit);
  }
}
