import { createWorkerContainer, type WorkerContainer } from './lib/container.js';

export interface WorkerBootstrapResult {
  container: WorkerContainer;
}

export function bootstrapWorker(): WorkerBootstrapResult {
  const container = createWorkerContainer();
  console.log('[worker] bootstrap complete (strategy batch evaluation path ready)');
  return { container };
}
