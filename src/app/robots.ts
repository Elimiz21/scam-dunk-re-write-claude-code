import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://scamdunk.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/design-preview",
          "/login",
          "/signup",
          "/account",
          "/check",
          "/reset-password",
          "/forgot-password",
          "/verify-email",
          "/check-email",
          "/error",
          "/api",
          "/_next",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
