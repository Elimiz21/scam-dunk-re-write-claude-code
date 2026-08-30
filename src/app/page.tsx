import type { Metadata } from "next";
import HomeContent from "./HomeContent";
import { formatUsdCents, getPublicBillingPrices } from "@/lib/billing/pricing";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  const prices = getPublicBillingPrices();
  return (
    <HomeContent
      billingPrices={{
        pro: formatUsdCents(prices.PAID),
        proMax: formatUsdCents(prices.PRO_MAX),
      }}
    />
  );
}
