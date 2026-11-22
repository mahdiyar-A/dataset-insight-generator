"use client";

import React, { useMemo, useRef, useState } from "react";

/**
 * Horizontal filmstrip of past analyses: "Your analyses" on the dashboard.
 *
 * Replaces the scrolling history list as the primary way to reach an analysis.
 * The dashboard above stays put; clicking a card loads that analysis into it.
 * A finished run appears here immediately rather than replacing what is on
 * screen, so the current view keeps its context.
 *
 * Each card carries the first chart as a thumbnail. Those are signed at request
 * time by the history endpoint — the URLs stored with the analysis expire after
 * 24 hours, so anything older than a day would render broken images.
 *
 * @param {{
 *   history?: import("@/lib/types").Analysis[],
 *   activeId?: string | null,
 *   plan?: string,
 *   busy?: boolean,
 *   onLoad?: (item: import("@/lib/types").Analysis) => void,
 *   onDelete?: (id: string) => void,
 *   onUpgrade?: () => void,
 *   lang?: string,
 * }} props
 */
export default function HistoryTape({
  history = [],
  activeId = null,
  plan = "free",
  busy = false,
  onLoad,
  onDelete,
  onUpgrade,
  lang = "en",
}) {
  const stripRef = useRef(null);
  const [pinnedIds, setPinnedIds] = useState([]);
  const [confirmId, setConfirmId] = useState(null);

  const t = T[lang] || T.en;
  const limit = plan === "pro" || plan === "admin" ? 15 : 5;
  const isPro = plan === "pro" || plan === "admin";

  // Pinned entries float to the front so a reference analysis stays reachable
  // while the user works through newer ones.
  const ordered = useMemo(() => {
    const pinned = history.filter(h => pinnedIds.includes(h.id));
    const rest   = history.filter(h => !pinnedIds.includes(h.id));
    return [...pinned, ...rest];
  }, [history, pinnedIds]);

  const togglePin = (id) =>
    setPinnedIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const scrollBy = (delta) =>
    stripRef.current?.scrollBy({ left: delta, behavior: "smooth" });

  // Keyboard access: the strip is a horizontally scrolling region, which is a
  // trap for keyboard users without explicit arrow handling.
  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); scrollBy(240); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); scrollBy(-240); }
  };

  return (
    <section
      aria-label={t.title}
      className="card"
      style={{ padding: "18px 20px 20px" }}
    >
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "10px 14px", marginBottom: "14px" }}>
        <h2 style={{ margin: 0 }}>{t.title}</h2>

        <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }} title={t.keptTitle}>
          {history.length} / {limit}
        </span>

        {!isPro && history.length >= limit && (
          <button
            onClick={onUpgrade}
            className="chip-btn"
            style={{ minHeight: "34px", fontSize: "0.8rem", fontWeight: 600 }}
          >
            {t.upgrade}
          </button>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          <TapeArrow dir="left"  onClick={() => scrollBy(-240)} label={t.scrollLeft} />
          <TapeArrow dir="right" onClick={() => scrollBy(240)}  label={t.scrollRight} />
        </div>
      </div>

      {/* Strip */}
      <div
        ref={stripRef}
        role="list"
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{
          display: "flex", gap: "14px", overflowX: "auto", overflowY: "hidden",
          padding: "2px 2px 8px", scrollbarWidth: "thin",
          scrollSnapType: "x proximity",
        }}
      >
        {busy && <SkeletonCard />}

        {ordered.length === 0 && !busy && (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.92rem", padding: "18px 4px", margin: 0 }}>
            {t.empty}
          </p>
        )}

        {ordered.map(item => (
          <TapeCard
            key={item.id}
            item={item}
            active={item.id === activeId}
            pinned={pinnedIds.includes(item.id)}
            confirming={confirmId === item.id}
            lang={lang}
            onLoad={() => onLoad?.(item)}
            onTogglePin={() => togglePin(item.id)}
            onAskDelete={() => setConfirmId(item.id)}
            onCancelDelete={() => setConfirmId(null)}
            onConfirmDelete={() => { setConfirmId(null); onDelete?.(item.id); }}
          />
        ))}
      </div>
    </section>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function TapeCard({
  item, active, pinned, confirming, lang,
  onLoad, onTogglePin, onAskDelete, onCancelDelete, onConfirmDelete,
}) {
  const t = T[lang] || T.en;
  const [hover, setHover] = useState(false);

  const badges = [
    item.hasPdfReport  && { key: "pdf",  label: "PDF" },
    item.hasWordReport && { key: "word", label: "DOC" },
    item.hasPptx       && { key: "pptx", label: "PPT" },
    item.hasCleanedCsv && { key: "csv",  label: "CSV" },
  ].filter(Boolean);

  const when = item.completedAt || item.createdAt;

  return (
    <div
      role="listitem"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", flex: "0 0 200px", scrollSnapAlign: "start",
        background: active ? "color-mix(in srgb, var(--cobalt) 14%, var(--card))" : "var(--card)",
        border: active ? "2px solid var(--cobalt-accent)" : "2px solid var(--rule)",
        boxShadow: active ? "4px 4px 0 var(--cobalt-accent)" : "none",
        overflow: "hidden",
      }}
    >
      {/* Thumbnail — the whole button is the click target for loading */}
      <button
        onClick={onLoad}
        title={item.fileName}
        aria-label={`${t.load} ${item.fileName}`}
        style={{
          display: "block", width: "100%", padding: 0, border: "none",
          background: "transparent", color: "inherit", cursor: "pointer", textAlign: "start",
        }}
      >
        <div style={{
          height: "84px", display: "flex", alignItems: "center",
          justifyContent: "center", overflow: "hidden",
          background: "var(--card)", borderBottom: "2px solid var(--rule)",
        }}>
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnailUrl}
              alt=""
              loading="lazy"
              style={{ width: "100%", height: "84px", objectFit: "cover" }}
            />
          ) : (
            <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#12121a" strokeWidth="2" opacity="0.35"><path d="M4 19h16M7 16V10M12 16V5M17 16v-8"/></svg>
          )}
        </div>

        <div style={{ padding: "10px 12px 12px" }}>
          <p style={{
            margin: 0, fontSize: "0.9rem", fontWeight: 600,
            color: "var(--ink)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.fileName}
          </p>

          <p style={{ margin: "3px 0 0", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
            {when ? new Date(when).toLocaleDateString("en-CA") : "—"}
            {item.rowCount ? ` · ${item.rowCount.toLocaleString()}r` : ""}
          </p>

          <div style={{ display: "flex", gap: "4px", marginTop: "8px", flexWrap: "wrap" }}>
            {badges.map(b => (
              <span key={b.key} style={{
                fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.05em",
                padding: "2px 6px",
                border: "1.5px solid var(--line)", color: "var(--ink-soft)",
              }}>
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </button>

      {/* Pin — always visible when pinned, so its state is not hover-dependent */}
      {(hover || pinned) && !confirming && (
        <button
          onClick={onTogglePin}
          aria-pressed={pinned}
          // aria-label, not title: the glyph is the button's text content and
          // would otherwise become its accessible name, so a screen reader
          // announces "☆" instead of "Pin".
          aria-label={pinned ? t.unpin : t.pin}
          title={pinned ? t.unpin : t.pin}
          style={{
            position: "absolute", top: "5px", left: "5px",
            background: "var(--card)", border: "1.5px solid var(--line)",
            minWidth: "28px", minHeight: "28px", padding: "2px 6px", cursor: "pointer", fontSize: "0.85rem",
            color: pinned ? "var(--warn-text)" : "var(--ink)", lineHeight: 1,
          }}
        >
          <span aria-hidden="true">{pinned ? "★" : "☆"}</span>
        </button>
      )}

      {hover && !confirming && (
        <button
          onClick={onAskDelete}
          title={t.delete}
          aria-label={`${t.delete} ${item.fileName}`}
          style={{
            position: "absolute", top: "5px", right: "5px",
            background: "var(--card)", border: "1.5px solid var(--line)",
            minWidth: "28px", minHeight: "28px", padding: "2px 6px", cursor: "pointer", fontSize: "0.85rem",
            color: "var(--danger-text)", lineHeight: 1,
          }}
        >
          <span aria-hidden="true">✕</span>
        </button>
      )}

      {/* Inline confirm. A window.confirm() here would block the whole page and
          lose the card's context. */}
      {confirming && (
        <div style={{
          position: "absolute", inset: 0, background: "var(--card)",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: "7px", padding: "8px", textAlign: "center",
        }}>
          <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "var(--ink)" }}>{t.confirmDelete}</p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={onConfirmDelete}
              style={{
                background: "var(--danger)", border: "2px solid var(--rule)",
                color: "#ffffff", fontSize: "0.82rem", fontWeight: 600, padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              {t.yes}
            </button>
            <button
              onClick={onCancelDelete}
              style={{
                background: "none", border: "none", color: "var(--ink-soft)",
                fontSize: "0.82rem", padding: "6px 8px", cursor: "pointer", textDecoration: "underline",
              }}
            >
              {t.no}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      style={{
        flex: "0 0 200px", height: "168px", border: "2px dashed var(--line)",
        background: "linear-gradient(90deg, var(--paper-alt) 25%, var(--card) 50%, var(--paper-alt) 75%)",
        backgroundSize: "200% 100%",
        animation: "digTapeShimmer 1.4s ease-in-out infinite",
      }}
    >
      <style>{`@keyframes digTapeShimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }`}</style>
    </div>
  );
}

function TapeArrow({ dir, onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        background: "var(--card)", border: "2px solid var(--rule)",
        color: "var(--ink)", width: "36px", height: "36px",
        cursor: "pointer", fontSize: "1.1rem", lineHeight: 1, padding: 0,
      }}
    >
      {dir === "left" ? "‹" : "›"}
    </button>
  );
}

// ── Copy ─────────────────────────────────────────────────────────────────────

const T = {
  en: {
    title: "Your analyses", keptTitle: "Analyses kept, of the most your plan keeps",
    empty: "No analyses yet. Upload a file above to begin.",
    upgrade: "Upgrade for 15", load: "Load", delete: "Delete",
    pin: "Pin", unpin: "Unpin", confirmDelete: "Delete this?",
    yes: "Delete", no: "Cancel",
    scrollLeft: "Scroll history left", scrollRight: "Scroll history right",
  },
  fr: {
    title: "Vos analyses", keptTitle: "Analyses conservées, sur le maximum de votre offre",
    empty: "Aucune analyse pour l'instant. Importez un fichier ci-dessus pour commencer.",
    upgrade: "Passer à 15", load: "Charger", delete: "Supprimer",
    pin: "Épingler", unpin: "Détacher", confirmDelete: "Supprimer ?",
    yes: "Supprimer", no: "Annuler",
    scrollLeft: "Défiler à gauche", scrollRight: "Défiler à droite",
  },
  fa: {
    title: "تحلیل‌های شما", keptTitle: "تحلیل‌های نگه‌داشته، از بیشترین تعداد طرح شما",
    empty: "هنوز تحلیلی نیست. برای شروع، بالا یک فایل آپلود کنید.",
    upgrade: "ارتقا به ۱۵", load: "بارگذاری", delete: "حذف",
    pin: "سنجاق", unpin: "برداشتن سنجاق", confirmDelete: "حذف شود؟",
    yes: "حذف", no: "لغو",
    scrollLeft: "پیمایش به چپ", scrollRight: "پیمایش به راست",
  },
};
