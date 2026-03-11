import type { EmergencyCommandResult, ExecutionVenue, SymbolCode } from '@hashi-bot/core';

import type { AdapterCommandResult, ExecutionAdapterPort, FlattenIntent } from './types.js';

function unsupported(venue: ExecutionVenue, action: string): AdapterCommandResult {
  return {
    ok: false,
    venue,
    message: `${action} is not implemented for ${venue} adapter.`,
    errors: [`${venue}:${action}:not_implemented`]
  };
}

export class MockExecutionAdapter implements ExecutionAdapterPort {
  readonly venue: ExecutionVenue = 'mock';

  async cancelAllOrders(targetSymbols?: SymbolCode[]): Promise<AdapterCommandResult> {
    return {
      ok: true,
      venue: this.venue,
      message: 'Mock adapter acknowledged cancel_all_orders.',
      affectedSymbols: targetSymbols
    };
  }

  async flattenPositions(intent: FlattenIntent): Promise<AdapterCommandResult> {
    return {
      ok: true,
      venue: this.venue,
      message: `Mock flatten acknowledged (cancel-first=${intent.requireCancelFirst}).`,
      affectedSymbols: intent.targetSymbols
    };
  }

  async disableLiveMode(reason: string): Promise<AdapterCommandResult> {
    return {
      ok: true,
      venue: this.venue,
      message: `Mock live mode disabled: ${reason}`
    };
  }
}

/**
 * Phase-7 conservative stubs preserving venue-specific behavior notes.
 * - ccxt flatten should use reduce-only market exits per symbol.
 * - ctrader flatten should close by position id with broker-side confirmation.
 */
export class CcxtExecutionAdapter implements ExecutionAdapterPort {
  readonly venue: ExecutionVenue = 'ccxt';

  async cancelAllOrders(_targetSymbols?: SymbolCode[]): Promise<AdapterCommandResult> {
    return unsupported(this.venue, 'cancelAllOrders');
  }

  async flattenPositions(_intent: FlattenIntent): Promise<AdapterCommandResult> {
    return unsupported(this.venue, 'flattenPositions');
  }

  async disableLiveMode(_reason: string): Promise<AdapterCommandResult> {
    return unsupported(this.venue, 'disableLiveMode');
  }
}

export class CtraderExecutionAdapter implements ExecutionAdapterPort {
  readonly venue: ExecutionVenue = 'ctrader';

  async cancelAllOrders(_targetSymbols?: SymbolCode[]): Promise<AdapterCommandResult> {
    return unsupported(this.venue, 'cancelAllOrders');
  }

  async flattenPositions(_intent: FlattenIntent): Promise<AdapterCommandResult> {
    return unsupported(this.venue, 'flattenPositions');
  }

  async disableLiveMode(_reason: string): Promise<AdapterCommandResult> {
    return unsupported(this.venue, 'disableLiveMode');
  }
}

export function toEmergencyResultStatus(ok: boolean): EmergencyCommandResult['status'] {
  return ok ? 'completed' : 'failed';
}
