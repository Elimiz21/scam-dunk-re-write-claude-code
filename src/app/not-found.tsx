import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Page Not Found | ScamDunk",
  description: "The page you're looking for doesn't exist.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg text-center">
          <div className="mb-10 flex justify-center">
            <Logo size={48} href="/" />
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Error 404
          </p>

          <h1 className="font-editorial mt-4 text-[clamp(2.5rem,7vw,4rem)] leading-[1.05] text-foreground">
            This page doesn&apos;t{" "}
            <span className="text-brand-blue">check out.</span>
          </h1>

          <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
            We couldn&apos;t find anything at this address. Check the ticker,
            not this URL — the page may have moved or never existed.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="btn-pill btn-pill-primary text-sm">
              Back to the scanner
            </Link>
            <Link href="/help" className="btn-pill btn-pill-ghost text-sm">
              Help &amp; FAQ
            </Link>
          </div>
        </div>
      </div>

      <p className="pb-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ScamDunk. Independent scam &amp; fraud
        check for self-directed investors.
      </p>
    </div>
  );
}
