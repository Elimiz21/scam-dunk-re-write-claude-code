import type { Metadata } from "next";
import HowItWorksContent from "./HowItWorksContent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "How ScamDunk Works - Stock Analysis Methodology",
  description:
    "Understand ScamDunk's multi-step analysis process for identifying potential stock manipulation patterns using market data and behavioral indicators.",
  alternates: {
    canonical: "/how-it-works",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/how-it-works`,
    title: "How ScamDunk Works - Stock Analysis Methodology",
    description:
      "Understand ScamDunk's multi-step analysis process for identifying potential stock manipulation patterns using market data and behavioral indicators.",
    siteName: "ScamDunk",
  },
};

export default function HowItWorksPage() {
  return <HowItWorksContent />;
}
