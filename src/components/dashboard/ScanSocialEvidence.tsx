import { ExternalLink, Megaphone, ShieldAlert } from "lucide-react";

import type { ScanSocialDto } from "@/components/dashboard/types";
import { buildSocialEvidenceView } from "@/components/dashboard/view-model";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ScanSocialEvidenceProps {
  social: ScanSocialDto;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date);
}

export function ScanSocialEvidence({ social }: ScanSocialEvidenceProps) {
  const view = buildSocialEvidenceView(social);
  if (social.status === "NOT_ANALYZED") {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-4 sm:p-5">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{view.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {view.detail}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Production evidence</p>
            <CardTitle className="mt-1 font-display text-xl italic">Social media evidence</CardTitle>
          </div>
          {formatDate(social.asOf) && <span className="text-xs text-muted-foreground">As of {formatDate(social.asOf)}</span>}
        </div>
      </CardHeader>
      <CardContent>
        {social.evidence.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
            <p className="text-sm font-semibold">Analyzed — no matching promotional evidence found</p>
            <p className="mt-1 text-xs text-muted-foreground">This is not proof that promotion did not occur.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {social.evidence.map((item) => {
              const flags = item.redFlags.filter((flag): flag is string => typeof flag === "string");
              return (
                <article key={item.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={item.isPromotional ? "high" : "secondary"}>{item.platform}</Badge>
                        <span className="text-xs font-semibold text-muted-foreground">Promotion score {item.promotionScore}</span>
                      </div>
                      <h4 className="mt-2 text-sm font-semibold leading-relaxed">{item.title || "Social mention"}</h4>
                    </div>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        Source <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                  {flags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Social red flags">
                      {flags.map((flag) => (
                        <span key={flag} className="inline-flex items-center gap-1 rounded-full bg-destructive/8 px-2.5 py-1 text-xs text-destructive">
                          <ShieldAlert className="h-3 w-3" aria-hidden="true" />{flag}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
