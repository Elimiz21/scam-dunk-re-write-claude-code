export type AcquisitionInput = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
};

export type AcquisitionRow = {
  source: string;
  medium: string;
  campaign: string | null;
  signUps: number;
};

/** Groups first-party first-touch fields for safe aggregate reporting. */
export function buildAcquisitionBreakdown(inputs: AcquisitionInput[]): AcquisitionRow[] {
  const grouped = new Map<string, AcquisitionRow>();
  for (const input of inputs) {
    const source = input.source ?? "Unattributed";
    const medium = input.medium ?? "—";
    const campaign = input.campaign ?? null;
    const key = `${source}\u0000${medium}\u0000${campaign ?? ""}`;
    const existing = grouped.get(key);
    if (existing) existing.signUps += 1;
    else grouped.set(key, { source, medium, campaign, signUps: 1 });
  }
  return Array.from(grouped.values()).sort((a, b) => b.signUps - a.signUps || a.source.localeCompare(b.source));
}
