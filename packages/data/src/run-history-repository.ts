import type {
  ReplayTimelineEvent,
  ReplayTimelineSummary,
  RunDetailView,
  RunLaunchRequest,
  RunMetricsSummary,
  RunStatus,
  RunSummary,
  RunTradeSummary
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
    latestEventTs: events.at(-1)?.ts
  };
}

function normalizeRange(query?: { offset?: number; limit?: number }): { offset: number; limit: number } {
  const offset = Math.max(0, query?.offset ?? 0);
  const limit = Math.max(0, query?.limit ?? Number.MAX_SAFE_INTEGER);
  return { offset, limit };
}

function findStartIndexByTimestamp(events: ReplayTimelineEvent[], sinceTs: EpochMs): number {
  let left = 0;
  let right = events.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (events[mid]!.ts < sinceTs) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}

function matchesSummaryFilter(summary: RunSummary, query?: RunSummaryQuery): boolean {
  if (!query) {
    return true;
  }

  if (query.mode && summary.mode !== query.mode) {
    return false;
  }
  if (query.status && summary.status !== query.status) {
    return false;
  }
  if (query.profileCode && summary.profileCode !== query.profileCode) {
    return false;
  }
  if (query.datasetId && summary.datasetId !== query.datasetId) {
    return false;
  }
  if (query.symbolCode && !summary.symbols.includes(query.symbolCode)) {
    return false;
  }

  return true;
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
      timelineSummary
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
    const trades = this.details.get(runId)?.tradeSummaries ?? [];
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

    const events = detail.timeline;
    const baseIndex = query?.sinceTs !== undefined ? findStartIndexByTimestamp(events, query.sinceTs) : 0;
    const { offset, limit } = normalizeRange(query);
    const start = baseIndex + offset;

    if (start >= events.length || limit === 0) {
      return [];
    }

    return events.slice(start, start + limit);
  }

  listRunSummaries(query?: RunSummaryQuery): RunSummary[] {
    const { offset, limit } = normalizeRange(query);
    let skipped = 0;
    const result: RunSummary[] = [];

    for (const summary of this.summaries.values()) {
      if (!matchesSummaryFilter(summary, query)) {
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

  private summaryToMetrics(summary: RunSummary | undefined): RunMetricsSummary | undefined {
    if (!summary) {
      return undefined;
    }

    return {
      totalTrades: summary.totalTrades,
      winRatePct: summary.winRatePct,
      netPnl: summary.netPnl,
      maxDrawdownPct: summary.maxDrawdownPct
    };
  }
}
