import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { JsonLd } from "@/components/JsonLd";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "ScamDunk - Detect Stock Scam Red Flags",
  description:
    "Spot investment scam red flags instantly. ScamDunk analyzes stock pitches for pump-and-dump signals, volume anomalies, and manipulation patterns.",
  metadataBase: new URL(siteUrl),
  alternates: {},
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "ScamDunk - Detect Stock Scam Red Flags",
    description:
      "Spot investment scam red flags instantly. ScamDunk analyzes stock pitches for pump-and-dump signals, volume anomalies, and manipulation patterns.",
    siteName: "ScamDunk",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "ScamDunk - Detect Stock Scam Red Flags",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ScamDunk - Detect Stock Scam Red Flags",
    description:
      "Spot investment scam red flags instantly. ScamDunk analyzes stock pitches for pump-and-dump signals, volume anomalies, and manipulation patterns.",
    images: [`${siteUrl}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

// Global schema: WebSite + Organization (injected on every page)
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "ScamDunk",
  url: siteUrl,
  description:
    "Investment scam detection tool that analyzes stock pitches for pump-and-dump signals and manipulation patterns.",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteUrl}/?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ScamDunk",
  url: siteUrl,
  logo: `${siteUrl}/og-image.png`,
  description:
    "ScamDunk helps retail investors identify potential stock manipulation and pump-and-dump schemes through data-driven forensic analysis.",
  foundingDate: "2024",
  areaServed: "US",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    url: `${siteUrl}/contact`,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${playfairDisplay.variable}`}
    >
      <body className="font-sans antialiased">
        <JsonLd data={[websiteSchema, organizationSchema]} />
        <SessionProvider>
          <ThemeProvider>
            <ToastProvider>{children}</ToastProvider>
          </ThemeProvider>
        </SessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
