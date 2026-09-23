import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-border/70 bg-background mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <p className="text-[12px] leading-5 text-muted-foreground">
              Independent scam &amp; fraud check for self-directed investors.
            </p>
          </div>
          <nav className="flex max-w-full flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <span aria-hidden>·</span>
            <Link href="/disclaimer" className="hover:text-foreground">
              Disclaimer
            </Link>
            <span aria-hidden>·</span>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <span aria-hidden>·</span>
            <Link href="/contact" className="hover:text-foreground">
              Contact
            </Link>
          </nav>
        </div>
        <p className="mt-6 border-t border-border/60 pt-5 text-[11px] leading-relaxed text-muted-foreground">
          ScamDunk is an educational tool and does not provide financial,
          investment, or legal advice. Our analysis may contain errors; you are
          solely responsible for your investment decisions.{" "}
          <Link
            href="/disclaimer"
            className="underline decoration-border underline-offset-2 hover:text-foreground"
          >
            Read the full disclaimer
          </Link>
          {" · "}© {new Date().getFullYear()} ScamDunk. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
