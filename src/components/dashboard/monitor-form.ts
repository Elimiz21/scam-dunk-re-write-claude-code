export type MonitorKind = "FULL" | "PRICE";
export type MonitorFrequency = "DAILY" | "WEEKLY";

export interface MonitorDraft {
  kind: MonitorKind;
  frequency: MonitorFrequency;
  durationMonths: number;
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
): number {
  const checksPerMonth = frequency === "DAILY" ? 22 : 4;
  return checksPerMonth * Math.max(1, Math.min(24, durationMonths));
}
