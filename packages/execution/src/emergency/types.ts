import type { EmergencyCommand, EmergencyCommandResult, ExecutionVenue, SymbolCode } from '@hashi-bot/core';

import type { OperationalGuardDecision } from '../control/kill-switch-controller.js';

export interface AdapterCommandResult {
  ok: boolean;
  message: string;
  venue: ExecutionVenue;
  affectedSymbols?: SymbolCode[];
  errors?: string[];
}

export interface FlattenIntent {
  conservative: true;
  requireCancelFirst: true;
  targetSymbols?: SymbolCode[];
}

export interface ExecutionAdapterPort {
  venue: ExecutionVenue;
  cancelAllOrders(targetSymbols?: SymbolCode[]): Promise<AdapterCommandResult>;
  flattenPositions(intent: FlattenIntent): Promise<AdapterCommandResult>;
  disableLiveMode(reason: string): Promise<AdapterCommandResult>;
}

export interface EmergencyWorkflowDependencies {
  adapter: ExecutionAdapterPort;
  now: () => Date;
}

export interface EmergencyWorkflowContext {
  command: EmergencyCommand;
  guard?: OperationalGuardDecision;
}

export interface EmergencyWorkflowOutcome {
  result: EmergencyCommandResult;
  nextGuardPatch?: {
    forceBlockNewOrderPlacement: boolean;
    forceBlockLiveMode: boolean;
  };
  incidentNotes: string[];
}
