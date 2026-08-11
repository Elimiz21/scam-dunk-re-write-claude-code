import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { JsonLd } from "@/components/JsonLd";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
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
        url: `${siteUrl}/opengraph-image`,
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
    images: [`${siteUrl}/opengraph-image`],
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
      { url: "/favicon.ico", sizes: "any" },
      { url: "/images/brand/icon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

// Global schema: WebSite + Organization (injected on every page)
// NOTE: no SearchAction/potentialAction — the site has no `?q=` search
// endpoint, so advertising one would be misleading structured data.
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "ScamDunk",
  url: siteUrl,
  description:
    "Investment scam detection tool that analyzes stock pitches for pump-and-dump signals and manipulation patterns.",
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ScamDunk",
  url: siteUrl,
  logo: `${siteUrl}/opengraph-image`,
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
      className={`${inter.variable} ${interTight.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("scamdunk-theme");var d=t==="dark"||(t!=="light"&&(t==="auto"||!t)&&(new Date().getHours()>=19||new Date().getHours()<6));document.documentElement.classList.add(d?"dark":"light");}catch(e){}})();`,
          }}
        />
      </head>
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
