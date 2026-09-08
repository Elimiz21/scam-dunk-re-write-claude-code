"use client";

import { useState } from "react";
import { Eye, History, Search } from "lucide-react";

import type {
  HistoryOrder,
  RecentScanDto,
} from "@/components/dashboard/types";
import { buildHistoryView, filterRecentScans } from "@/components/dashboard/view-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RecentScansTableProps {
  items: RecentScanDto[];
  order: HistoryOrder;
  onOrderChange: (order: HistoryOrder) => void;
  onOpenDetail: (scan: RecentScanDto) => void;
}

function riskVariant(label: RecentScanDto["riskLabel"]) {
  if (label === "High risk") return "high" as const;
  if (label === "Caution") return "medium" as const;
  return "low" as const;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date);
}

function sourceLabel(source: RecentScanDto["source"]): string {
  if (source === "AUTOMATIC_FULL") return "Full monitor";
  if (source === "AUTOMATIC_PRICE") return "Price monitor";
  return "Manual scan";
}

export function RecentScansTable({
  items,
  order,
  onOrderChange,
  onOpenDetail,
}: RecentScansTableProps) {
  const [query, setQuery] = useState("");
  const filteredItems = filterRecentScans(items, query);
  const view = buildHistoryView(filteredItems);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-end">
        <div>
          <Label htmlFor="scan-search">Search recent scans</Label>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="scan-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by ticker"
              className="min-h-11 pl-9"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="scan-order">Order by</Label>
          <select
            id="scan-order"
            aria-label="Order by"
            value={order}
            onChange={(event) => onOrderChange(event.target.value as HistoryOrder)}
            className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {view.orderOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredItems.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <History className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 font-semibold">{query.trim() ? "No scans match that search" : view.title}</p>
              <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                {query.trim() ? "Try another ticker." : "Completed manual and scheduled checks will appear here."}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="bg-secondary/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-[18%] px-5 py-3 font-semibold">Stock</th>
                      <th className="w-[20%] px-5 py-3 font-semibold">Risk</th>
                      <th className="w-[18%] px-5 py-3 font-semibold">Source</th>
                      <th className="w-[28%] px-5 py-3 font-semibold">Checked</th>
                      <th className="w-[16%] px-5 py-3 text-right font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((scan) => (
                      <tr key={scan.id} className="border-t border-border/60">
                        <td className="px-5 py-4 font-semibold">{scan.ticker}</td>
                        <td className="px-5 py-4"><Badge variant={riskVariant(scan.riskLabel)}>{scan.riskLabel}</Badge></td>
                        <td className="px-5 py-4 text-muted-foreground">{sourceLabel(scan.source)}</td>
                        <td className="px-5 py-4 text-muted-foreground">{formatDate(scan.scannedAt)}</td>
                        <td className="px-5 py-4 text-right">
                          <Button variant="outline" size="sm" className="min-h-10" onClick={() => onOpenDetail(scan)}>
                            <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-border/60 md:hidden">
                {filteredItems.map((scan) => (
                  <article key={scan.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{scan.ticker}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{sourceLabel(scan.source)} · {formatDate(scan.scannedAt)}</p>
                      </div>
                      <Badge variant={riskVariant(scan.riskLabel)}>{scan.riskLabel}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{scan.signalCount} signals · Score {scan.score}</span>
                      <span>{scan.socialEvidenceAvailable ? "Social evidence" : "No social evidence shown"}</span>
                    </div>
                    <Button variant="outline" className="min-h-11 w-full" onClick={() => onOpenDetail(scan)}>
                      View scan details
                    </Button>
                  </article>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
