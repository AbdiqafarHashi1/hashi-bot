export const MARKET_TYPES = ['crypto', 'forex', 'metal', 'index'] as const;

export type MarketType = (typeof MARKET_TYPES)[number];
