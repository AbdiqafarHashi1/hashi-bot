import type { EpochMs } from '@hashi-bot/core';

import type {
  ExecutionResult,
  ReconciliationCode,
  ReconciliationEntry,
  ReconciliationResult,
  SyncSnapshot,
  VenueOrder,
  VenuePosition
} from '../types/execution-domain.js';

export interface LocalExecutionExpectation {
  accountRef: string;
  openOrders: VenueOrder[];
  openPositions: VenuePosition[];
  recentResults?: ExecutionResult[];
  latestLocalUpdateTs?: EpochMs;
}

export interface ReconciliationInput {
  venueSnapshot: SyncSnapshot;
  local: LocalExecutionExpectation;
  staleAfterMs?: number;
  nowTs?: EpochMs;
}

function orderKey(order: Pick<VenueOrder, 'orderId' | 'clientOrderId' | 'symbolCode'>): string {
  return order.clientOrderId ?? order.orderId ?? `${order.symbolCode}`;
}

function positionKey(position: Pick<VenuePosition, 'positionId' | 'symbolCode' | 'side'>): string {
  return position.positionId ?? `${position.symbolCode}:${position.side}`;
}

function pushEntry(entries: ReconciliationEntry[], entry: Omit<ReconciliationEntry, 'observedAtTs'>, observedAtTs: EpochMs): void {
  entries.push({
    ...entry,
    observedAtTs
  });
}

function mismatchCodeFromValues(localValue: number | undefined, remoteValue: number | undefined): ReconciliationCode | undefined {
  if (localValue === undefined || remoteValue === undefined) {
    return undefined;
  }

  if (Math.abs(localValue - remoteValue) > Number.EPSILON) {
    return 'quantity_mismatch';
  }

  return undefined;
}

export function reconcileExecutionState(input: ReconciliationInput): ReconciliationResult {
  const nowTs = input.nowTs ?? input.venueSnapshot.fetchedAtTs;
  const staleAfterMs = input.staleAfterMs ?? 60_000;
  const entries: ReconciliationEntry[] = [];

  const localOrders = new Map(input.local.openOrders.map((order) => [orderKey(order), order]));
  const remoteOrders = new Map(input.venueSnapshot.openOrders.map((order) => [orderKey(order), order]));

  for (const [key, localOrder] of localOrders) {
    const remoteOrder = remoteOrders.get(key);
    if (!remoteOrder) {
      pushEntry(entries, {
        code: 'missing_remote',
        entityType: 'order',
        symbolCode: localOrder.symbolCode,
        localRef: localOrder.orderId,
        resolutionNote: 'Local expected order missing from venue snapshot.'
      }, nowTs);
      continue;
    }

    const qtyCode = mismatchCodeFromValues(localOrder.quantity, remoteOrder.quantity);
    if (qtyCode) {
      pushEntry(entries, {
        code: qtyCode,
        entityType: 'order',
        symbolCode: localOrder.symbolCode,
        localRef: localOrder.orderId,
        remoteRef: remoteOrder.orderId,
        localQuantity: localOrder.quantity,
        remoteQuantity: remoteOrder.quantity,
        resolutionNote: 'Order quantity differs between local expectation and venue snapshot.'
      }, nowTs);
    }

    if (
      localOrder.price !== undefined &&
      remoteOrder.price !== undefined &&
      Math.abs(localOrder.price - remoteOrder.price) > Number.EPSILON
    ) {
      pushEntry(entries, {
        code: 'price_mismatch',
        entityType: 'order',
        symbolCode: localOrder.symbolCode,
        localRef: localOrder.orderId,
        remoteRef: remoteOrder.orderId,
        localPrice: localOrder.price,
        remotePrice: remoteOrder.price,
        resolutionNote: 'Order price differs between local expectation and venue snapshot.'
      }, nowTs);
    }
  }

  for (const [key, remoteOrder] of remoteOrders) {
    if (!localOrders.has(key)) {
      pushEntry(entries, {
        code: 'missing_local',
        entityType: 'order',
        symbolCode: remoteOrder.symbolCode,
        remoteRef: remoteOrder.orderId,
        resolutionNote: 'Venue open order is not represented in local expected state.'
      }, nowTs);
    }
  }

  const localPositions = new Map(input.local.openPositions.map((position) => [positionKey(position), position]));
  const remotePositions = new Map(input.venueSnapshot.openPositions.map((position) => [positionKey(position), position]));

  for (const [key, localPosition] of localPositions) {
    const remotePosition = remotePositions.get(key);
    if (!remotePosition) {
      pushEntry(entries, {
        code: 'missing_remote',
        entityType: 'position',
        symbolCode: localPosition.symbolCode,
        localRef: localPosition.positionId,
        resolutionNote: 'Local expected position missing from venue snapshot.'
      }, nowTs);
      continue;
    }

    if (Math.abs(localPosition.quantity - remotePosition.quantity) > Number.EPSILON) {
      pushEntry(entries, {
        code: 'quantity_mismatch',
        entityType: 'position',
        symbolCode: localPosition.symbolCode,
        localRef: localPosition.positionId,
        remoteRef: remotePosition.positionId,
        localQuantity: localPosition.quantity,
        remoteQuantity: remotePosition.quantity,
        resolutionNote: 'Position quantity differs between local expectation and venue snapshot.'
      }, nowTs);
    }
  }

  for (const [key, remotePosition] of remotePositions) {
    if (!localPositions.has(key)) {
      pushEntry(entries, {
        code: 'orphaned_position',
        entityType: 'position',
        symbolCode: remotePosition.symbolCode,
        remoteRef: remotePosition.positionId,
        resolutionNote: 'Venue position exists without local expected ownership.'
      }, nowTs);
    }
  }

  const snapshotAge = nowTs - input.venueSnapshot.fetchedAtTs;
  if (snapshotAge > staleAfterMs) {
    pushEntry(entries, {
      code: 'stale_state',
      entityType: 'account',
      localRef: input.local.accountRef,
      remoteRef: input.venueSnapshot.accountRef,
      resolutionNote: `Venue snapshot is stale by ${snapshotAge}ms.`
    }, nowTs);
  }

  for (const result of input.local.recentResults ?? []) {
    if (result.accepted === false || result.status === 'rejected') {
      pushEntry(entries, {
        code: 'missing_remote',
        entityType: 'order',
        symbolCode: result.request.symbolCode,
        localRef: result.request.clientOrderId,
        resolutionNote: `Recent execution result was rejected: ${result.errorCode ?? result.message ?? 'unknown reason'}.`
      }, nowTs);
    }
  }

  if (entries.length === 0) {
    pushEntry(entries, {
      code: 'in_sync',
      entityType: 'account',
      localRef: input.local.accountRef,
      remoteRef: input.venueSnapshot.accountRef,
      resolutionNote: 'Local expected state and venue state are in sync.'
    }, nowTs);
  }

  return {
    venue: input.venueSnapshot.venue,
    accountRef: input.venueSnapshot.accountRef,
    reconciledAtTs: nowTs,
    entries,
    hasMismatch: entries.some((entry) => entry.code !== 'in_sync'),
    resolutionNotes: entries
      .map((entry) => entry.resolutionNote)
      .filter((note): note is string => Boolean(note))
  };
}
