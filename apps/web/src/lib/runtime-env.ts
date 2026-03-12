import { isExecutionVenue } from '@hashi-bot/core';

function env(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function required(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function parseNodeEnv(raw: string | undefined): 'development' | 'production' | 'test' {
  if (raw === 'production' || raw === 'test') {
    return raw;
  }
  return 'development';
}

export function validateWebRuntimeEnvironment(): void {
  const vars = env();
  const nodeEnv = parseNodeEnv(vars.NODE_ENV);
  const failures: string[] = [];
  const warnings: string[] = [];

  if (!required(vars.NEXT_PUBLIC_APP_NAME)) {
    failures.push('NEXT_PUBLIC_APP_NAME is required for web runtime identity.');
  }

  if (nodeEnv === 'production') {
    if (!required(vars.NEXT_PUBLIC_SUPABASE_URL) || !required(vars.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
      failures.push('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required in production web deployments.');
    }
  }

  if (required(vars.EXECUTION_VENUE) && !isExecutionVenue(vars.EXECUTION_VENUE)) {
    failures.push(`Invalid EXECUTION_VENUE: ${vars.EXECUTION_VENUE}. Expected mock|ccxt|ctrader.`);
  }

  if (vars.WORKER_MODE === 'live' && vars.EXECUTION_VENUE === 'mock') {
    warnings.push('WORKER_MODE=live with EXECUTION_VENUE=mock is not deploy-safe; use non-mock venue for live production.');
  }

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.warn(`[web:env] ${warning}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`[web:env] ${failures.join(' ')}`);
  }
}
