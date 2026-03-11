import { z } from 'zod';

export const liveEngineEnabledSchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

export const sharedEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('hashi-bot'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  LIVE_ENGINE_ENABLED: liveEngineEnabledSchema.default(false),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  CCXT_API_KEY: z.string().min(1).optional(),
  CCXT_API_SECRET: z.string().min(1).optional(),
  CCXT_API_PASSWORD: z.string().min(1).optional(),
  CTRADER_CLIENT_ID: z.string().min(1).optional(),
  CTRADER_CLIENT_SECRET: z.string().min(1).optional(),
  CTRADER_ACCESS_TOKEN: z.string().min(1).optional(),
  CTRADER_ACCOUNT_ID: z.string().min(1).optional()
});

export type SharedEnv = z.infer<typeof sharedEnvSchema>;

export const parseSharedEnv = (input: Record<string, unknown>): SharedEnv => {
  return sharedEnvSchema.parse(input);
};
