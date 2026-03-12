import type { SymbolCode } from '@hashi-bot/core';
import type {
  AccountSnapshot,
  CancelRequest,
  CancelResult,
  ExecutionHealthSummary,
  ExecutionResult,
  ExecutionRequest,
  SyncSnapshot,
  VenueOrder,
  VenuePosition
} from '../types/execution-domain.js';
import type { BracketOrderRequest } from './order.types.js';

export interface ExecutionSyncOptions {
  symbolCodes?: SymbolCode[];
}

export interface AdapterHealthOptions {
  withSync?: boolean;
}

export interface ExecutionAdapter {
  readonly venue: AccountSnapshot['venue'];

  getAccountSnapshot(accountRef: string): Promise<AccountSnapshot>;
  getOpenOrders(accountRef: string, symbolCode?: SymbolCode): Promise<VenueOrder[]>;
  getOpenPositions(accountRef: string, symbolCode?: SymbolCode): Promise<VenuePosition[]>;

  placeOrder(request: ExecutionRequest): Promise<ExecutionResult>;
  placeBracketOrder?(request: BracketOrderRequest): Promise<ExecutionResult[]>;

  cancelOrder(request: CancelRequest): Promise<CancelResult>;
  cancelAllForSymbol?(accountRef: string, symbolCode: SymbolCode): Promise<CancelResult[]>;

  sync(accountRef: string, options?: ExecutionSyncOptions): Promise<SyncSnapshot>;
  getHealth(accountRef: string, options?: AdapterHealthOptions): Promise<ExecutionHealthSummary>;
}
