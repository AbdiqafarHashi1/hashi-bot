import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { PersistedLiveState } from '@hashi-bot/execution';

export class LiveStateStoreService {
  constructor(private readonly filePath: string = '.hashi/live-state.json') {}

  async load(): Promise<PersistedLiveState | undefined> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as PersistedLiveState;
    } catch {
      return undefined;
    }
  }

  async save(state: PersistedLiveState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
