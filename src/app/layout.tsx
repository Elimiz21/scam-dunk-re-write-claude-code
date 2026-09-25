import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { JsonLd } from "@/components/JsonLd";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-377T7N93Q6"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-377T7N93Q6');
          `}
        </Script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600&family=Inter+Tight:wght@300;400;500;600&display=swap"
        />
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
