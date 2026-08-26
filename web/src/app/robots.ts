import type { MetadataRoute } from "next";

const SITE_URL = "https://capture.com.ng";

// Business dashboards, admin, onboarding, and the token-gated report/upload
// links carry per-business data behind auth or an unguessable token — none
// of it is meant to surface in search results or get pulled into a crawl.
// Everything else (marketing pages, /find) is intentionally open, including
// to AI/LLM crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.) — no UA-based
// blocking, since none of those crawlers should see anything a browser
// wouldn't.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/onboarding", "/report/", "/upload/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
