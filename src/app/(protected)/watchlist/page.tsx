"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";

import {
  MonitorEditor,
  type MonitorSaveRequest,
} from "@/components/dashboard/MonitorEditor";
import type {
  ApiErrorShape,
  MonitorCreditEstimate,
  MonitorListPayload,
  MonitorSlots,
  WatchlistEntryDto,
  WatchlistPayload,
} from "@/components/dashboard/types";
import { readApiError } from "@/components/dashboard/types";
import { WatchlistTable } from "@/components/dashboard/WatchlistTable";
import { PageLayout } from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const emptySlots: MonitorSlots = {
  full: { used: 0, limit: 0 },
  price: { used: 0, limit: 0 },
};

const emptyCreditEstimate: MonitorCreditEstimate = {
  dailyPerMonth: 0,
  weeklyPerMonth: 0,
};

export default function WatchlistPage() {
  const [entries, setEntries] = useState<WatchlistEntryDto[]>([]);
  const [slots, setSlots] = useState<MonitorSlots>(emptySlots);
  const [creditEstimate, setCreditEstimate] = useState<MonitorCreditEstimate>(emptyCreditEstimate);
  const [ticker, setTicker] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pageError, setPageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ApiErrorShape | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingTicker, setPendingTicker] = useState<string | null>(null);
  const [selectedMonitor, setSelectedMonitor] = useState<WatchlistEntryDto | null>(null);
  const [monitorError, setMonitorError] = useState<ApiErrorShape | null>(null);
  const [isSavingMonitor, setIsSavingMonitor] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus("loading");
    setPageError(null);
    try {
      const [watchlistResponse, monitorsResponse] = await Promise.all([
        fetch("/api/watchlist", { cache: "no-store", signal }),
        fetch("/api/monitors", { cache: "no-store", signal }),
      ]);
      const [watchlistBody, monitorsBody] = await Promise.all([
        watchlistResponse.json() as Promise<unknown>,
        monitorsResponse.json() as Promise<unknown>,
      ]);
      if (!watchlistResponse.ok) {
        throw new Error(
          readApiError(watchlistBody, "Your watchlist is temporarily unavailable.").message,
        );
      }
      if (!monitorsResponse.ok) {
        throw new Error(
          readApiError(monitorsBody, "Monitoring is temporarily unavailable.").message,
        );
      }
      setEntries((watchlistBody as WatchlistPayload).entries);
      setSlots((monitorsBody as MonitorListPayload).slots);
      setCreditEstimate((monitorsBody as MonitorListPayload).creditEstimate);
      setStatus("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("error");
      setPageError(
        error instanceof Error
          ? error.message
          : "Your watchlist is temporarily unavailable.",
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function addTicker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = ticker.trim().toUpperCase();
    setFeedback(null);
    setSuccess(null);
    if (!normalized) {
      setFeedback({
        code: "UNSUPPORTED_TICKER",
        message: "Enter a supported US-listed common stock ticker.",
      });
      return;
    }
    setPendingTicker(normalized);
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: normalized }),
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        setFeedback(readApiError(body, "The ticker could not be saved."));
        return;
      }
      setTicker("");
      setSuccess(`${normalized} added to your watchlist. No scan credit was used.`);
      await load();
      window.dispatchEvent(new Event("scamdunk:watchlist-updated"));
    } catch {
      setFeedback({ code: "WATCHLIST_UNAVAILABLE", message: "The ticker could not be saved." });
    } finally {
      setPendingTicker(null);
    }
  }

  async function removeTicker(entry: WatchlistEntryDto) {
    setFeedback(null);
    setSuccess(null);
    setPendingTicker(entry.ticker);
    try {
      const response = await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: entry.ticker }),
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        setFeedback(readApiError(body, "The ticker could not be removed."));
        return;
      }
      if (selectedMonitor?.id === entry.id) setSelectedMonitor(null);
      setSuccess(`${entry.ticker} removed. No scan credit was used.`);
      await load();
      window.dispatchEvent(new Event("scamdunk:watchlist-updated"));
    } catch {
      setFeedback({ code: "WATCHLIST_UNAVAILABLE", message: "The ticker could not be removed." });
    } finally {
      setPendingTicker(null);
    }
  }

  async function saveMonitor(request: MonitorSaveRequest) {
    setIsSavingMonitor(true);
    setMonitorError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/monitors", {
        method: request.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          request.mode === "create"
            ? {
                watchlistEntryId: request.watchlistEntryId,
                kind: request.kind,
                frequency: request.frequency,
                durationMonths: request.durationMonths,
              }
            : {
                id: request.id,
                frequency: request.frequency,
                durationMonths: request.durationMonths,
              },
        ),
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        setMonitorError(readApiError(body, "The monitor could not be saved."));
        return;
      }
      setSuccess(
        request.mode === "create"
          ? "Monitor created. No credit was used to save it."
          : "Monitor updated. No credit was used to save it.",
      );
      setSelectedMonitor(null);
      await load();
    } catch {
      setMonitorError({ code: "MONITORS_UNAVAILABLE", message: "The monitor could not be saved." });
    } finally {
      setIsSavingMonitor(false);
    }
  }

  return (
    <PageLayout dashboardShell>
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-[1200px] space-y-6">
          <header>
            <h1 className="font-editorial text-3xl sm:text-4xl">Your watchlist</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Choose how often each monitored ticker receives the full ScamDunk risk analysis and for how long. Monitoring runs after the trading day closes — not live.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Active monitoring: <strong className="text-foreground">{slots.full.used} of {slots.full.limit} monitors</strong>.
            </p>
          </header>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <form onSubmit={addTicker} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label htmlFor="watchlist-ticker">Stock ticker</Label>
                  <Input
                    id="watchlist-ticker"
                    value={ticker}
                    onChange={(event) => setTicker(event.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={16}
                    placeholder="Enter ticker"
                    className="mt-2 min-h-11 uppercase"
                  />
                </div>
                <Button type="submit" variant="brand" className="min-h-11 gap-2" disabled={pendingTicker !== null}>
                  {pendingTicker ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                  Add to watchlist
                </Button>
              </form>
            </CardContent>
          </Card>

          {success && (
            <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm" role="status" aria-live="polite">
              {success}
            </div>
          )}

          {status === "loading" ? (
            <div className="flex min-h-40 items-center justify-center rounded-2xl border border-border bg-card" aria-live="polite">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Loading watchlist</span>
            </div>
          ) : status === "error" ? (
            <Card role="alert">
              <CardContent className="flex flex-col items-center px-5 py-10 text-center">
                <p className="font-semibold">Watchlist unavailable</p>
                <p className="mt-2 text-sm text-muted-foreground">{pageError}</p>
                <Button className="mt-4 min-h-11 gap-2" variant="outline" onClick={() => void load()}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />Try again
                </Button>
              </CardContent>
            </Card>
          ) : (
            <WatchlistTable
              entries={entries}
              pendingTicker={pendingTicker}
              feedback={feedback}
              onRemove={(entry) => void removeTicker(entry)}
              onEditMonitor={(entry) => {
                setMonitorError(null);
                setSelectedMonitor((current) =>
                  current?.id === entry.id
                    ? null
                    : entry,
                );
              }}
              renderMonitorEditor={(entry) => selectedMonitor?.id === entry.id ? (
                <MonitorEditor
                  key={entry.id}
                  entry={entry}
                  slots={slots}
                  creditEstimate={creditEstimate}
                  error={monitorError}
                  isSaving={isSavingMonitor}
                  onSubmit={saveMonitor}
                  onCancel={() => {
                    setMonitorError(null);
                    setSelectedMonitor(null);
                  }}
                />
              ) : null}
            />
          )}
        </div>
      </main>
    </PageLayout>
  );
}
