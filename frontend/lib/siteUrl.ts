/**
 * Canonical origin for metadata (sitemap, robots, canonical links).
 *
 * The .online and .ca domains serve the same app; search engines need one
 * canonical host or the copies compete with each other.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://www.datainsightgen.com";
