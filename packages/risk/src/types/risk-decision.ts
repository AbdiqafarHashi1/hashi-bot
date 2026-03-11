import type { GovernanceDecision } from './governance-decision.js';
import type { PortfolioState } from './portfolio-state.js';
import type { PositionPlan } from './position-plan.js';

export type RiskDecisionStatus = 'allowed' | 'rejected' | 'cancelled';

export interface RiskDecision {
  status: RiskDecisionStatus;
  reason?: string;
  positionPlan?: PositionPlan;
  governance: GovernanceDecision;
  portfolioBefore: PortfolioState;
  portfolioAfter?: PortfolioState;
}
