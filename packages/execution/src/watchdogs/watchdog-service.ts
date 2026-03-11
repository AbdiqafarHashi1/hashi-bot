import type {
  EpochMs,
  HealthStatus,
  IncidentSeverity,
  IsoTimestamp,
  WatchdogIncident,
  WatchdogStatus
} from '@hashi-bot/core';

import { DEFAULT_EXECUTION_WATCHDOG_THRESHOLDS, type ExecutionWatchdogThresholds } from './defaults.js';
import type { EvaluatedWatchdogReport, OperationalWatchdogInput, WatchdogSignalStatus } from './types.js';

function ageMs(nowMs: EpochMs, candidate?: EpochMs): EpochMs | undefined {
  return candidate === undefined ? undefined : (Math.max(0, nowMs - candidate) as EpochMs);
}

function toIsoTimestamp(epochMs?: EpochMs): IsoTimestamp | undefined {
  return epochMs === undefined ? undefined : (new Date(epochMs).toISOString() as IsoTimestamp);
}

function makeSignal(
  code: WatchdogSignalStatus['code'],
  observedValue: number | undefined,
  warningThreshold: number,
  breachThreshold: number
): WatchdogSignalStatus {
  if (observedValue === undefined) {
    return { code, state: 'unknown', threshold: breachThreshold, breach: false, notes: 'No observation available yet.' };
  }

  const breach = observedValue >= breachThreshold;
  if (breach) {
    return { code, state: 'breach', observedValue, threshold: breachThreshold, breach };
  }

  const warning = observedValue >= warningThreshold;
  return {
    code,
    state: warning ? 'warning' : 'ok',
    observedValue,
    threshold: warning ? warningThreshold : breachThreshold,
    breach: false
  };
}

function incidentForSignal(signal: WatchdogSignalStatus, evaluatedAt: IsoTimestamp): WatchdogIncident | null {
  if (signal.state !== 'warning' && signal.state !== 'breach') {
    return null;
  }

  const severity: IncidentSeverity = signal.state === 'breach' ? 'critical' : 'warning';
  return {
    code: signal.code,
    severity,
    message: `${signal.code} detected (${signal.observedValue ?? 'n/a'} vs threshold ${signal.threshold}).`,
    detectedAt: evaluatedAt
  };
}

function deriveHealth(signals: WatchdogSignalStatus[]): HealthStatus {
  if (signals.some((signal) => signal.state === 'breach')) {
    return 'unhealthy';
  }

  if (signals.some((signal) => signal.state === 'warning')) {
    return 'degraded';
  }

  return 'healthy';
}

export class WatchdogService {
  constructor(private readonly thresholds: ExecutionWatchdogThresholds = DEFAULT_EXECUTION_WATCHDOG_THRESHOLDS) {}

  evaluate(input: OperationalWatchdogInput): EvaluatedWatchdogReport {
    const feedStalenessMs = ageMs(input.nowMs, input.lastFeedUpdateMs);
    const syncStalenessMs = ageMs(input.nowMs, input.lastSyncMs);
    const heartbeatAgeMs = ageMs(input.nowMs, input.lastHeartbeatMs);

    const driftForPersistence =
      input.reconciliationDriftRatio !== undefined && input.driftPersistenceCycles >= this.thresholds.maxDriftPersistenceCycles
        ? input.reconciliationDriftRatio
        : undefined;

    const signals: WatchdogSignalStatus[] = [
      makeSignal('feed_stale', feedStalenessMs, this.thresholds.warningFeedStalenessMs, this.thresholds.maxFeedStalenessMs),
      makeSignal('sync_stale', syncStalenessMs, this.thresholds.warningSyncStalenessMs, this.thresholds.maxSyncStalenessMs),
      makeSignal('heartbeat_stale', heartbeatAgeMs, this.thresholds.warningHeartbeatAgeMs, this.thresholds.maxHeartbeatAgeMs),
      makeSignal(
        'consecutive_failures',
        input.consecutiveExecutionFailures,
        this.thresholds.warningConsecutiveFailures,
        this.thresholds.maxConsecutiveFailures
      ),
      makeSignal(
        'repeated_rejections',
        input.repeatedRejectedOrders,
        this.thresholds.warningRepeatedRejectedOrders,
        this.thresholds.maxRepeatedRejectedOrders
      ),
      makeSignal(
        'reconciliation_drift',
        driftForPersistence,
        this.thresholds.warningReconciliationDriftRatio,
        this.thresholds.maxReconciliationDriftRatio
      )
    ];

    const incidents = signals
      .map((signal) => incidentForSignal(signal, input.evaluatedAt))
      .filter((incident): incident is WatchdogIncident => incident !== null);

    const status: WatchdogStatus = {
      evaluatedAt: input.evaluatedAt,
      lastFeedUpdateAt: toIsoTimestamp(input.lastFeedUpdateMs),
      feedStalenessMs,
      lastSyncAt: toIsoTimestamp(input.lastSyncMs),
      syncStalenessMs,
      lastHeartbeatAt: toIsoTimestamp(input.lastHeartbeatMs),
      heartbeatAgeMs,
      consecutiveFailures: input.consecutiveExecutionFailures,
      repeatedRejectedOrders: input.repeatedRejectedOrders,
      reconciliationDriftRatio: input.reconciliationDriftRatio,
      thresholds: {
        maxFeedStalenessMs: this.thresholds.maxFeedStalenessMs,
        maxSyncStalenessMs: this.thresholds.maxSyncStalenessMs,
        maxHeartbeatAgeMs: this.thresholds.maxHeartbeatAgeMs,
        maxConsecutiveFailures: this.thresholds.maxConsecutiveFailures,
        maxRepeatedRejectedOrders: this.thresholds.maxRepeatedRejectedOrders,
        maxReconciliationDriftRatio: this.thresholds.maxReconciliationDriftRatio
      },
      status: deriveHealth(signals),
      incidents
    };

    return { status, signals };
  }
}
