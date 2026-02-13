import type { Metadata } from "next";
import DisclaimerContent from "./DisclaimerContent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "Disclaimer & Limitations - ScamDunk",
  description:
    "Important disclaimers and limitations of ScamDunk's stock analysis tool. Understand what our scans can and cannot detect.",
  alternates: {
    canonical: "/disclaimer",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/disclaimer`,
    title: "Disclaimer & Limitations - ScamDunk",
    description:
      "Important disclaimers and limitations of ScamDunk's stock analysis tool. Understand what our scans can and cannot detect.",
    siteName: "ScamDunk",
  },
};

export default function DisclaimerPage() {
  return <DisclaimerContent />;
}
