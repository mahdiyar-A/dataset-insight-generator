import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/siteUrl";

/**
 * There was no robots.txt at all — the URL returned Next's 404 page.
 *
 * Crawling is allowed by default, so its absence was not blocking indexing on
 * its own, but it is where crawlers look for the sitemap, and without it the
 * authenticated areas are crawled and discarded for nothing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Everything behind a sign-in. A crawler following these only ever
        // reaches a redirect, and workspace and invite URLs carry ids that
        // should not sit in a search index at all.
        disallow: [
          "/admin",
          "/dashboard",
          "/workspace",
          "/invite",
          "/reset-password",
          "/verify-email",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
