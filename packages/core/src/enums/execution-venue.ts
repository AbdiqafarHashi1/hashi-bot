export const EXECUTION_VENUES = ['mock', 'ccxt', 'ctrader'] as const;

export type ExecutionVenue = (typeof EXECUTION_VENUES)[number];
