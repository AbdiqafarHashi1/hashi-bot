import type {
  ReplayTimelineEvent,
  ReplayTimelineSummary,
  RunDetailView,
  RunLaunchRequest,
  RunMetricsSummary,
  RunStatus,
  RunSummary,
  RunTradeSummary,
} from '@hashi-bot/backtest';
import type { DatasetId, EpochMs, RunId, SymbolCode } from '@hashi-bot/core';

export interface RunSummaryQuery {
  mode?: RunSummary['mode'];
  status?: RunStatus;
  profileCode?: RunSummary['profileCode'];
  datasetId?: DatasetId;
  symbolCode?: SymbolCode;
  limit?: number;
  offset?: number;
}

export interface RunTradeSummaryQuery {
  symbolCode?: SymbolCode;
  limit?: number;
  offset?: number;
}

export interface ReplayTimelineQuery {
  sinceTs?: EpochMs;
  limit?: number;
  offset?: number;
}

export interface RunHistoryRepository {
  saveRunSummary(summary: RunSummary): void;
  saveRunDetail(detail: RunDetailView): void;
  saveLaunchRequest(runId: RunId, request: RunLaunchRequest): void;
  getRunSummary(runId: RunId): RunSummary | undefined;
  getRunDetail(runId: RunId): RunDetailView | undefined;
  getLaunchRequest(runId: RunId): RunLaunchRequest | undefined;
  getRunMetrics(runId: RunId): RunMetricsSummary | undefined;
  getRunTradeSummaries(runId: RunId, query?: RunTradeSummaryQuery): RunTradeSummary[];
  getReplayTimelineSummary(runId: RunId): ReplayTimelineSummary | undefined;
  getReplayTimelineEvents(runId: RunId, query?: ReplayTimelineQuery): ReplayTimelineEvent[];
  listRunSummaries(query?: RunSummaryQuery): RunSummary[];
}

function computeTimelineSummary(events: ReplayTimelineEvent[]): ReplayTimelineSummary {
  const eventTypes = events.reduce<ReplayTimelineSummary['eventTypes']>((acc, event) => {
    acc[event.type] = (acc[event.type] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalEvents: events.length,
    eventTypes,
    latestEventTs: events.at(-1)?.ts,
  };
}

export class InMemoryRunHistoryRepository implements RunHistoryRepository {
  private readonly summaries = new Map<RunId, RunSummary>();
  private readonly details = new Map<RunId, RunDetailView>();
  private readonly launchRequests = new Map<RunId, RunLaunchRequest>();

  saveRunSummary(summary: RunSummary): void {
    this.summaries.set(summary.runId, summary);
  }

  saveRunDetail(detail: RunDetailView): void {
    const timelineSummary = detail.timelineSummary ?? computeTimelineSummary(detail.timeline);
    const mergedDetail: RunDetailView = {
      ...detail,
      timelineSummary,
    };

    this.details.set(detail.summary.runId, mergedDetail);
    this.summaries.set(detail.summary.runId, detail.summary);
  }

  saveLaunchRequest(runId: RunId, request: RunLaunchRequest): void {
    this.launchRequests.set(runId, request);
  }

  getRunSummary(runId: RunId): RunSummary | undefined {
    return this.summaries.get(runId);
  }

  getRunDetail(runId: RunId): RunDetailView | undefined {
    return this.details.get(runId);
  }

  getLaunchRequest(runId: RunId): RunLaunchRequest | undefined {
    return this.launchRequests.get(runId);
  }

  getRunMetrics(runId: RunId): RunMetricsSummary | undefined {
    return this.details.get(runId)?.metrics ?? this.summaryToMetrics(this.summaries.get(runId));
  }

  getRunTradeSummaries(runId: RunId, query?: RunTradeSummaryQuery): RunTradeSummary[] {
    const detail = this.details.get(runId);
    const trades = detail?.tradeSummaries ?? [];
    const filtered = trades.filter((trade) => {
      if (query?.symbolCode && trade.symbolCode !== query.symbolCode) {
        return false;
      }
      return true;
    });

    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  getReplayTimelineSummary(runId: RunId): ReplayTimelineSummary | undefined {
    const detail = this.details.get(runId);
    if (!detail) {
      return undefined;
    }

    return detail.timelineSummary ?? computeTimelineSummary(detail.timeline);
  }

  getReplayTimelineEvents(runId: RunId, query?: ReplayTimelineQuery): ReplayTimelineEvent[] {
    const detail = this.details.get(runId);
    if (!detail) {
      return [];
    }

    const filtered = detail.timeline.filter((event) => {
      if (query?.sinceTs && event.ts < query.sinceTs) {
        return false;
      }
      return true;
    });

    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  listRunSummaries(query?: RunSummaryQuery): RunSummary[] {
    const summaries = Array.from(this.summaries.values());
    const filtered = summaries.filter((summary) => {
      if (query?.mode && summary.mode !== query.mode) {
        return false;
      }
      if (query?.status && summary.status !== query.status) {
        return false;
      }
      if (query?.profileCode && summary.profileCode !== query.profileCode) {
        return false;
      }
      if (query?.datasetId && summary.datasetId !== query.datasetId) {
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

  private summaryToMetrics(summary: RunSummary | undefined): RunMetricsSummary | undefined {
    if (!summary) {
      return undefined;
    }

    return {
      totalTrades: summary.totalTrades,
      winRatePct: summary.winRatePct,
      netPnl: summary.netPnl,
      maxDrawdownPct: summary.maxDrawdownPct,
    };
  }
}
