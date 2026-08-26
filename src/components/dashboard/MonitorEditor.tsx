"use client";

import { FormEvent, useMemo, useState } from "react";
import { BellRing, Clock3, Loader2 } from "lucide-react";

import {
  type MonitorDraft,
  type MonitorFrequency,
  type MonitorKind,
  validateMonitorDraft,
} from "@/components/dashboard/monitor-form";
import type {
  ApiErrorShape,
  MonitorCreditEstimate,
  MonitorSlots,
  WatchlistEntryDto,
} from "@/components/dashboard/types";
import { buildMonitorView } from "@/components/dashboard/view-model";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MonitorCreateRequest extends MonitorDraft {
  mode: "create";
  watchlistEntryId: string;
}

export interface MonitorUpdateRequest {
  mode: "update";
  id: string;
  frequency: MonitorFrequency;
  durationMonths: number;
}

export type MonitorSaveRequest = MonitorCreateRequest | MonitorUpdateRequest;

interface MonitorEditorProps {
  entry: WatchlistEntryDto;
  slots: MonitorSlots;
  creditEstimate: MonitorCreditEstimate;
  error?: ApiErrorShape | null;
  isSaving: boolean;
  onSubmit: (request: MonitorSaveRequest) => void | Promise<void>;
  onCancel: () => void;
}

export function MonitorEditor({
  entry,
  slots,
  creditEstimate,
  error,
  isSaving,
  onSubmit,
  onCancel,
}: MonitorEditorProps) {
  const [kind, setKind] = useState<MonitorKind>("FULL");
  const [frequency, setFrequency] = useState<MonitorFrequency>("DAILY");
  const [durationMonths, setDurationMonths] = useState(1);
  const [validationError, setValidationError] = useState<string | null>(null);
  const selectedLabel = kind === "FULL" ? "full" : "price";
  const view = useMemo(
    () => buildMonitorView({ kind, frequency, durationMonths, slots, creditEstimate, error }),
    [creditEstimate, durationMonths, error, frequency, kind, slots],
  );
  const existingMonitor = entry.monitors.find(
    (monitor) =>
      monitor.kind === kind &&
      (monitor.status === "ACTIVE" || monitor.status === "PAUSED"),
  );
  const noSlotAvailable = !view.hasAvailableSlot && !existingMonitor;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateMonitorDraft({ kind, frequency, durationMonths });
    if ("message" in result) {
      setValidationError(result.message);
      return;
    }
    setValidationError(null);
    void onSubmit(
      existingMonitor
        ? {
            mode: "update",
            id: existingMonitor.id,
            frequency: result.value.frequency,
            durationMonths: result.value.durationMonths,
          }
        : {
            mode: "create",
            watchlistEntryId: entry.id,
            ...result.value,
          },
    );
  }

  return (
    <Card role="dialog" aria-labelledby="monitor-editor-title" aria-modal="false">
      <CardHeader>
        <CardTitle id="monitor-editor-title" className="font-display text-xl italic">
          Monitor {entry.ticker}
        </CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {view.notice} Results appear in app and by email.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold">Monitor type</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(["FULL", "PRICE"] as const).map((value) => {
                const slot = value === "FULL" ? slots.full : slots.price;
                return (
                  <label
                    key={value}
                    className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name="monitor-kind"
                      value={value}
                      checked={kind === value}
                      onChange={() => setKind(value)}
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {value === "FULL" ? "Full monitor" : "Price monitor"}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {slot.used} of {slot.limit} {value === "FULL" ? "full" : "price"} slots used
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="monitor-frequency">Frequency</Label>
              <select
                id="monitor-frequency"
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as MonitorFrequency)}
                className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>
            <div>
              <Label htmlFor="monitor-duration">Duration · 1–24 months</Label>
              <Input
                id="monitor-duration"
                type="number"
                min={1}
                max={24}
                step={1}
                value={durationMonths}
                onChange={(event) => setDurationMonths(Number(event.target.value))}
                className="mt-2 min-h-11"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Estimated credit use: about {view.estimatedCredits}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Creating or changing a monitor uses no credit. Each completed scheduled check uses one credit; skipped or unavailable results do not.
                </p>
              </div>
            </div>
          </div>

          {noSlotAvailable && !error && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm" role="status">
              All {selectedLabel} monitor slots are currently in use. The server will confirm your plan limit before saving.
            </div>
          )}
          {(validationError || error) && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
              {validationError || error?.message}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" className="min-h-11 gap-2" disabled={isSaving || noSlotAvailable}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
              {existingMonitor ? "Update monitor" : "Save monitor"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
