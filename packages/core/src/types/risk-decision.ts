export interface RiskDecision {
  isAllowed: boolean;
  reason?: string;
  riskPct: number;
  qty: number;
  portfolioHeatAfter: number;
}
