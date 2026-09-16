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
}

export function FreshnessNote({
  state,
  asOf,
  publishedAt,
  executedAt,
  socialPublication,
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
  const timeline = buildPublicationTimeline({ asOf, executedAt, publishedAt, socialPublication });

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border px-4 py-3 ",
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
      {!isLoading && !isUnavailable && (
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
