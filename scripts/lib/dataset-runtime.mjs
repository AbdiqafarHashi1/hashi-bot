import { spawnSync } from 'node:child_process';

function normalizeDatasetId(raw, fallback) {
  if (typeof raw !== 'string') {
    return fallback;
  }

  const value = raw.trim();
  return value.length > 0 ? value : fallback;
}

export function resolveDatasetSelection() {
  const datasetId = normalizeDatasetId(process.env.DATASET_ID, 'dataset-btc-1m');
  const replayDatasetId = normalizeDatasetId(process.env.REPLAY_DATASET_ID, datasetId);
  return { datasetId, replayDatasetId };
}

export function verifyDatasetExists(datasetId, contextLabel = 'dataset') {
  const checkCode = `
import { InMemoryDatasetRepository } from './packages/data/src/dataset-repository.ts';
const datasetId = ${JSON.stringify(datasetId)};
const label = ${JSON.stringify(contextLabel)};
try {
  const repo = new InMemoryDatasetRepository();
  const ds = repo.getDataset(datasetId);
  if (!ds) {
    const ids = repo.listDatasets().map((d) => d.id).join(', ') || '(none)';
    throw new Error('Missing ' + label + ' dataset id: ' + datasetId + '. Available dataset ids: ' + ids);
  }
} catch (error) {
  const details = error instanceof Error ? error.message : String(error);
  console.error('[dataset] Failed to resolve ' + label + ' dataset. ' + details);
  console.error('[dataset] Runtime context: DATASET_ID=' + (process.env.DATASET_ID ?? '(unset)') + ' REPLAY_DATASET_ID=' + (process.env.REPLAY_DATASET_ID ?? '(unset)') + ' DATASET_CSV_PATH=' + (process.env.DATASET_CSV_PATH ?? '(unset)'));
  if (process.env.DATASET_CSV_PATH) {
    console.error('[dataset] Ensure DATASET_ID/REPLAY_DATASET_ID matches the CSV-backed dataset id.');
  } else {
    console.error('[dataset] Tip: set DATASET_CSV_PATH=./datasets/ETHUSDT_15m.csv and DATASET_ID=dataset-ethusdt-15m for local ETH data.');
  }
  process.exit(1);
}
`;

  const result = spawnSync('pnpm', ['tsx', '-e', checkCode], {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
