import type { ExecutionVenue, IsoTimestamp } from '@hashi-bot/core';

export interface SafetyRailsInput {
  workerMode: 'evaluation' | 'backtest' | 'replay' | 'live';
  executionVenue: ExecutionVenue;
  env: Record<string, string | undefined>;
  observedAt: IsoTimestamp;
}

export interface SafetyRailsResult {
  allowed: boolean;
  blockingReasons: string[];
  warnings: string[];
}

function isTruthy(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export class OperatorSafetyRailsService {
  evaluate(input: SafetyRailsInput): SafetyRailsResult {
    const blockingReasons: string[] = [];
    const warnings: string[] = [];

    if (input.workerMode !== 'live') {
      if (input.executionVenue !== 'mock') {
        warnings.push('non_live_mode_with_real_execution_venue');
      }
      return { allowed: true, blockingReasons, warnings };
    }

    if (!isTruthy(input.env.LIVE_ENGINE_ENABLED)) {
      blockingReasons.push('live_engine_disabled');
    }

    if (input.executionVenue === 'mock' && !isTruthy(input.env.ALLOW_MOCK_LIVE_MODE)) {
      blockingReasons.push('mode_mismatch_live_with_mock_venue');
    }

    if (input.executionVenue === 'ccxt') {
      if (!input.env.CCXT_API_KEY || !input.env.CCXT_API_SECRET) {
        blockingReasons.push('ccxt_credentials_missing');
      }
    }

    if (input.executionVenue === 'ctrader') {
      if (!input.env.CTRADER_CLIENT_ID || !input.env.CTRADER_CLIENT_SECRET || !input.env.CTRADER_ACCESS_TOKEN) {
        blockingReasons.push('ctrader_credentials_missing');
      }
      if (!input.env.CTRADER_ACCOUNT_ID) {
        blockingReasons.push('ctrader_account_not_configured');
      }
    }

    if (!input.env.ACCOUNT_REF && input.executionVenue !== 'mock') {
      warnings.push('account_ref_not_set');
    }

    return {
      allowed: blockingReasons.length === 0,
      blockingReasons,
      warnings
    };
  }
}
