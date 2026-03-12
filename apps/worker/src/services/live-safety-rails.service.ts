import type { ExecutionAdapter } from '@hashi-bot/execution';

export interface LiveSafetyRailsInput {
  workerMode: string;
  accountRef: string;
  env: Record<string, string | undefined>;
}

export interface LiveSafetyRailsDecision {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
}

function required(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

export class LiveSafetyRailsService {
  public constructor(private readonly adapter: ExecutionAdapter) {}

  public async evaluate(input: LiveSafetyRailsInput): Promise<LiveSafetyRailsDecision> {
    const reasons: string[] = [];
    const warnings: string[] = [];

    if (input.workerMode !== 'live' && input.workerMode !== 'paper') {
      return { allowed: true, reasons, warnings };
    }

    const venue = this.adapter.venue;

    if (!required(input.accountRef)) {
      reasons.push('missing_account_ref');
    }

    if (input.workerMode === 'live') {
      if (input.env.LIVE_ENABLED !== 'true') {
        reasons.push('live_mode_requires_live_enabled_true');
      }

      if (venue === 'mock') {
        reasons.push('live_mode_cannot_use_mock_venue');
      }
    }

    if (input.workerMode === 'paper' && input.env.LIVE_ENABLED === 'true') {
      warnings.push('live_enabled_true_while_worker_in_paper_mode');
    }

    if (venue === 'ccxt') {
      if (!required(input.env.CCXT_API_KEY) || !required(input.env.CCXT_API_SECRET)) {
        reasons.push('ccxt_credentials_missing');
      }
    }

    if (venue === 'ctrader') {
      if (!required(input.env.CTRADER_ACCESS_TOKEN) || !required(input.env.CTRADER_ACCOUNT_ID) || !required(input.env.CTRADER_BASE_URL)) {
        reasons.push('ctrader_credentials_or_endpoint_missing');
      }
    }

    if (input.env.EXECUTION_VENUE && input.env.EXECUTION_VENUE !== venue) {
      reasons.push('execution_venue_env_mismatch');
    }

    try {
      const health = await this.adapter.getHealth(input.accountRef, { withSync: false });
      if (health.status === 'incident' || health.status === 'stopped') {
        reasons.push(`venue_health_unready:${health.status}`);
      }
    } catch {
      reasons.push('venue_health_check_failed');
    }

    try {
      await this.adapter.getAccountSnapshot(input.accountRef);
    } catch {
      reasons.push('account_snapshot_unavailable');
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      warnings
    };
  }
}
