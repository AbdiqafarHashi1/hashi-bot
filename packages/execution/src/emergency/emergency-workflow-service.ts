import type { EmergencyCommandResult, IsoTimestamp } from '@hashi-bot/core';

import { toEmergencyResultStatus } from './adapters.js';
import type { EmergencyWorkflowContext, EmergencyWorkflowDependencies, EmergencyWorkflowOutcome } from './types.js';

function toIsoTimestamp(value: Date): IsoTimestamp {
  return value.toISOString() as IsoTimestamp;
}

export class EmergencyWorkflowService {
  constructor(private readonly deps: EmergencyWorkflowDependencies) {}

  async execute(context: EmergencyWorkflowContext): Promise<EmergencyWorkflowOutcome> {
    const { command } = context;
    const processedAt = toIsoTimestamp(this.deps.now());

    if (command.type === 'cancel_all_orders') {
      const cancel = await this.deps.adapter.cancelAllOrders(command.symbol ? [command.symbol] : undefined);
      return {
        result: {
          commandId: command.commandId,
          type: command.type,
          status: toEmergencyResultStatus(cancel.ok),
          processedAt,
          message: cancel.message,
          affectedSymbols: cancel.affectedSymbols,
          affectedVenues: [cancel.venue],
          errors: cancel.errors
        },
        nextGuardPatch: {
          forceBlockNewOrderPlacement: true,
          forceBlockLiveMode: false
        },
        incidentNotes: [
          cancel.ok ? 'cancel_all_orders_completed' : 'cancel_all_orders_failed'
        ]
      };
    }

    if (command.type === 'flatten_positions') {
      const cancel = await this.deps.adapter.cancelAllOrders(command.symbol ? [command.symbol] : undefined);
      if (!cancel.ok) {
        return {
          result: {
            commandId: command.commandId,
            type: command.type,
            status: 'failed',
            processedAt,
            message: 'Flatten aborted: failed to cancel open orders first.',
            affectedVenues: [cancel.venue],
            errors: cancel.errors ?? ['flatten_positions:cancel_first_failed']
          },
          nextGuardPatch: {
            forceBlockNewOrderPlacement: true,
            forceBlockLiveMode: true
          },
          incidentNotes: ['flatten_positions_cancel_first_failed']
        };
      }

      const flatten = await this.deps.adapter.flattenPositions({
        conservative: true,
        requireCancelFirst: true,
        targetSymbols: command.symbol ? [command.symbol] : undefined
      });

      return {
        result: {
          commandId: command.commandId,
          type: command.type,
          status: toEmergencyResultStatus(flatten.ok),
          processedAt,
          message: flatten.message,
          affectedSymbols: flatten.affectedSymbols,
          affectedVenues: [flatten.venue],
          errors: flatten.errors
        },
        nextGuardPatch: {
          forceBlockNewOrderPlacement: true,
          forceBlockLiveMode: true
        },
        incidentNotes: [flatten.ok ? 'flatten_positions_completed' : 'flatten_positions_failed']
      };
    }

    if (command.type === 'disable_live_mode') {
      const disable = await this.deps.adapter.disableLiveMode(command.reason ?? 'operator_requested_disable_live_mode');
      return {
        result: {
          commandId: command.commandId,
          type: command.type,
          status: toEmergencyResultStatus(disable.ok),
          processedAt,
          message: disable.message,
          affectedVenues: [disable.venue],
          errors: disable.errors
        },
        nextGuardPatch: {
          forceBlockNewOrderPlacement: true,
          forceBlockLiveMode: true
        },
        incidentNotes: [disable.ok ? 'disable_live_mode_completed' : 'disable_live_mode_failed']
      };
    }

    const rejected: EmergencyCommandResult = {
      commandId: command.commandId,
      type: command.type,
      status: 'rejected',
      processedAt,
      message: `Emergency workflow not implemented for command type ${command.type}.`,
      errors: [`unsupported_command:${command.type}`]
    };

    return {
      result: rejected,
      incidentNotes: ['emergency_command_rejected']
    };
  }
}
