"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  AlertTriangle,
  MessageSquareText,
  ShieldCheck,
  Clock3,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { AssetType } from "@/lib/types";
import { SITE_STATS } from "@/lib/site-stats";
import { useLiveSiteStats } from "@/lib/use-site-stats";

interface LandingOptionAProps {
  onSubmit: (data: {
    ticker: string;
    assetType: AssetType;
    pitchText?: string;
    context?: {
      unsolicited: boolean;
      promisesHighReturns: boolean;
      urgencyPressure: boolean;
      secrecyInsideInfo: boolean;
    };
  }) => void;
  isLoading: boolean;
  disabled?: boolean;
  error?: string;
  headline?: string;
  subheadline?: string;
}

const DEFAULT_SUBHEADLINE =
  "Enter a ticker or paste the message, we check it for scam and fraud red flags, and show you exactly what we found.";

/** Pull a plausible ticker out of free text ("$ACME", "buy ACME now", "acme"). */
function extractTicker(raw: string): { ticker: string; pitch?: string } | null {
  const text = raw.trim();
  if (!text) return null;
  const bare = text.match(/^\$?([A-Za-z][A-Za-z0-9.-]{0,9})$/);
  if (bare) return { ticker: bare[1].toUpperCase() };
  const dollar = text.match(/\$([A-Za-z][A-Za-z0-9.-]{0,9})\b/);
  if (dollar) return { ticker: dollar[1].toUpperCase(), pitch: text };
  const caps = text.match(/\b([A-Z][A-Z0-9.-]{1,5})\b/);
  if (caps) return { ticker: caps[1], pitch: text };
  return null;
}

