#!/usr/bin/env node

const steps = [
  '1) pnpm install',
  '2) cp .env.example .env',
  '3) Fill .env values for local services (Supabase/Redis/exchange keys).',
  '4) pnpm verify:env',
  '5) pnpm dev'
];

console.log('hashi-bot local bootstrap checklist:');
for (const step of steps) {
  console.log(step);
}
