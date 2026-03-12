import type { ExecutionIncidentCode } from '../../types/execution-domain.js';

export interface ClassifiedCtraderError {
  code: ExecutionIncidentCode;
  adapterErrorCode: string;
  message: string;
  retriable: boolean;
}

function includesAny(value: string, terms: string[]): boolean {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

export function classifyCtraderError(error: unknown): ClassifiedCtraderError {
  const message = error instanceof Error ? error.message : 'Unknown cTrader error';
  const fullText = `${error instanceof Error ? error.name : 'Error'} ${message}`;

  if (includesAny(fullText, ['unauthorized', 'forbidden', 'token', 'auth', 'credential'])) {
    return { code: 'auth_failure', adapterErrorCode: 'auth_failure', message, retriable: false };
  }

  if (includesAny(fullText, ['insufficient', 'not enough', 'free margin', 'no money'])) {
    return { code: 'place_order_failure', adapterErrorCode: 'insufficient_balance', message, retriable: false };
  }

  if (includesAny(fullText, ['invalid volume', 'invalid quantity', 'lot step', 'precision'])) {
    return { code: 'place_order_failure', adapterErrorCode: 'volume_precision_error', message, retriable: false };
  }

  if (includesAny(fullText, ['symbol', 'instrument', 'unknown symbol', 'not tradable'])) {
    return { code: 'place_order_failure', adapterErrorCode: 'symbol_unsupported', message, retriable: false };
  }

  if (includesAny(fullText, ['timeout', 'network', 'socket', 'gateway', 'unavailable', '503'])) {
    return { code: 'adapter_unreachable', adapterErrorCode: 'connectivity_error', message, retriable: true };
  }

  if (includesAny(fullText, ['rate', 'too many requests', '429'])) {
    return { code: 'rate_limited', adapterErrorCode: 'rate_limited', message, retriable: true };
  }

  return { code: 'unknown', adapterErrorCode: 'unknown_error', message, retriable: false };
}
