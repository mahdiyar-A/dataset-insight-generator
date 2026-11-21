"use client";
/**
 * Hears, while a report is open in the editor, when anyone saves it: the
 * owner on the dashboard, a teammate on the team page, or this person in
 * another tab. See backend/Hubs/ReportHub.cs.
 *
 * What arrives carries no words of the report, only the new version number
 * and who saved it; the editor fetches the version itself.
 *
 *   onSaved({ analysisId, version, savedBy, savedByName })
 *   onRemoved()       this person can no longer read the report
 *   onReconnected()   the connection dropped and came back: saves may have been missed
 */
import { useEffect, useRef } from "react";
import * as signalR from "@microsoft/signalr";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5150").replace(/\/$/, "");

const same = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

export function useReportLive({ token, analysisId, active, onSaved, onRemoved, onReconnected }) {
  // The latest handlers, without reconnecting each time they change.
  const handlers = useRef({ onSaved, onRemoved, onReconnected });
  useEffect(() => { handlers.current = { onSaved, onRemoved, onReconnected }; });

  useEffect(() => {
    if (!active || !token || !analysisId) return;
    let stopped = false;

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/report?access_token=${encodeURIComponent(token)}`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    hub.on("ReportSaved", (notice) => {
      if (same(notice?.analysisId, analysisId)) handlers.current.onSaved?.(notice);
    });
    hub.on("ReportAccessRemoved", (notice) => {
      if (same(notice?.analysisId, analysisId)) handlers.current.onRemoved?.();
    });

    // Live updates are a convenience: the editor works without them.
    const watch = () => hub.invoke("WatchReport", analysisId).catch(() => {});
    hub.onreconnected(() => {
      void watch();
      handlers.current.onReconnected?.();
    });
    hub.start()
      .then(() => { if (!stopped) return watch(); })
      .catch(() => {});

    return () => {
      stopped = true;
      hub.stop().catch(() => {});
    };
  }, [active, token, analysisId]);
}
