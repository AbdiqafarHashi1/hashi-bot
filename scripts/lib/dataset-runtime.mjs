import { spawnSync } from 'node:child_process';

export function resolveDatasetSelection() {
  const datasetId = process.env.DATASET_ID ?? 'dataset-btc-1m';
  const replayDatasetId = process.env.REPLAY_DATASET_ID ?? datasetId;
  return { datasetId, replayDatasetId };
}

export function verifyDatasetExists(datasetId, contextLabel = 'dataset') {
  const checkCode = `
import { InMemoryDatasetRepository } from './packages/data/src/dataset-repository.ts';
const datasetId = ${JSON.stringify(datasetId)};
const label = ${JSON.stringify(contextLabel)};
const repo = new InMemoryDatasetRepository();
const ds = repo.getDataset(datasetId);
if (!ds) {
  const ids = repo.listDatasets().map((d) => d.id).join(', ') || '(none)';
  console.error('[dataset] Missing ' + label + ' dataset id: ' + datasetId);
  console.error('[dataset] Available dataset ids: ' + ids);
  if (process.env.DATASET_CSV_PATH) {
    console.error('[dataset] DATASET_CSV_PATH is set to: ' + process.env.DATASET_CSV_PATH);
    console.error('[dataset] Ensure DATASET_ID matches the dataset id mapped from that CSV.');
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
