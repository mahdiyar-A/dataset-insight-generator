"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5150").replace(/\/$/, "");

/**
 * Tells DIG's own server that a page was seen, for the owner's visit counts.
 * No cookie, no third party, nothing stored in the browser: the server keeps
 * daily totals only (backend VisitCounter, and the Privacy Policy says so).
 *
 * Sent as plain text, which needs no preflight, and only the path: the query
 * string can carry tokens and is never sent. Browsers set to Do Not Track or
 * Global Privacy Control send nothing at all.
 */
// The other site someone came from belongs to the first page they open only:
// document.referrer stays the same while they move around inside DIG.
let referrerSent = false;

export default function VisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || typeof navigator === "undefined" || !navigator.sendBeacon) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return;
    if (pathname.startsWith("/admin")) return;
    try {
      const referrer = referrerSent ? "" : document.referrer || "";
      referrerSent = true;
      const body = JSON.stringify({ p: pathname, r: referrer });
      navigator.sendBeacon(`${API_BASE}/api/visits`, new Blob([body], { type: "text/plain" }));
    } catch {
      // A count is never worth an error on someone's page.
    }
  }, [pathname]);

  return null;
}