export function LandingOptionA({
  onSubmit,
  isLoading,
  disabled,
  error,
  headline,
  subheadline,
}: LandingOptionAProps) {
  const [value, setValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const { tiles } = useLiveSiteStats();

  const handleCheck = () => {
    const parsed = extractTicker(value);
    if (!parsed) {
      setInputError(
        "Include the ticker symbol (e.g. ACME) so we know which stock to check.",
      );
      return;
    }
    setInputError(null);
    onSubmit({
      ticker: parsed.ticker,
      assetType: "stock",
      pitchText: parsed.pitch,
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-background">
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/80 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" />
              Free stock scam &amp; fraud checker
            </span>

            <h1 className="font-editorial text-[clamp(2.25rem,5vw,4rem)] leading-[1.1] text-foreground">
              {headline ? (
                headline
              ) : (
                <>
                  That tip came from someone you trust. That&apos;s exactly why{" "}
                  <span className="text-brand-blue">you should check it.</span>
                </>
              )}
            </h1>

            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              {subheadline || DEFAULT_SUBHEADLINE}
            </p>

            {(error || inputError) && (
              <div className="mt-5 flex max-w-md items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error || inputError}
              </div>
            )}

            {/* Scan input — pill bar */}
            <div className="mt-7 flex max-w-md items-center gap-1.5 rounded-full border border-border bg-card p-1.5 shadow-sm focus-within:border-foreground/40">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                placeholder="Enter a ticker, e.g. ACME"
                disabled={disabled || isLoading}
                aria-label="Ticker or suspicious message"
                className="flex-1 bg-transparent px-4 py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
              />
              <button
                onClick={handleCheck}
                disabled={disabled || isLoading}
                className="btn-pill btn-pill-primary gap-1.5 px-5 py-2.5 text-[13px] disabled:opacity-60"
              >
                {isLoading ? "Checking…" : "Check this tip"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              <Link
                href="/how-it-works"
                className="font-medium text-foreground/80 hover:text-foreground"
              >
                See what it&apos;s hiding →
              </Link>
              <span aria-hidden>·</span>
              <span>Free · 15-second scan</span>
            </div>

            <p className="mt-8 text-[13px] text-muted-foreground">
              <span className="font-semibold text-foreground">
                {SITE_STATS.stocksPerDay}
              </span>{" "}
              {SITE_STATS.trustLine}
            </p>
          </div>

          {/* Hero image with floating cards */}
          <div className="relative">
            <div className="overflow-hidden rounded-2xl">
              <Image
                src="/images/landing/hero-reading.jpg"
                alt="A woman in her early sixties pauses to read a stock tip on her phone before acting on it"
                width={880}
                height={1100}
                priority
                className="h-[420px] w-full object-cover lg:h-[520px]"
              />
            </div>
            {/* Quote overlay — placeholder until real testimonials land */}
            <figure className="absolute bottom-16 left-0 right-14 rounded-b-none bg-ink/80 p-5 text-paper backdrop-blur-sm md:left-0"
              style={{ background: "hsl(var(--ink) / 0.82)" }}
            >
              <blockquote className="text-[15px] italic leading-snug">
                &ldquo;My son-in-law swore by it. I checked anyway. Turned out
                it was a pump-and-dump.&rdquo;
              </blockquote>
              <figcaption className="mt-2 text-[10px] font-medium uppercase tracking-widest text-paper/70">
                Margaret, 63, Ohio
              </figcaption>
            </figure>
            <div className="absolute -bottom-6 left-6 flex w-56 items-start gap-2.5 rounded-xl border border-border bg-card p-3.5 shadow-lg md:-left-6">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
              <div>
                <p className="text-[12px] font-semibold text-foreground">
                  Independent
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  We don&apos;t sell tips. We only check them.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= STATS STRIP (live, refreshed daily) ================= */}
      <section className="bg-background py-12 md:py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-x-6 gap-y-10 px-4 text-center lg:grid-cols-4">
          {[
            [tiles.stocksPerDay, "stocks scanned every trading day"],
            [tiles.totalScans, "stock scans since January"],
            [tiles.dumpsConfirmed6mo, "pump-and-dumps confirmed in 6 months"],
            [tiles.pumpingNow, "suspected pumps live right now"],
          ].map(([num, label]) => (
            <div key={label}>
              <p className="font-editorial text-4xl text-foreground md:text-[2.75rem]">
                {num}
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-teal">
                {label}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Live from our scan database · updated after every daily scan ·{" "}
          {SITE_STATS.fraudLosses} {SITE_STATS.fraudLossesLabel}
        </p>
      </section>

      {/* ================= POSITIONING ================= */}
      <section className="bg-background py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Not another stock picker
          </p>
          <h2 className="font-editorial mt-6 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.2] text-foreground">
            Seeking Alpha and Motley Fool tell you if a stock is{" "}
            <span className="text-brand-blue">a good pick.</span> We tell you if
            it&apos;s <em>real</em>, before you decide anything else.
          </h2>
          <div className="mx-auto mt-10 h-px w-16 bg-border" />
          <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
            Every result shows the exact signals we checked, not a score you
            have to trust blindly.{" "}
            <Link
              href="/how-it-works"
              className="text-foreground underline decoration-primary/40 decoration-[1.5px] underline-offset-4 hover:decoration-primary"
            >
              See how it works →
            </Link>
          </p>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="border-t border-border/70 bg-background py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 lg:grid-cols-2">
          {/* Photo collage */}
          <div className="relative self-start">
            <div className="overflow-hidden rounded-2xl">
              <Image
                src="/images/landing/how-reading.jpg"
                alt="A man in his late fifties reads a message about a stock tip"
                width={720}
                height={860}
                className="h-[380px] w-full object-cover lg:h-[460px]"
              />
            </div>
            <figure className="absolute -bottom-8 right-0 w-44 rounded-xl bg-ink p-4 text-paper shadow-xl md:-right-4"
              style={{ background: "hsl(var(--ink))" }}
            >
              <blockquote className="text-[13px] italic leading-snug">
                &ldquo;It felt rude to double-check. I did it anyway.&rdquo;
              </blockquote>
              <figcaption className="mt-2 text-[9px] font-medium uppercase tracking-widest text-paper/60">
                Robert, 58
              </figcaption>
            </figure>
          </div>

          {/* Steps */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              How it works
            </p>
            <h2 className="font-editorial mt-4 text-[clamp(2rem,3.8vw,3rem)] leading-[1.15] text-foreground">
              A quiet second opinion, before the money moves.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              ScamDunk isn&apos;t a broker, a newsletter, or an algorithm
              telling you what to buy. It&apos;s the 15-second check most
              people wish they&apos;d done.
            </p>

            <ol className="mt-10 space-y-8">
              {[
                {
                  icon: MessageSquareText,
                  title: "You get a tip.",
                  body: "From a friend, a group chat, a message you weren't expecting. It sounds convincing.",
                },
                {
                  icon: ShieldCheck,
                  title: "We check the fingerprints.",
                  body: "Filings, promoter history, message patterns, price behavior, the exact signals fraud investigators look at.",
                },
                {
                  icon: Clock3,
                  title: "You get a plain answer.",
                  body: "In 15 seconds, with the receipts. Every flag comes with what we found and where.",
                },
              ].map((step, i) => (
                <li key={step.title} className="relative flex gap-4">
                  {i < 2 && (
                    <span
                      className="absolute left-[15px] top-9 h-[calc(100%+0.5rem)] w-px bg-border"
                      aria-hidden
                    />
                  )}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                    <step.icon className="h-3.5 w-3.5 text-foreground/70" />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-10 flex flex-wrap gap-3">
              <button
                onClick={() =>
                  window.scrollTo({ top: 0, behavior: "smooth" })
                }
                className="btn-pill btn-pill-primary gap-1.5"
              >
                Check a tip now
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link href="/how-it-works" className="btn-pill btn-pill-ghost">
                See an example result
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* GEO/AIO semantic block — a dense, machine-readable definition of the
          product (meeting decision, Aug 4): AI assistants discovering the site
          need one paragraph carrying the full semantic field. Visually quiet. */}
      <section className="border-t border-border/70 bg-background py-10">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="sr-only">What is ScamDunk?</h2>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            ScamDunk is a free stock scam and fraud checker for self-directed
            investors. Enter a US stock ticker (NYSE, NASDAQ, AMEX, or OTC) or
            paste a suspicious stock tip, and ScamDunk analyzes it for
            pump-and-dump patterns, unusual volume and price behavior, promoter
            history, SEC alert-list hits, and manipulation red flags — then
            returns a plain-language risk verdict with the exact signals found,
            in about 15 seconds. ScamDunk is not a stock picker, broker, or
            newsletter and gives no investment advice; it checks whether a tip
            is real before you decide anything else. {SITE_STATS.stocksPerDay}{" "}
            US stocks are scanned automatically every trading day.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
