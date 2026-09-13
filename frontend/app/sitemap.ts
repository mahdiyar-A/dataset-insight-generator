import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/siteUrl";

/**
 * Next's metadata convention, which serves real XML at /sitemap.xml.
 *
 * This replaces an `app/sitemap.xml` file that exported a GET handler. A file
 * with that name is not a route — a route handler has to live at
 * `sitemap.xml/route.ts` — so Next served the module's own source, and anything
 * fetching the sitemap got TypeScript instead of XML.
 *
 * Only pages a signed-out visitor can reach belong here. Listing an
 * authenticated route invites a crawler to spend its budget on redirects to the
 * login page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/plans`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/guestDashboard`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/register`, lastModified, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/login`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/forgot-password`, lastModified, changeFrequency: "yearly", priority: 0.1 },
  ];
}
