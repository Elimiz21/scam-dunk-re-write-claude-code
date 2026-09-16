export interface PublicationTimelineInput {
  asOf?: string | null;
  executedAt?: string | null;
  publishedAt?: string | null;
  socialPublication?: {
    status: "COMPLETED" | "PARTIAL";
    scanDate: string;
    updatedAt: string;
  } | null;
}

function format(value: string | null | undefined, includeTime: boolean): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: "UTC",
  }).format(new Date(value)) + (includeTime ? " UTC" : "");
}

export function buildPublicationTimeline(input: PublicationTimelineInput): { label: string; value: string }[] {
  const items = [
    { label: "Market data", value: format(input.asOf, false) },
    { label: "Scan ran", value: format(input.executedAt, true) },
    { label: "Published", value: format(input.publishedAt, true) },
  ];
  if (input.socialPublication) {
    items.push(
      { label: input.socialPublication.status === "PARTIAL" ? "Social scan (partial)" : "Social scan", value: format(input.socialPublication.scanDate, true) },
      { label: "Social updated", value: format(input.socialPublication.updatedAt, true) },
    );
  } else {
    items.push({ label: "Social scan", value: "Not available" });
  }
  return items;
}
