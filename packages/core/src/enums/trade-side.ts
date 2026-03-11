export const TRADE_SIDES = ['long', 'short'] as const;

export type TradeSide = (typeof TRADE_SIDES)[number];
