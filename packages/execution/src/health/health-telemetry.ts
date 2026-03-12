import type { EpochMs, ExecutionVenue, OperationalStatusSummary } from '@hashi-bot/core';
import type { EmergencyCommandExecutionResult } from '../types/execution-domain.js';
import type {
  TelemetryOperationalStatusEvent,
  TelemetryOperationalStatusSink,
  TelemetryEmergencyCommandEvent,
  TelemetryEmergencyCommandSink,
  TelemetryOperationalTransitionEvent,
  TelemetryOperationalTransitionSink
} from '@hashi-bot/telemetry';

export function toTelemetryOperationalStatusEvent(params: {
  eventId: string;
  venue: ExecutionVenue;
  accountRef: string;
  summary: OperationalStatusSummary;
  occurredAtTs?: EpochMs;
}): TelemetryOperationalStatusEvent {
  return {
    eventId: params.eventId,
    venue: params.venue,
    accountRef: params.accountRef,
    summary: params.summary,
    occurredAtTs: params.occurredAtTs ?? params.summary.lastUpdatedTs
  };
}

export async function publishOperationalStatus(
  sink: TelemetryOperationalStatusSink,
  event: TelemetryOperationalStatusEvent
): Promise<void> {
  await sink.recordOperationalStatus(event);
}


export function toTelemetryOperationalTransitionEvent(params: {
  eventId: string;
  venue: ExecutionVenue;
  accountRef: string;
  fromState: string;
  toState: string;
  reason: string;
  occurredAtTs: EpochMs;
}): TelemetryOperationalTransitionEvent {
  return {
    eventId: params.eventId,
    venue: params.venue,
    accountRef: params.accountRef,
    fromState: params.fromState,
    toState: params.toState,
    reason: params.reason,
    occurredAtTs: params.occurredAtTs
  };
}

export async function publishOperationalTransition(
  sink: TelemetryOperationalTransitionSink,
  event: TelemetryOperationalTransitionEvent
): Promise<void> {
  await sink.recordTransition(event);
}


export function toTelemetryEmergencyCommandEvent(params: {
  result: EmergencyCommandExecutionResult;
}): TelemetryEmergencyCommandEvent {
  return {
    eventId: params.result.commandId,
    venue: params.result.venue,
    accountRef: params.result.accountRef,
    command: params.result.command,
    accepted: params.result.accepted,
    completed: params.result.completed,
    occurredAtTs: params.result.completedAtTs ?? params.result.receivedAtTs,
    message: params.result.message,
    errorCode: params.result.errorCode,
    context: params.result.details
  };
}

export async function publishEmergencyCommandResults(
  sink: TelemetryEmergencyCommandSink,
  results: EmergencyCommandExecutionResult[]
): Promise<void> {
  for (const result of results) {
    await sink.recordEmergencyCommand(toTelemetryEmergencyCommandEvent({ result }));
  }
}
