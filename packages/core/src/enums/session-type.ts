export const SESSION_TYPES = ['always_open', 'forex_session'] as const;

export type SessionType = (typeof SESSION_TYPES)[number];
