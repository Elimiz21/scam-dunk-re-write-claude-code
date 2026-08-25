import { AlertCircle, CheckCircle2, Clock3, Loader2 } from "lucide-react";

import { buildFreshnessView } from "@/components/dashboard/view-model";
import { cn } from "@/lib/utils";

type FreshnessState = "LOADING" | "UNAVAILABLE" | "STALE" | "FRESH";

interface FreshnessNoteProps {
  state: FreshnessState;
  asOf?: string | null;
  publishedAt?: string | null;
  notice?: string;
  className?: string;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

export function FreshnessNote({
  state,
  asOf,
  publishedAt,
  notice,
  className,
}: FreshnessNoteProps) {
  const isStale = state === "STALE";
  const isUnavailable = state === "UNAVAILABLE";
  const isLoading = state === "LOADING";
  const Icon = isLoading
    ? Loader2
    : isUnavailable || isStale
      ? AlertCircle
      : CheckCircle2;
  const view = buildFreshnessView({
    state,
    asOf: asOf ?? null,
    publishedAt: publishedAt ?? null,
    notice,
  });
  const asOfLabel = formatDate(asOf);
  const publishedLabel = formatDate(publishedAt);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        isUnavailable
          ? "border-destructive/20 bg-destructive/5"
          : isStale
            ? "border-amber-500/25 bg-amber-500/5"
            : "border-primary/15 bg-primary/5",
        className,
      )}
      role={isUnavailable ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            isLoading && "animate-spin motion-reduce:animate-none",
            isUnavailable
              ? "text-destructive"
              : isStale
                ? "text-amber-600 dark:text-amber-400"
                : "text-primary",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{view.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {view.notice}
          </p>
        </div>
      </div>
      {(asOfLabel || publishedLabel) && (
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {asOfLabel ? `Market data ${asOfLabel}` : ""}
            {asOfLabel && publishedLabel ? " · " : ""}
            {publishedLabel ? `Published ${publishedLabel}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
