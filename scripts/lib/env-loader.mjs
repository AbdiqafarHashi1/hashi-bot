import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const eq = trimmed.indexOf('=');
  if (eq <= 0) {
    return null;
  }

  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFile(envPath) {
  if (!existsSync(envPath)) {
    return false;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] === undefined && parsed.value !== '') {
      process.env[parsed.key] = parsed.value;
    }
  }

  return true;
}

export function loadDotEnvIfPresent(rootDir = process.cwd()) {
  const envPath = path.resolve(rootDir, '.env');
  const envExamplePath = path.resolve(rootDir, '.env.example');

  const loadedDotEnv = loadEnvFile(envPath);
  const loadedExample = loadEnvFile(envExamplePath);

  return { loadedDotEnv, loadedExample, envPath, envExamplePath };
}
