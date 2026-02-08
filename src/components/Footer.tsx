"use client";

import Link from "next/link";
import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background/50 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Main footer content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-semibold font-display italic">ScamDunk</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Helping retail investors identify potential stock manipulation.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold mb-3 text-sm">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-primary transition-smooth">
                  Stock Scanner
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="hover:text-primary transition-smooth">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-primary transition-smooth">
                  About Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold mb-3 text-sm">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/terms" className="hover:text-primary transition-smooth">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-primary transition-smooth">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/disclaimer" className="hover:text-primary transition-smooth">
                  Disclaimer
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-3 text-sm">Contact</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/contact" className="hover:text-primary transition-smooth">
                  Contact Support
                </Link>
              </li>
              <li>
                <a href="mailto:privacy@scamdunk.com" className="hover:text-primary transition-smooth">
                  privacy@scamdunk.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer banner */}
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
          <p className="text-xs text-muted-foreground text-center">
            <strong className="text-destructive">Important:</strong> ScamDunk is an educational tool and does NOT provide financial, investment, or legal advice.
            Our analysis may contain errors. You are solely responsible for your investment decisions.
            <Link href="/disclaimer" className="text-primary hover:underline ml-1">
              Read full disclaimer →
            </Link>
          </p>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} ScamDunk. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/terms" className="hover:text-primary transition-smooth">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-primary transition-smooth">
              Privacy
            </Link>
            <Link href="/disclaimer" className="hover:text-primary transition-smooth">
              Disclaimer
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
