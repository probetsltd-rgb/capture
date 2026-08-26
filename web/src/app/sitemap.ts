import type { MetadataRoute } from "next";

const SITE_URL = "https://capture.com.ng";

// Only public, indexable marketing pages — dashboard/admin/onboarding and
// the token-gated report/upload links are excluded here and in robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/find`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/recover`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/login`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/data-deletion`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
