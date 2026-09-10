import { CustomerRiskLabel, Plan, RiskLevel } from "./types";

export interface PlanEntitlements {
  plan: Plan | "PRO_MAX";
  displayName: "Free" | "Pro" | "Pro Max";
  manualScanCredits: number;
  fullMonitorSlots: number;
  priceMonitorSlots: number;
  /** null means the saved watchlist has no V1 hard cap. */
  savedWatchlistLimit: null;
}

export interface MonitorCreditEstimate {
  dailyPerMonth: number;
  weeklyPerMonth: number;
}

export const MONITOR_CREDIT_ESTIMATE: MonitorCreditEstimate = {
  dailyPerMonth: 22,
  weeklyPerMonth: 4,
};

export function getMonitorCreditEstimate(): MonitorCreditEstimate {
  return { ...MONITOR_CREDIT_ESTIMATE };
}

const PLAN_ENTITLEMENTS: Record<Plan | "PRO_MAX", PlanEntitlements> = {
  FREE: {
    plan: "FREE",
    displayName: "Free",
    manualScanCredits: 5,
    fullMonitorSlots: 1,
    priceMonitorSlots: 0,
    savedWatchlistLimit: null,
  },
  PAID: {
    plan: "PAID",
    displayName: "Pro",
    manualScanCredits: 50,
    fullMonitorSlots: 2,
    priceMonitorSlots: 0,
    savedWatchlistLimit: null,
  },
  PRO_MAX: {
    plan: "PRO_MAX",
    displayName: "Pro Max",
    manualScanCredits: 200,
    fullMonitorSlots: 10,
    priceMonitorSlots: 0,
    savedWatchlistLimit: null,
  },
};

export function getPlanEntitlements(plan: Plan | string): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan as Plan | "PRO_MAX"] ?? PLAN_ENTITLEMENTS.FREE;
}

export function getMonitorSlotKey(
  _kind: "FULL" | "PRICE",
): "fullMonitorSlots" | "priceMonitorSlots" {
  return "fullMonitorSlots";
}

/**
 * The production scoring engine retains its four internal states. Customer
 * surfaces intentionally expose only the three approved risk labels.
 */
export function getRiskLabel(riskLevel: RiskLevel): CustomerRiskLabel {
  switch (riskLevel) {
    case "HIGH":
      return "High risk";
    case "LOW":
      return "Low risk";
    case "MEDIUM":
    case "INSUFFICIENT":
    default:
      return "Caution";
  }
}
