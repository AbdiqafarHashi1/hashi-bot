export const EXECUTION_VENUES = ['mock', 'ccxt', 'ctrader'] as const;

export type ExecutionVenue = (typeof EXECUTION_VENUES)[number];

const EXECUTION_VENUE_SET = new Set<string>(EXECUTION_VENUES);

export function isExecutionVenue(value: string | undefined): value is ExecutionVenue {
  return value !== undefined && EXECUTION_VENUE_SET.has(value);
}

export function parseExecutionVenue(value: string | undefined, fallback: ExecutionVenue = 'mock'): ExecutionVenue {
  return isExecutionVenue(value) ? value : fallback;
}
