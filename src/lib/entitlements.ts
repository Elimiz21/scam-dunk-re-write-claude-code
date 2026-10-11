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

export type FreeScanAllowancePeriod = "MONTHLY" | "LIFETIME";

export interface FreeScanAllowanceInput {
  period?: string | null;
  monthlyCredits?: number | null;
  lifetimeCredits?: number | null;
}

export interface FreeScanAllowance {
  period: FreeScanAllowancePeriod;
  credits: number;
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
    manualScanCredits: 1,
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

function positiveInteger(value: number | null | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

/**
 * Free scan promises are persisted per account. Legacy accounts that were
 * promised recurring scans retain that monthly policy; the one-scan offer is
 * a lifetime allowance and must never renew at the start of another month.
 */
export function getFreeScanAllowance(
  plan: Plan | string,
  input: FreeScanAllowanceInput = {},
): FreeScanAllowance {
  const entitlements = getPlanEntitlements(plan);
  if (entitlements.plan !== "FREE") {
    return { period: "MONTHLY", credits: entitlements.manualScanCredits };
  }

  // A missing period occurs only while reading an older record during a
  // migration rollout. A stored allowance above one is unambiguously the
  // grandfathered five-per-month promise, so keep it monthly as well.
  if (input.period === "MONTHLY" || (
    input.period == null && positiveInteger(input.monthlyCredits, 1) > 1
  )) {
    return {
      period: "MONTHLY",
      credits: positiveInteger(input.monthlyCredits, entitlements.manualScanCredits),
    };
  }

  return {
    period: "LIFETIME",
    credits: positiveInteger(input.lifetimeCredits, entitlements.manualScanCredits),
  };
}

/**
 * Legacy callers that still need a recurring limit use this helper. New free
 * accounts use getFreeScanAllowance instead, so their single credit does not
 * reset in a later month. Paid-plan allowances remain recurring and plan-based.
 */
export function getMonthlyScanCreditLimit(
  plan: Plan | string,
  freeMonthlyScanCredits?: number | null,
): number {
  return getFreeScanAllowance(plan, {
    period: "MONTHLY",
    monthlyCredits: freeMonthlyScanCredits,
  }).credits;
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
