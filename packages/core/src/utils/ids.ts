import type { DatasetId, RunId } from '../types/common.js';

const buildId = (prefix: string): string => {
  const segment = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${segment}`;
};

export const createRunId = (): RunId => buildId('run') as RunId;
export const createDatasetId = (): DatasetId => buildId('dataset') as DatasetId;
