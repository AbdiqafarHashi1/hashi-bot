import type { EmergencyCommand, EpochMs } from '@hashi-bot/core';

import type { ExecutionAdapter } from '../base/execution-adapter.js';
import type { ExecutionIncidentRecord } from '../incidents/incident-model.js';
import type { EmergencyCommandExecutionResult } from '../types/execution-domain.js';

export interface EmergencyOperationsInput {
  accountRef: string;
  commands: EmergencyCommand[];
  nowTs?: EpochMs;
}

export interface EmergencyOperationsReport {
  results: EmergencyCommandExecutionResult[];
  incidents: ExecutionIncidentRecord[];
}

function now(): EpochMs {
  return Date.now() as EpochMs;
}

function incidentFromFailure(params: {
  accountRef: string;
  venue: ExecutionAdapter['venue'];
  command: EmergencyCommand;
  message: string;
  context?: Record<string, unknown>;
}): ExecutionIncidentRecord {
  return {
    incidentId: `${params.venue}_${params.command.commandId}_emergency_failure`,
    venue: params.venue,
    accountRef: params.accountRef,
    type: 'unknown',
    severity: 'error',
    message: `Emergency command ${params.command.command} failed: ${params.message}`,
    context: {
      command: params.command.command,
      commandId: params.command.commandId,
      ...params.context
    },
    occurredAtTs: now()
  };
}

export class EmergencyOperationsService {
  public constructor(private readonly adapter: ExecutionAdapter) {}

  public async execute(input: EmergencyOperationsInput): Promise<EmergencyOperationsReport> {
    const results: EmergencyCommandExecutionResult[] = [];
    const incidents: ExecutionIncidentRecord[] = [];

    for (const command of input.commands) {
      if (command.command === 'cancel_all_orders') {
        const outcome = await this.cancelAllOrders(input.accountRef, command);
        results.push(outcome.result);
        incidents.push(...outcome.incidents);
        continue;
      }

      if (command.command === 'flatten_positions') {
        const outcome = await this.flattenPositions(input.accountRef, command);
        results.push(outcome.result);
        incidents.push(...outcome.incidents);
        continue;
      }

      if (command.command === 'disable_live_mode') {
        results.push({
          commandId: command.commandId,
          command: command.command,
          accountRef: input.accountRef,
          venue: this.adapter.venue,
          accepted: true,
          completed: true,
          message: 'Disable live mode acknowledged. Trading lockout should be enforced by operational controller.',
          receivedAtTs: input.nowTs ?? now(),
          completedAtTs: now(),
          details: {
            lockoutExpected: true
          }
        });
        continue;
      }

      results.push({
        commandId: command.commandId,
        command: command.command,
        accountRef: input.accountRef,
        venue: this.adapter.venue,
        accepted: false,
        completed: false,
        message: `Emergency command ${command.command} is not handled by emergency execution service.`,
        errorCode: 'unsupported_command',
        receivedAtTs: input.nowTs ?? now(),
        details: {
          supportedCommands: ['cancel_all_orders', 'flatten_positions', 'disable_live_mode']
        }
      });
    }

    return {
      results,
      incidents
    };
  }

  private async cancelAllOrders(accountRef: string, command: EmergencyCommand): Promise<{
    result: EmergencyCommandExecutionResult;
    incidents: ExecutionIncidentRecord[];
  }> {
    const incidents: ExecutionIncidentRecord[] = [];
    const openOrders = await this.adapter.getOpenOrders(accountRef);

    let canceled = 0;
    let failed = 0;

    for (const order of openOrders) {
      const cancelResult = await this.adapter.cancelOrder({
        venue: this.adapter.venue,
        accountRef,
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        symbolCode: order.symbolCode,
        venueSymbol: order.venueSymbol,
        requestedAtTs: now()
      });

      if (cancelResult.canceled) {
        canceled += 1;
      } else {
        failed += 1;
        incidents.push(
          incidentFromFailure({
            accountRef,
            venue: this.adapter.venue,
            command,
            message: cancelResult.message ?? cancelResult.errorCode ?? 'Unknown cancel failure',
            context: {
              orderId: order.orderId,
              symbolCode: order.symbolCode,
              venueSymbol: order.venueSymbol
            }
          })
        );
      }
    }

    return {
      result: {
        commandId: command.commandId,
        command: command.command,
        accountRef,
        venue: this.adapter.venue,
        accepted: true,
        completed: failed === 0,
        message: `Cancel-all completed with canceled=${canceled}, failed=${failed}.`,
        errorCode: failed > 0 ? 'partial_cancel_failure' : undefined,
        receivedAtTs: now(),
        completedAtTs: now(),
        details: {
          openOrderCount: openOrders.length,
          canceled,
          failed
        }
      },
      incidents
    };
  }

  private async flattenPositions(accountRef: string, command: EmergencyCommand): Promise<{
    result: EmergencyCommandExecutionResult;
    incidents: ExecutionIncidentRecord[];
  }> {
    const incidents: ExecutionIncidentRecord[] = [];
    const openPositions = await this.adapter.getOpenPositions(accountRef);

    // Conservative flatten: cancel all open orders first to avoid immediate re-entry.
    const preCancel = await this.cancelAllOrders(accountRef, command);
    incidents.push(...preCancel.incidents);

    let flattened = 0;
    let failed = 0;

    for (const position of openPositions) {
      const side = position.side === 'long' ? 'sell' : 'buy';
      const flattenResult = await this.adapter.placeOrder({
        venue: this.adapter.venue,
        accountRef,
        symbolCode: position.symbolCode,
        venueSymbol: position.venueSymbol,
        side,
        orderType: 'market',
        quantity: position.quantity,
        reduceOnly: true,
        submittedAtTs: now()
      });

      if (flattenResult.accepted) {
        flattened += 1;
      } else {
        failed += 1;
        incidents.push(
          incidentFromFailure({
            accountRef,
            venue: this.adapter.venue,
            command,
            message: flattenResult.message ?? flattenResult.errorCode ?? 'Unknown flatten failure',
            context: {
              symbolCode: position.symbolCode,
              side: position.side,
              quantity: position.quantity
            }
          })
        );
      }
    }

    return {
      result: {
        commandId: command.commandId,
        command: command.command,
        accountRef,
        venue: this.adapter.venue,
        accepted: true,
        completed: failed === 0,
        message: `Flatten completed with flattened=${flattened}, failed=${failed}.`,
        errorCode: failed > 0 ? 'partial_flatten_failure' : undefined,
        receivedAtTs: now(),
        completedAtTs: now(),
        details: {
          openPositionCount: openPositions.length,
          flattened,
          failed,
          preCancel: {
            commandId: preCancel.result.commandId,
            accepted: preCancel.result.accepted,
            completed: preCancel.result.completed,
            message: preCancel.result.message ?? null,
            errorCode: preCancel.result.errorCode ?? null
          }
        }
      },
      incidents
    };
  }
}
