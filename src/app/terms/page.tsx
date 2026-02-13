import type { Metadata } from "next";
import TermsContent from "./TermsContent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "Terms of Service - ScamDunk",
  description:
    "Read the terms and conditions for using ScamDunk's stock analysis service, including subscription terms, acceptable use, and disclaimers.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/terms`,
    title: "Terms of Service - ScamDunk",
    description:
      "Read the terms and conditions for using ScamDunk's stock analysis service, including subscription terms, acceptable use, and disclaimers.",
    siteName: "ScamDunk",
  },
};

export default function TermsPage() {
  return <TermsContent />;
}
