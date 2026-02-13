import type { Metadata } from "next";
import AboutContent from "./AboutContent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "About ScamDunk - Detect Stock Scam Red Flags",
  description:
    "Learn how ScamDunk helps retail investors identify potential stock manipulation and pump-and-dump schemes through data-driven analysis.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/about`,
    title: "About ScamDunk - Detect Stock Scam Red Flags",
    description:
      "Learn how ScamDunk helps retail investors identify potential stock manipulation and pump-and-dump schemes through data-driven analysis.",
    siteName: "ScamDunk",
  },
};

export default function AboutPage() {
  return <AboutContent />;
}
