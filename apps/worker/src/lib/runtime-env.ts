import { isExecutionVenue, type ExecutionVenue } from '@hashi-bot/core';

export type WorkerMode = 'evaluation' | 'backtest' | 'replay' | 'paper' | 'live';

export interface WorkerRuntimeEnv {
  raw: Record<string, string | undefined>;
  mode: WorkerMode;
  nodeEnv: 'development' | 'production' | 'test';
  executionVenue: ExecutionVenue;
  accountRef: string;
}

function parseNodeEnv(raw: string | undefined): 'development' | 'production' | 'test' {
  if (raw === 'production' || raw === 'test') {
    return raw;
  }
  return 'development';
}

function parseWorkerMode(raw: string | undefined): WorkerMode {
  switch (raw) {
    case 'evaluation':
    case 'backtest':
    case 'replay':
    case 'paper':
    case 'live':
      return raw;
    default:
      return 'evaluation';
  }
}

function required(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[worker:env] ${message}`);
  }
}

export function resolveWorkerRuntimeEnv(raw: Record<string, string | undefined>): WorkerRuntimeEnv {
  const nodeEnv = parseNodeEnv(raw.NODE_ENV);
  const mode = parseWorkerMode(raw.WORKER_MODE);
  const executionVenueRaw = raw.EXECUTION_VENUE;
  const executionVenue = isExecutionVenue(executionVenueRaw) ? executionVenueRaw : 'mock';
  const accountRef = raw.LIVE_ACCOUNT_REF?.trim() || 'paper-account';

  if (nodeEnv === 'production') {
    assert(required(raw.WORKER_MODE), 'WORKER_MODE must be explicitly set in production.');
    assert(mode !== 'evaluation', 'WORKER_MODE=evaluation is not allowed in production deployments.');
  }

  if (required(executionVenueRaw) && !isExecutionVenue(executionVenueRaw)) {
    throw new Error(`[worker:env] Invalid EXECUTION_VENUE: ${executionVenueRaw}. Expected mock|ccxt|ctrader.`);
  }

  if (mode === 'backtest') {
    assert(required(raw.DATASET_ID), 'DATASET_ID is required when WORKER_MODE=backtest.');
  }

  if (mode === 'replay') {
    assert(required(raw.REPLAY_DATASET_ID) || required(raw.DATASET_ID), 'REPLAY_DATASET_ID or DATASET_ID is required when WORKER_MODE=replay.');
  }

  if (mode === 'paper' || mode === 'live') {
    assert(required(raw.LIVE_ACCOUNT_REF), 'LIVE_ACCOUNT_REF must be explicitly set for paper/live operation.');
  }

  if (mode === 'live') {
    assert(raw.LIVE_ENABLED === 'true', 'WORKER_MODE=live requires LIVE_ENABLED=true.');
    assert(executionVenue !== 'mock', 'WORKER_MODE=live cannot use EXECUTION_VENUE=mock.');
  }

  if ((mode === 'paper' || mode === 'live') && executionVenue === 'ccxt') {
    assert(required(raw.CCXT_API_KEY) && required(raw.CCXT_API_SECRET), 'CCXT_API_KEY and CCXT_API_SECRET are required for ccxt venue.');
  }

  if ((mode === 'paper' || mode === 'live') && executionVenue === 'ctrader') {
    assert(
      required(raw.CTRADER_ACCESS_TOKEN) && required(raw.CTRADER_ACCOUNT_ID) && required(raw.CTRADER_BASE_URL),
      'CTRADER_ACCESS_TOKEN, CTRADER_ACCOUNT_ID, and CTRADER_BASE_URL are required for ctrader venue.'
    );
  }

  return {
    raw,
    nodeEnv,
    mode,
    executionVenue,
    accountRef
  };
}
