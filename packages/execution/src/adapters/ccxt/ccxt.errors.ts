import type { ExecutionIncidentCode } from '../../types/execution-domain.js';

export interface ClassifiedCcxtError {
  code: ExecutionIncidentCode;
  adapterErrorCode: string;
  message: string;
  retriable: boolean;
}

function includesAny(value: string, terms: string[]): boolean {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

export function classifyCcxtError(error: unknown): ClassifiedCcxtError {
  const message = error instanceof Error ? error.message : 'Unknown CCXT error';
  const fullText = `${error instanceof Error ? error.name : 'Error'} ${message}`;

  if (includesAny(fullText, ['authentication', 'auth', 'api key', 'permission', 'invalid nonce'])) {
    return { code: 'auth_failure', adapterErrorCode: 'auth_failure', message, retriable: false };
  }

  if (includesAny(fullText, ['insufficient', 'not enough balance', 'margin is insufficient'])) {
    return { code: 'place_order_failure', adapterErrorCode: 'insufficient_balance', message, retriable: false };
  }

  if (includesAny(fullText, ['precision', 'invalid amount', 'min amount', 'lot size'])) {
    return { code: 'place_order_failure', adapterErrorCode: 'precision_error', message, retriable: false };
  }

  if (includesAny(fullText, ['rate limit', 'too many requests', '429', 'ddos'])) {
    return { code: 'rate_limited', adapterErrorCode: 'rate_limited', message, retriable: true };
  }

  if (includesAny(fullText, ['network', 'timeout', 'econnreset', 'unavailable', 'maintenance'])) {
    return { code: 'adapter_unreachable', adapterErrorCode: 'connectivity_error', message, retriable: true };
  }

  if (includesAny(fullText, ['symbol', 'market not found', 'unknown market'])) {
    return { code: 'place_order_failure', adapterErrorCode: 'symbol_unsupported', message, retriable: false };
  }

  return { code: 'unknown', adapterErrorCode: 'unknown_error', message, retriable: false };
}
