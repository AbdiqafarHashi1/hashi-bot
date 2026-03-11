import type { ProfileCode } from '@hashi-bot/core';

export type GovernanceConstraintCode =
  | 'MAX_OPEN_POSITIONS'
  | 'MAX_OPEN_POSITIONS_PER_SYMBOL'
  | 'MAX_DAILY_LOSS'
  | 'MAX_GLOBAL_DRAWDOWN'
  | 'MAX_CONSECUTIVE_LOSSES'
  | 'MAX_DAILY_TRADES'
  | 'SESSION_RESTRICTION'
  | 'SYMBOL_RESTRICTION'
  | 'CORRELATION_LIMIT'
  | 'MIN_SIGNAL_SCORE'
  | 'COOLDOWN_ACTIVE'
  | 'CUSTOM';

export interface GovernanceDecision {
  profileCode: ProfileCode;
  allowed: boolean;
  decisionAtTs: number;
  reason?: string;
  blockedBy?: GovernanceConstraintCode;
  notes?: string[];
}
