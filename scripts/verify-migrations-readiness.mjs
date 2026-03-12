#!/usr/bin/env node

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve('supabase', 'migrations');

if (!existsSync(migrationsDir)) {
  console.log('[verify:migrations] ⚠️ supabase/migrations directory not found in this repo snapshot (migration readiness is N/A).');
  process.exit(0);
}

const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'));

if (migrationFiles.length === 0) {
  console.error('[verify:migrations] No SQL migration files found under supabase/migrations.');
  process.exit(1);
}

console.log(`[verify:migrations] OK (${migrationFiles.length} migration file(s) detected).`);
