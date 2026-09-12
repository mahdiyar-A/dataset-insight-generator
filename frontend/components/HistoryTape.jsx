"use client";

import React, { useMemo, useRef, useState } from "react";

/**
 * Horizontal filmstrip of past analyses, pinned to the bottom of the dashboard.
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
      style={{
        position: "sticky", bottom: 0, zIndex: 20,
        background: "rgba(8,13,26,0.94)",
        backdropFilter: "blur(14px)",
        borderTop: "1px solid rgba(30,41,59,0.9)",
        padding: "10px 16px 12px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <h2 style={{
          margin: 0, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "#64748b",
        }}>
          {t.title}
        </h2>

        <span style={{ fontSize: "0.72rem", color: "#475569" }}>
          {history.length} / {limit}
        </span>

        {!isPro && history.length >= limit && (
          <button
            onClick={onUpgrade}
            style={{
              background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)",
              color: "#93c5fd", fontSize: "0.68rem", fontWeight: 600,
              padding: "2px 9px", borderRadius: "999px", cursor: "pointer",
            }}
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
          display: "flex", gap: "10px", overflowX: "auto", overflowY: "hidden",
          paddingBottom: "4px", scrollbarWidth: "thin", outline: "none",
          scrollSnapType: "x proximity",
        }}
      >
        {busy && <SkeletonCard />}

        {ordered.length === 0 && !busy && (
          <p style={{ color: "#334155", fontSize: "0.8rem", padding: "18px 4px", margin: 0 }}>
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
        position: "relative", flex: "0 0 178px", scrollSnapAlign: "start",
        background: active ? "rgba(37,99,235,0.12)" : "rgba(15,23,42,0.75)",
        border: active
          ? "1px solid rgba(59,130,246,0.55)"
          : "1px solid rgba(30,41,59,0.75)",
        borderRadius: "10px", overflow: "hidden",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      {/* Thumbnail — the whole button is the click target for loading */}
      <button
        onClick={onLoad}
        title={item.fileName}
        aria-label={`${t.load} ${item.fileName}`}
        style={{
          display: "block", width: "100%", padding: 0, border: "none",
          background: "rgba(2,6,23,0.6)", cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{
          height: "70px", display: "flex", alignItems: "center",
          justifyContent: "center", overflow: "hidden",
        }}>
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnailUrl}
              alt=""
              loading="lazy"
              style={{ width: "100%", height: "70px", objectFit: "cover", opacity: active ? 1 : 0.75 }}
            />
          ) : (
            <span aria-hidden="true" style={{ fontSize: "1.4rem", opacity: 0.25 }}>📊</span>
          )}
        </div>

        <div style={{ padding: "7px 9px 8px" }}>
          <p style={{
            margin: 0, fontSize: "0.76rem", fontWeight: 600,
            color: active ? "#bfdbfe" : "#cbd5e1",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.fileName}
          </p>

          <p style={{ margin: "2px 0 0", fontSize: "0.66rem", color: "#475569" }}>
            {when ? new Date(when).toLocaleDateString("en-CA") : "—"}
            {item.rowCount ? ` · ${item.rowCount.toLocaleString()}r` : ""}
          </p>

          <div style={{ display: "flex", gap: "3px", marginTop: "5px", flexWrap: "wrap" }}>
            {badges.map(b => (
              <span key={b.key} style={{
                fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.04em",
                padding: "1px 5px", borderRadius: "3px",
                background: "rgba(30,41,59,0.9)", color: "#64748b",
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
            background: "rgba(2,6,23,0.8)", border: "none", borderRadius: "5px",
            padding: "2px 5px", cursor: "pointer", fontSize: "0.68rem",
            color: pinned ? "#fbbf24" : "#64748b", lineHeight: 1,
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
            background: "rgba(2,6,23,0.8)", border: "none", borderRadius: "5px",
            padding: "2px 6px", cursor: "pointer", fontSize: "0.7rem",
            color: "#f87171", lineHeight: 1,
          }}
        >
          <span aria-hidden="true">✕</span>
        </button>
      )}

      {/* Inline confirm. A window.confirm() here would block the whole page and
          lose the card's context. */}
      {confirming && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(2,6,23,0.94)",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: "7px", padding: "8px", textAlign: "center",
        }}>
          <p style={{ margin: 0, fontSize: "0.7rem", color: "#cbd5e1" }}>{t.confirmDelete}</p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={onConfirmDelete}
              style={{
                background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)",
                color: "#fca5a5", fontSize: "0.68rem", padding: "3px 10px",
                borderRadius: "5px", cursor: "pointer",
              }}
            >
              {t.yes}
            </button>
            <button
              onClick={onCancelDelete}
              style={{
                background: "none", border: "none", color: "#64748b",
                fontSize: "0.68rem", padding: "3px 6px", cursor: "pointer",
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
        flex: "0 0 178px", height: "132px", borderRadius: "10px",
        background: "linear-gradient(90deg, rgba(15,23,42,0.7) 25%, rgba(30,41,59,0.7) 50%, rgba(15,23,42,0.7) 75%)",
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
        background: "rgba(15,23,42,0.8)", border: "1px solid rgba(30,41,59,0.8)",
        color: "#64748b", borderRadius: "6px", width: "24px", height: "22px",
        cursor: "pointer", fontSize: "0.7rem", lineHeight: 1, padding: 0,
      }}
    >
      {dir === "left" ? "‹" : "›"}
    </button>
  );
}

// ── Copy ─────────────────────────────────────────────────────────────────────

const T = {
  en: {
    title: "History", empty: "No analyses yet — upload a dataset to begin.",
    upgrade: "Upgrade for 15", load: "Load", delete: "Delete",
    pin: "Pin", unpin: "Unpin", confirmDelete: "Delete this?",
    yes: "Delete", no: "Cancel",
    scrollLeft: "Scroll history left", scrollRight: "Scroll history right",
  },
  fr: {
    title: "Historique", empty: "Aucune analyse — importez un dataset pour commencer.",
    upgrade: "Passer à 15", load: "Charger", delete: "Supprimer",
    pin: "Épingler", unpin: "Détacher", confirmDelete: "Supprimer ?",
    yes: "Supprimer", no: "Annuler",
    scrollLeft: "Défiler à gauche", scrollRight: "Défiler à droite",
  },
  fa: {
    title: "تاریخچه", empty: "هنوز تحلیلی نیست — یک دیتاست آپلود کنید.",
    upgrade: "ارتقا به ۱۵", load: "بارگذاری", delete: "حذف",
    pin: "سنجاق", unpin: "برداشتن سنجاق", confirmDelete: "حذف شود؟",
    yes: "حذف", no: "لغو",
    scrollLeft: "پیمایش به چپ", scrollRight: "پیمایش به راست",
  },
};
