import type { EpochMs, ExecutionVenue, JsonValue } from '@hashi-bot/core';

export interface TelemetryIncidentEvent {
  eventId: string;
  venue: ExecutionVenue;
  accountRef: string;
  category: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  occurredAtTs: EpochMs;
  context?: JsonValue;
}

export interface TelemetryIncidentSink {
  record(event: TelemetryIncidentEvent): Promise<void>;
}
