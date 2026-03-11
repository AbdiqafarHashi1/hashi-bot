export const TRADE_LIFECYCLE_STATES = [
  'idle',
  'pending_entry',
  'open',
  'tp1_hit',
  'breakeven_armed',
  'runner_active',
  'closed',
  'cancelled',
  'rejected'
] as const;

export type TradeLifecycleState = (typeof TRADE_LIFECYCLE_STATES)[number];

export type LifecycleTransitionReason =
  | 'created'
  | 'entry_filled'
  | 'tp1_partial_filled'
  | 'breakeven_stop_armed'
  | 'runner_activated'
  | 'tp2_filled'
  | 'stop_filled'
  | 'time_stop'
  | 'force_exit'
  | 'cancelled'
  | 'rejected'
  | 'no_change';

export interface LifecycleTransition {
  from: TradeLifecycleState;
  to: TradeLifecycleState;
  reason: LifecycleTransitionReason;
  ts: number;
  note?: string;
}
