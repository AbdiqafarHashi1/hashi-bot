import type { EpochMs, ExecutionVenue, IncidentSeverity, JsonValue, OperationalStatusSummary } from '@hashi-bot/core';

export interface TelemetryIncidentEvent {
  eventId: string;
  venue: ExecutionVenue;
  accountRef: string;
  category: string;
  severity: IncidentSeverity;
  message: string;
  occurredAtTs: EpochMs;
  context?: JsonValue;
}

export interface TelemetryOperationalStatusEvent {
  eventId: string;
  venue: ExecutionVenue;
  accountRef: string;
  summary: OperationalStatusSummary;
  occurredAtTs: EpochMs;
  context?: JsonValue;
}

export interface TelemetryIncidentSink {
  record(event: TelemetryIncidentEvent): Promise<void>;
}

export interface TelemetryOperationalStatusSink {
  recordOperationalStatus(event: TelemetryOperationalStatusEvent): Promise<void>;
}


export interface TelemetryOperationalTransitionEvent {
  eventId: string;
  venue: ExecutionVenue;
  accountRef: string;
  fromState: string;
  toState: string;
  reason: string;
  occurredAtTs: EpochMs;
  context?: JsonValue;
}

export interface TelemetryOperationalTransitionSink {
  recordTransition(event: TelemetryOperationalTransitionEvent): Promise<void>;
}


export interface TelemetryEmergencyCommandEvent {
  eventId: string;
  venue: ExecutionVenue;
  accountRef: string;
  command: string;
  accepted: boolean;
  completed: boolean;
  occurredAtTs: EpochMs;
  message?: string;
  errorCode?: string;
  context?: JsonValue;
}

export interface TelemetryEmergencyCommandSink {
  recordEmergencyCommand(event: TelemetryEmergencyCommandEvent): Promise<void>;
}
