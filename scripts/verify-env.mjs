#!/usr/bin/env node

const required = [
  'NEXT_PUBLIC_APP_NAME',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'LIVE_ENGINE_ENABLED',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'CCXT_API_KEY',
  'CCXT_API_SECRET',
  'CCXT_API_PASSWORD',
  'CTRADER_CLIENT_ID',
  'CTRADER_CLIENT_SECRET',
  'CTRADER_ACCESS_TOKEN',
  'CTRADER_ACCOUNT_ID'
];

const missing = required.filter((key) => !process.env[key] || process.env[key]?.trim() === '');

if (missing.length) {
  console.error('Missing required environment variables:');
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

console.log('Environment variable verification passed.');
