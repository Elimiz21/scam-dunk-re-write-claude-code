import type { Metadata } from "next";
import PrivacyContent from "./PrivacyContent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "Privacy Policy - ScamDunk",
  description:
    "ScamDunk's privacy policy explains how we collect, use, and protect your information when you use our stock analysis service.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/privacy`,
    title: "Privacy Policy - ScamDunk",
    description:
      "ScamDunk's privacy policy explains how we collect, use, and protect your information when you use our stock analysis service.",
    siteName: "ScamDunk",
  },
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
