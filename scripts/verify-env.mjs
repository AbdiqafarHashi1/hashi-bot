#!/usr/bin/env node

const argv = process.argv.slice(2);

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const value = argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireKeys(env, keys, missing, context) {
  for (const key of keys) {
    if (!hasValue(env[key])) {
      missing.push(`${key} (${context})`);
    }
  }
}

function parseWorkerMode(raw) {
  switch (raw) {
    case 'evaluation':
    case 'backtest':
    case 'replay':
    case 'paper':
    case 'live':
      return raw;
    default:
      return undefined;
  }
}

function parseExecutionVenue(raw) {
  switch (raw) {
    case 'mock':
    case 'ccxt':
    case 'ctrader':
      return raw;
    default:
      return undefined;
  }
}

const target = readOption('target', 'all');
const mode = readOption('mode', 'development');
const workerMode = parseWorkerMode(readOption('worker-mode', process.env.WORKER_MODE ?? 'paper'));
const workerVenue = parseExecutionVenue(readOption('venue', process.env.EXECUTION_VENUE ?? 'mock'));

if (!['all', 'web', 'worker'].includes(target)) {
  console.error(`[verify:env] Invalid --target value: ${target}. Expected all|web|worker.`);
  process.exit(1);
}

if (!['development', 'production'].includes(mode)) {
  console.error(`[verify:env] Invalid --mode value: ${mode}. Expected development|production.`);
  process.exit(1);
}

if (target !== 'web' && !workerMode) {
  console.error('[verify:env] Invalid --worker-mode (expected evaluation|backtest|replay|paper|live).');
  process.exit(1);
}

if (target !== 'web' && !workerVenue) {
  console.error('[verify:env] Invalid --venue (expected mock|ccxt|ctrader).');
  process.exit(1);
}

const env = process.env;
const missing = [];

if (target === 'all' || target === 'web') {
  requireKeys(env, ['NEXT_PUBLIC_APP_NAME'], missing, 'web (all modes)');

  if (mode === 'production') {
    requireKeys(env, ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'], missing, 'web (production)');
  }
}

if (target === 'all' || target === 'worker') {
  requireKeys(env, ['DATABASE_URL', 'REDIS_URL'], missing, 'worker (all modes)');

  if (workerMode === 'backtest') {
    requireKeys(env, ['DATASET_ID'], missing, 'worker backtest mode');
  }

  if (workerMode === 'replay') {
    if (!hasValue(env.REPLAY_DATASET_ID) && !hasValue(env.DATASET_ID)) {
      missing.push('REPLAY_DATASET_ID or DATASET_ID (worker replay mode)');
    }
  }

  if (workerMode === 'paper' || workerMode === 'live') {
    requireKeys(env, ['LIVE_ACCOUNT_REF'], missing, 'worker paper/live mode');
    if (!hasValue(env.EXECUTION_VENUE)) {
      missing.push('EXECUTION_VENUE (worker paper/live mode)');
    }
  }

  if (workerMode === 'live') {
    requireKeys(env, ['LIVE_ENGINE_ENABLED'], missing, 'worker live mode');
    if (env.LIVE_ENGINE_ENABLED !== 'true') {
      missing.push('LIVE_ENGINE_ENABLED=true (worker live mode)');
    }

    if (workerVenue === 'mock') {
      missing.push('EXECUTION_VENUE must not be mock (worker live mode)');
    }
  }

  if (workerVenue === 'ccxt' && (workerMode === 'paper' || workerMode === 'live')) {
    requireKeys(env, ['CCXT_API_KEY', 'CCXT_API_SECRET'], missing, 'worker ccxt venue');
  }

  if (workerVenue === 'ctrader' && (workerMode === 'paper' || workerMode === 'live')) {
    requireKeys(env, ['CTRADER_ACCESS_TOKEN', 'CTRADER_ACCOUNT_ID', 'CTRADER_BASE_URL'], missing, 'worker ctrader venue');
  }

  if (mode === 'production') {
    requireKeys(env, ['SUPABASE_SERVICE_ROLE_KEY'], missing, 'worker production storage operations');
  }
}

if (missing.length > 0) {
  console.error('[verify:env] Missing or invalid environment configuration:');
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(
  `[verify:env] OK target=${target} mode=${mode}${workerMode ? ` workerMode=${workerMode}` : ''}${workerVenue ? ` venue=${workerVenue}` : ''}`
);
