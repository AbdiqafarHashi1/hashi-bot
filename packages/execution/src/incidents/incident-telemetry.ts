import type { EpochMs } from '@hashi-bot/core';
import type { TelemetryIncidentEvent, TelemetryIncidentSink } from '@hashi-bot/telemetry';

import type { ExecutionIncidentRecord } from './incident-model.js';

export function toTelemetryIncidentEvent(record: ExecutionIncidentRecord, fallbackTs?: EpochMs): TelemetryIncidentEvent {
  return {
    eventId: record.incidentId,
    venue: record.venue,
    accountRef: record.accountRef,
    category: record.type,
    severity: record.severity,
    message: record.message,
    occurredAtTs: record.occurredAtTs ?? fallbackTs ?? (Date.now() as EpochMs),
    context: record.context
  };
}

export async function publishExecutionIncidents(
  sink: TelemetryIncidentSink,
  incidents: ExecutionIncidentRecord[]
): Promise<void> {
  for (const incident of incidents) {
    await sink.record(toTelemetryIncidentEvent(incident));
  }
}
