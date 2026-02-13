import type { Metadata } from "next";
import ContactContent from "./ContactContent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export const metadata: Metadata = {
  title: "Contact ScamDunk - Get Help & Support",
  description:
    "Have a question, suggestion, or need help with ScamDunk? Contact our support team and we'll get back to you.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/contact`,
    title: "Contact ScamDunk - Get Help & Support",
    description:
      "Have a question, suggestion, or need help with ScamDunk? Contact our support team and we'll get back to you.",
    siteName: "ScamDunk",
  },
};

export default function ContactPage() {
  return <ContactContent />;
}
