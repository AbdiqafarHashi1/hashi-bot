import type { EmergencyCommandResult, OperationalStatusSummary } from '@hashi-bot/core';
import type { HealthEvaluationResult } from '@hashi-bot/execution';

export interface OperationalHealthSnapshot {
  summary: OperationalStatusSummary;
  evaluation: HealthEvaluationResult;
  latestEmergencyResult?: EmergencyCommandResult;
}

export interface OperationalHealthView {
  asOf: OperationalStatusSummary['observedAt'];
  mode: OperationalStatusSummary['mode'];
  safetyState: OperationalStatusSummary['safetyState'];
  healthStatus: OperationalStatusSummary['healthStatus'];
  incidentSeverity: OperationalStatusSummary['incidentSeverity'];
  recommendedAction: HealthEvaluationResult['recommendedAction'];
  incidents: OperationalStatusSummary['watchdog']['incidents'];
}

export class OperationalHealthSummaryService {
  toView(snapshot: OperationalHealthSnapshot): OperationalHealthView {
    return {
      asOf: snapshot.summary.observedAt,
      mode: snapshot.summary.mode,
      safetyState: snapshot.summary.safetyState,
      healthStatus: snapshot.summary.healthStatus,
      incidentSeverity: snapshot.summary.incidentSeverity,
      recommendedAction: snapshot.evaluation.recommendedAction,
      incidents: snapshot.summary.watchdog.incidents
    };
  }
}
