// @ts-nocheck
"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import BackendAPI from "@/lib/BackendAPI";

/*
  Share a finished analysis with a team.

  The server could do this from the start and nothing on the site asked it to:
  no button shared an analysis and no link led to a workspace, so the shared
  workspace could not be reached by anyone.

  Teams load when the panel is opened, not with the dashboard, so a visit that
  shares nothing costs nothing.
*/

const T = {
  en: {
    open: "Share with a team",
    title: "Share with a team",
    hint: "Your team sees the report, charts and files, and can comment on them.",
    loading: "Loading your teams…",
    noTeams: "You're not in a team yet.",
    createTeam: "Create a team →",
    viewerOnly: "You're a viewer in your teams. An editor or the owner can share.",
    viewer: "viewer",
    share: "Share",
    sharing: "Sharing…",
    shared: (team) => `Shared with ${team}.`,
    openWorkspace: "Open the workspace →",
    close: "Close",
    failed: "That couldn't be shared. Please try again.",
  },
  fr: {
    open: "Partager avec une équipe",
    title: "Partager avec une équipe",
    hint: "Votre équipe voit le rapport, les graphiques et les fichiers, et peut les commenter.",
    loading: "Chargement de vos équipes…",
    noTeams: "Vous n'êtes dans aucune équipe pour l'instant.",
    createTeam: "Créer une équipe →",
    viewerOnly: "Vous êtes lecteur dans vos équipes. Un éditeur ou le propriétaire peut partager.",
    viewer: "lecteur",
    share: "Partager",
    sharing: "Partage…",
    shared: (team) => `Partagé avec ${team}.`,
    openWorkspace: "Ouvrir l'espace de travail →",
    close: "Fermer",
    failed: "Le partage a échoué. Veuillez réessayer.",
  },
  fa: {
    open: "اشتراک‌گذاری با تیم",
    title: "اشتراک‌گذاری با تیم",
    hint: "تیم شما گزارش، نمودارها و فایل‌ها را می‌بیند و می‌تواند درباره آن‌ها نظر بدهد.",
    loading: "در حال بارگذاری تیم‌های شما…",
    noTeams: "شما هنوز عضو هیچ تیمی نیستید.",
    createTeam: "ساخت تیم ←",
    viewerOnly: "شما در تیم‌هایتان بیننده هستید. ویرایشگر یا مالک تیم می‌تواند به اشتراک بگذارد.",
    viewer: "بیننده",
    share: "اشتراک‌گذاری",
    sharing: "در حال اشتراک‌گذاری…",
    shared: (team) => `با ${team} به اشتراک گذاشته شد.`,
    openWorkspace: "باز کردن فضای کاری ←",
    close: "بستن",
    failed: "اشتراک‌گذاری انجام نشد. لطفاً دوباره تلاش کنید.",
  },
};

/** Viewers read and comment; sharing is for editors and the owner. The server checks the same rule. */
const canShareInto = (team) => team.isOwner || team.myRole === "owner" || team.myRole === "editor";

/**
 * @param {{ analysisId: string }} props
 */
export default function ShareWithTeam({ analysisId }) {
  const { token, user } = useAuth();
  const { lang } = useSettings();
  const t = T[lang] || T.en;

  const [open,    setOpen]    = useState(false);
  const [teams,   setTeams]   = useState(null);     // null until loaded
  const [teamId,  setTeamId]  = useState("");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState("");
  const [done,    setDone]    = useState(null);     // { workspaceId, teamName }

  const isPro = user?.plan === "pro" || user?.plan === "admin";

  // A different analysis is a different thing to share.
  useEffect(() => { setDone(null); setError(""); }, [analysisId]);

  useEffect(() => {
    if (!open || teams !== null || !token) return;
    let cancelled = false;
    BackendAPI.getMyTeams(token)
      .then((list) => {
        if (cancelled) return;
        setTeams(list);
        const first = list.find(canShareInto);
        if (first) setTeamId(first.id);
      })
      .catch((e) => { if (!cancelled) { setTeams([]); setError(e?.message || t.failed); } });
    return () => { cancelled = true; };
  }, [open, teams, token, t.failed]);

  if (!isPro || !analysisId) return null;

  const share = async () => {
    const team = (teams ?? []).find((x) => x.id === teamId);
    if (!team || busy) return;
    setBusy(true); setError("");
    try {
      const ws = await BackendAPI.shareAnalysis(token, analysisId, team.id);
      setDone({ workspaceId: ws.id, teamName: team.name });
    } catch (e) {
      setError(e?.message || t.failed);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="secondary-btn" onClick={() => setOpen(true)}>
        {t.open}
      </button>
    );
  }

  const shareable = (teams ?? []).filter(canShareInto);

  return (
    <div role="group" aria-label={t.title}
      style={{ padding:"12px 14px", borderRadius:"12px",
        background:"rgba(15,23,42,0.9)", border:"1px solid rgba(37,99,235,0.3)",
        display:"flex", flexDirection:"column", gap:"8px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:"10px" }}>
        <h3 style={{ margin:0, fontSize:"0.85rem", fontWeight:700, color:"#e5e7eb" }}>{t.title}</h3>
        <button type="button" onClick={() => setOpen(false)}
          style={{ background:"none", border:"none", color:"#64748b", fontSize:"0.75rem", cursor:"pointer", padding:0 }}>
          {t.close}
        </button>
      </div>
      <p className="muted-small" style={{ margin:0 }}>{t.hint}</p>

      {teams === null && <p className="muted-small" style={{ margin:0 }}>{t.loading}</p>}

      {teams !== null && teams.length === 0 && !error && (
        <p className="muted-small" style={{ margin:0 }}>
          {t.noTeams}{" "}
          <a href="/dashboard/team" style={{ color:"#93c5fd", fontWeight:600 }}>{t.createTeam}</a>
        </p>
      )}

      {teams !== null && teams.length > 0 && shareable.length === 0 && (
        <p className="muted-small" style={{ margin:0 }}>{t.viewerOnly}</p>
      )}

      {shareable.length > 0 && !done && (
        <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
          <select aria-label={t.title} value={teamId} onChange={(e) => setTeamId(e.target.value)}
            style={{ flex:"1 1 180px", minWidth:0, padding:"8px 10px", borderRadius:"8px",
              border:"1px solid rgba(55,65,81,0.8)", background:"rgba(2,6,23,0.7)",
              color:"#e2e8f0", fontSize:"0.82rem" }}>
            {teams.map((team) => (
              <option key={team.id} value={team.id} disabled={!canShareInto(team)}>
                {team.name}{canShareInto(team) ? "" : ` (${t.viewer})`}
              </option>
            ))}
          </select>
          <button type="button" className="primary-btn" onClick={share} disabled={busy || !teamId}
            style={{ padding:"8px 16px", fontSize:"0.8rem", opacity:(busy || !teamId) ? 0.5 : 1,
              cursor:(busy || !teamId) ? "not-allowed" : "pointer" }}>
            {busy ? t.sharing : t.share}
          </button>
        </div>
      )}

      {done && (
        <p role="status" style={{ margin:0, fontSize:"0.8rem", color:"#bbf7d0" }}>
          ✓ {t.shared(done.teamName)}{" "}
          <a href={`/workspace/${done.workspaceId}`} style={{ color:"#93c5fd", fontWeight:600 }}>
            {t.openWorkspace}
          </a>
        </p>
      )}

      {error && <p role="alert" style={{ margin:0, fontSize:"0.76rem", color:"#f97373" }}>{error}</p>}
    </div>
  );
}
