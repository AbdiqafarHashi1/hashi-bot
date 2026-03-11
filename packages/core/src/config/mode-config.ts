import { z } from 'zod';
import { BOT_MODES } from '../enums/bot-mode.js';
import { EXECUTION_VENUES } from '../enums/execution-venue.js';
import { PROFILE_CODES } from '../enums/profile-code.js';
import { TIMEFRAMES } from '../enums/timeframe.js';

export const modeConfigSchema = z.object({
  mode: z.enum(BOT_MODES),
  executionVenue: z.enum(EXECUTION_VENUES),
  profileCode: z.enum(PROFILE_CODES),
  timeframe: z.enum(TIMEFRAMES),
  dryRun: z.boolean().default(true)
});

export type ModeConfig = z.infer<typeof modeConfigSchema>;

export const parseModeConfig = (input: unknown): ModeConfig => {
  return modeConfigSchema.parse(input);
};
