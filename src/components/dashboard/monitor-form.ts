export type MonitorKind = "FULL" | "PRICE";
export type MonitorFrequency = "DAILY" | "WEEKLY";

export interface MonitorDraft {
  kind: MonitorKind;
  frequency: MonitorFrequency;
  durationMonths: number;
}

export interface MonitorCreditEstimate {
  dailyPerMonth: number;
  weeklyPerMonth: number;
}

export interface ExistingMonitorDraftSource {
  kind: MonitorKind;
  frequency: MonitorFrequency;
  status: string;
  expiresAt: string;
}

export type MonitorDraftValidation =
  | { ok: true; value: MonitorDraft }
  | { ok: false; message: string };

export function validateMonitorDraft(
  draft: MonitorDraft,
): MonitorDraftValidation {
  if (!Number.isInteger(draft.durationMonths)) {
    return { ok: false, message: "Choose a whole-month duration." };
  }
  if (draft.durationMonths < 1 || draft.durationMonths > 24) {
    return { ok: false, message: "Choose a duration from 1 to 24 months." };
  }
  if (draft.kind !== "FULL" && draft.kind !== "PRICE") {
    return { ok: false, message: "Choose a monitor type." };
  }
  if (draft.frequency !== "DAILY" && draft.frequency !== "WEEKLY") {
    return { ok: false, message: "Choose daily or weekly monitoring." };
  }
  return { ok: true, value: draft };
}

export function estimateScheduledCredits(
  frequency: MonitorFrequency,
  durationMonths: number,
  creditEstimate: MonitorCreditEstimate,
): number {
  const checksPerMonth = frequency === "DAILY"
    ? creditEstimate.dailyPerMonth
    : creditEstimate.weeklyPerMonth;
  return checksPerMonth * Math.max(1, Math.min(24, durationMonths));
}

export function getInitialMonitorDraft(
  monitors: ExistingMonitorDraftSource[],
  preferredKind: MonitorKind = "FULL",
  now = new Date(),
): MonitorDraft {
  const existing = monitors.find(
    (monitor) =>
      monitor.kind === preferredKind &&
      (monitor.status === "ACTIVE" || monitor.status === "PAUSED"),
  );
  if (!existing) {
    return { kind: preferredKind, frequency: "DAILY", durationMonths: 1 };
  }

  const expiresAt = new Date(existing.expiresAt).getTime();
  const remainingMilliseconds = expiresAt - now.getTime();
  const averageMonthMilliseconds = 30.4375 * 24 * 60 * 60 * 1000;
  const durationMonths = Number.isFinite(remainingMilliseconds)
    ? Math.ceil(remainingMilliseconds / averageMonthMilliseconds)
    : 1;

  return {
    kind: preferredKind,
    frequency: existing.frequency,
    durationMonths: Math.max(1, Math.min(24, durationMonths)),
  };
}
