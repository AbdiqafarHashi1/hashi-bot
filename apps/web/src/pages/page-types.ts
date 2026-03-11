import type { BotMode, ExecutionVenue, ProfileCode } from '@hashi-bot/core';

import type { PageSection } from '../components/foundation-sections.js';

export interface FoundationPage<TSections extends readonly PageSection[] = readonly PageSection[]> {
  path: string;
  title: string;
  subtitle: string;
  readiness: 'foundation' | 'phase2_ready' | 'phase4_ready' | 'phase5_ready';
  sections: TSections;
}

export interface PlatformSummary {
  supportedModes: BotMode[];
  executionVenues: ExecutionVenue[];
  profiles: ProfileCode[];
}
