import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { buildFreshnessView } from "@/components/dashboard/view-model";
import { buildPublicationTimeline, type PublicationTimelineInput } from "@/components/dashboard/publication-timeline";
import { cn } from "@/lib/utils";

type FreshnessState = "LOADING" | "UNAVAILABLE" | "STALE" | "FRESH";

interface FreshnessNoteProps extends PublicationTimelineInput {
  state: FreshnessState;
  asOf?: string | null;
  publishedAt?: string | null;
  notice?: string;
  className?: string;
  compact?: boolean;
}

export function FreshnessNote({
  state,
  asOf,
  publishedAt,
  executedAt,
  socialPublication,
  publicationQuality,
  notice,
  className,
  compact = false,
}: FreshnessNoteProps) {
  const isStale = state === "STALE";
  const needsAttention = isStale || publicationQuality === "DEGRADED";
  const isUnavailable = state === "UNAVAILABLE";
  const isLoading = state === "LOADING";
  const Icon = isLoading
    ? Loader2
    : isUnavailable || needsAttention
      ? AlertCircle
      : CheckCircle2;
  const view = buildFreshnessView({
    state,
    asOf: asOf ?? null,
    publishedAt: publishedAt ?? null,
    notice,
  });
  const timeline = buildPublicationTimeline({ asOf, executedAt, publishedAt, socialPublication, publicationQuality });

  return (
    <div
      className={cn(
        compact ? "flex flex-col gap-1 px-0 py-0" : "flex flex-col gap-2 rounded-2xl border px-4 py-3",
        !compact && (isUnavailable
          ? "border-destructive/20 bg-destructive/5"
          : needsAttention
            ? "border-amber-500/25 bg-amber-500/5"
            : "border-primary/15 bg-primary/5"),
        className,
      )}
      role={isUnavailable ? "alert" : "status"}
      aria-live="polite"
    >
      <div className={cn("flex min-w-0 items-start", compact ? "gap-2" : "gap-3")}>
        <Icon
          className={cn(
            compact ? "mt-0.5 h-3.5 w-3.5 shrink-0" : "mt-0.5 h-4 w-4 shrink-0",
            isLoading && "animate-spin motion-reduce:animate-none",
            isUnavailable
              ? "text-destructive"
              : needsAttention
                ? "text-amber-600 dark:text-amber-400"
                : "text-primary",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className={cn(compact ? "text-xs font-medium" : "text-sm font-semibold")}>{view.title}</p>
          <p className={cn("mt-0.5 leading-relaxed text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            {view.notice}
          </p>
        </div>
      </div>
      {!compact && !isLoading && !isUnavailable && (
        <dl className="grid min-w-0 gap-x-6 gap-y-2 pl-7 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {timeline.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
