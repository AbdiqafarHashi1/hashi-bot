import type { IsoTimestamp } from '@hashi-bot/core';
import type { VenueLiveState } from '@hashi-bot/execution';

export class LiveVenueSyncService {
  constructor(private readonly venue: VenueLiveState['source'] = 'mock') {}

  async syncNow(now: Date = new Date()): Promise<VenueLiveState> {
    const fetchedAt = now.toISOString() as IsoTimestamp;

    // Phase-7 conservative foundation: explicit sync surface.
    // Real venue sync adapters (ccxt/ctrader) should replace these stubs in later prompts.
    return {
      fetchedAt,
      openOrderIds: [],
      openPositionIds: [],
      syncHealthy: true,
      source: this.venue
    };
  }
}
