import type { Metadata } from "next";
import HelpContent from "./HelpContent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "Help & FAQ - ScamDunk",
  description:
    "Find answers to common questions about using ScamDunk, understanding risk results, account management, and more.",
  alternates: {
    canonical: "/help",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/help`,
    title: "Help & FAQ - ScamDunk",
    description:
      "Find answers to common questions about using ScamDunk, understanding risk results, account management, and more.",
    siteName: "ScamDunk",
  },
};

export default function HelpPage() {
  return <HelpContent />;
}
