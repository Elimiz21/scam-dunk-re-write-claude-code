"use client";

import { useEffect, useState } from "react";

type PublicationPayload = { status: "AVAILABLE" | "UNAVAILABLE" };
type LivePublicationState<T> =
  | { status: "loading"; data: null }
  | { status: "ready"; data: T }
  | { status: "error"; data: null };

/** Bounded refresh and cancellation shared by both public publication views. */
export function useLivePublication<T extends PublicationPayload>(url: string) {
  const [state, setState] = useState<LivePublicationState<T>>({
    status: "loading", data: null,
  });

  useEffect(() => {
    setState({ status: "loading", data: null });
    let cancelled = false;
    let lastSuccessAt: number | null = null;
    let active: { controller: AbortController; timeout: number } | null = null;
    const cancelActive = () => {
      if (!active) return;
      active.controller.abort();
      window.clearTimeout(active.timeout);
      active = null;
    };
    const load = async () => {
      if (cancelled) return;
      // A background tab may sleep across a publication deadline. Retire its
      // old counters immediately rather than keeping them during a slow fetch.
      if (lastSuccessAt !== null && Date.now() - lastSuccessAt > 90_000) {
        setState({ status: "error", data: null });
      }
      cancelActive();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        if (active?.controller !== controller || cancelled) return;
        cancelActive();
        setState({ status: "error", data: null });
      }, 15_000);
      active = { controller, timeout };
      try {
        const response = await fetch(url, {
          cache: "no-store", signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Statistics unavailable");
        const data = await response.json();
        if (!data || data.error || !["AVAILABLE", "UNAVAILABLE"].includes(data.status)) {
          throw new Error("Invalid statistics response");
        }
        if (!cancelled && !controller.signal.aborted && active?.controller === controller) {
          lastSuccessAt = Date.now();
          setState({ status: "ready", data });
        }
      } catch {
        if (!cancelled && !controller.signal.aborted && active?.controller === controller) {
          setState({ status: "error", data: null });
        }
      } finally {
        window.clearTimeout(timeout);
        if (active?.controller === controller) active = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      cancelActive();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url]);

  return state;
}
