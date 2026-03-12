import type { EpochMs, WatchdogSignalStatus, WatchdogStatus } from '@hashi-bot/core';

export interface WatchdogThresholds {
  feedStaleAfterMs: number;
  syncStaleAfterMs: number;
  heartbeatStaleAfterMs: number;
  consecutiveExecutionErrorLimit: number;
  rejectedOrderStreakLimit: number;
  reconciliationDriftPersistenceLimit: number;
}

export const DEFAULT_WATCHDOG_THRESHOLDS: WatchdogThresholds = {
  feedStaleAfterMs: 45_000,
  syncStaleAfterMs: 30_000,
  heartbeatStaleAfterMs: 15_000,
  consecutiveExecutionErrorLimit: 3,
  rejectedOrderStreakLimit: 3,
  reconciliationDriftPersistenceLimit: 2
};

export interface WatchdogEvaluationInput {
  nowTs: EpochMs;
  lastFeedTs?: EpochMs;
  lastSyncTs?: EpochMs;
  lastHeartbeatTs?: EpochMs;
  consecutiveExecutionErrors: number;
  rejectedOrderStreak: number;
  reconciliationMismatchStreak: number;
  lastReconciliationMismatchTs?: EpochMs;
}

function ageMs(nowTs: EpochMs, ts?: EpochMs): number | undefined {
  if (ts === undefined) {
    return undefined;
  }

  return Math.max(0, nowTs - ts);
}

function statusFromBreach(breached: boolean, missingData: boolean): WatchdogSignalStatus {
  if (missingData) {
    return 'unknown';
  }

  return breached ? 'critical' : 'ok';
}

function maxStatus(left: WatchdogSignalStatus, right: WatchdogSignalStatus): WatchdogSignalStatus {
  const rank: Record<WatchdogSignalStatus, number> = {
    ok: 0,
    warning: 1,
    critical: 2,
    unknown: 3
  };

  return rank[left] >= rank[right] ? left : right;
}

export class ExecutionWatchdogService {
  public constructor(private readonly thresholds: WatchdogThresholds = DEFAULT_WATCHDOG_THRESHOLDS) {}

  public evaluate(input: WatchdogEvaluationInput): WatchdogStatus {
    const feedAgeMs = ageMs(input.nowTs, input.lastFeedTs);
    const syncAgeMs = ageMs(input.nowTs, input.lastSyncTs);
    const heartbeatAgeMs = ageMs(input.nowTs, input.lastHeartbeatTs);

    const feedStale = feedAgeMs !== undefined && feedAgeMs > this.thresholds.feedStaleAfterMs;
    const syncStale = syncAgeMs !== undefined && syncAgeMs > this.thresholds.syncStaleAfterMs;
    const heartbeatStale = heartbeatAgeMs !== undefined && heartbeatAgeMs > this.thresholds.heartbeatStaleAfterMs;

    const executionFailureBreached = input.consecutiveExecutionErrors >= this.thresholds.consecutiveExecutionErrorLimit;
    const rejectedOrderBreached = input.rejectedOrderStreak >= this.thresholds.rejectedOrderStreakLimit;
    const reconciliationPersistent = input.reconciliationMismatchStreak >= this.thresholds.reconciliationDriftPersistenceLimit;

    const feedStatus = statusFromBreach(feedStale, feedAgeMs === undefined);
    const syncStatus = statusFromBreach(syncStale, syncAgeMs === undefined);
    const heartbeatStatus = statusFromBreach(heartbeatStale, heartbeatAgeMs === undefined);
    const executionFailureStatus = statusFromBreach(executionFailureBreached, false);
    const rejectedOrderStatus = statusFromBreach(rejectedOrderBreached, false);
    const reconciliationStatus = statusFromBreach(reconciliationPersistent, false);

    const overallStatus = [
      feedStatus,
      syncStatus,
      heartbeatStatus,
      executionFailureStatus,
      rejectedOrderStatus,
      reconciliationStatus
    ].reduce<WatchdogSignalStatus>((acc, current) => maxStatus(acc, current), 'ok');

    return {
      overallStatus,
      feed: {
        status: feedStatus,
        stale: feedStale,
        ageMs: feedAgeMs,
        thresholdMs: this.thresholds.feedStaleAfterMs,
        lastUpdateTs: input.lastFeedTs
      },
      sync: {
        status: syncStatus,
        stale: syncStale,
        ageMs: syncAgeMs,
        thresholdMs: this.thresholds.syncStaleAfterMs,
        lastUpdateTs: input.lastSyncTs
      },
      heartbeat: {
        status: heartbeatStatus,
        stale: heartbeatStale,
        ageMs: heartbeatAgeMs,
        thresholdMs: this.thresholds.heartbeatStaleAfterMs,
        lastUpdateTs: input.lastHeartbeatTs
      },
      executionFailures: {
        status: executionFailureStatus,
        breached: executionFailureBreached,
        currentCount: input.consecutiveExecutionErrors,
        threshold: this.thresholds.consecutiveExecutionErrorLimit
      },
      rejectedOrders: {
        status: rejectedOrderStatus,
        breached: rejectedOrderBreached,
        currentCount: input.rejectedOrderStreak,
        threshold: this.thresholds.rejectedOrderStreakLimit
      },
      reconciliation: {
        status: reconciliationStatus,
        persistent: reconciliationPersistent,
        driftCount: input.reconciliationMismatchStreak,
        threshold: this.thresholds.reconciliationDriftPersistenceLimit,
        latestMismatchTs: input.lastReconciliationMismatchTs
      },
      feedStale,
      feedStalenessMs: feedAgeMs,
      syncStale,
      syncStalenessMs: syncAgeMs,
      heartbeatAgeMs,
      consecutiveFailures: input.consecutiveExecutionErrors,
      rejectedOrderStreak: input.rejectedOrderStreak,
      reconciliationDrift: reconciliationPersistent,
      reconciliationDriftCount: input.reconciliationMismatchStreak,
      updatedAtTs: input.nowTs
    };
  }
}
