import type { EmergencyWorkflowOutcome, OperationalGuardDecision } from '@hashi-bot/execution';

export interface EmergencyWorkflowView {
  commandId: string;
  type: string;
  status: string;
  processedAt: string;
  message?: string;
  errors?: string[];
  incidentNotes: string[];
  lockoutPatch?: EmergencyWorkflowOutcome['nextGuardPatch'];
  guardStateAfterCommand?: OperationalGuardDecision['state'];
}

export class EmergencyWorkflowViewService {
  toView(outcome: EmergencyWorkflowOutcome, guard?: OperationalGuardDecision): EmergencyWorkflowView {
    return {
      commandId: outcome.result.commandId,
      type: outcome.result.type,
      status: outcome.result.status,
      processedAt: outcome.result.processedAt,
      message: outcome.result.message,
      errors: outcome.result.errors,
      incidentNotes: outcome.incidentNotes,
      lockoutPatch: outcome.nextGuardPatch,
      guardStateAfterCommand: guard?.state
    };
  }
}
