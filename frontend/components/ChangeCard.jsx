// @ts-nocheck
"use client";

/**
 * A change to the report the chat suggested, or a chart DIG drew: what each
 * change does, the words now and the words suggested side by side, figures
 * worth a second look, and Apply / Discard, then Undo.
 *
 * The page holds only the preview. The changes themselves stay on the server
 * and are applied by the suggestion's id, so what is applied is what DIG
 * checked. See backend ReportProposals and ai_service report_changes.py.
 */

import React from "react";

const T = {
  en: {
    heading: (n) => (n === 1 ? "Suggested change" : `Suggested changes (${n})`),
    now: "Now", suggested: "Suggested",
    apply: "Apply", applying: "Applying and rebuilding the files…", discard: "Discard",
    undo: "Undo", undoing: "Undoing…",
    applied: (v) => `Applied as version ${v}. The report files were rebuilt.`,
    discarded: "Discarded. The report wasn't changed.",
    undone: (v) => `Undone. The report is back as it was, saved as version ${v}.`,
    warn: (list) => `Check these figures before applying: ${list}. They couldn't be matched to your data.`,
    conflict: "The report was changed after this was suggested. Ask again to get a suggestion for the newest version.",
    expired: "This suggestion is no longer available. Ask again.",
    rejected: "This change can't be applied to the report as it is now.",
    unavailable: "The change couldn't be made just now. Try again in a moment.",
    tooMany: "That's a lot of changes in one hour. Try again a little later.",
    undoConflict: "The report was changed again since, so this Undo can't be used. Use Edit the report → Versions to go back.",
    basedOn: "Based on (written by DIG)",
    under: (n) => (n ? `Shown under insight ${n}` : "Shown with the other charts, at the end"),
    sections: { reportTitle: "Report title", introduction: "Introduction", executiveSummary: "Summary",
                conclusion: "Conclusion", dataQualitySection: "Data quality", assumptions: "Your assumptions" },
    types: { bar: "a bar chart", line: "a line chart", scatter: "a scatter plot", histogram: "a histogram",
             box: "a box plot", grouped_bar: "a grouped bar chart" },
    rewrite: (s) => `Rewrite: ${s}`,
    rewriteInsight: (n) => `Rewrite insight ${n}`,
    moveInsight: (n, title, to) => `Move insight ${n}, “${title}”, to place ${to}`,
    removeInsight: (n, title) => `Remove insight ${n}, “${title}”`,
    editChart: (l) => `Change the chart “${l}”`,
    removeChart: (l) => `Remove the chart “${l}”`,
    redrawChart: (l, ty) => `Redraw “${l}” as ${ty}`,
    rewriteAnswer: (q) => `Rewrite the answer to “${q}”`,
    addInsight: (n) => `New insight, at place ${n}`,
    addChart: (ty) => `Add ${ty}`,
  },
  fr: {
    heading: (n) => (n === 1 ? "Modification suggérée" : `Modifications suggérées (${n})`),
    now: "Actuel", suggested: "Suggéré",
    apply: "Appliquer", applying: "Application et reconstruction des fichiers…", discard: "Ignorer",
    undo: "Annuler", undoing: "Annulation…",
    applied: (v) => `Appliqué comme version ${v}. Les fichiers du rapport ont été reconstruits.`,
    discarded: "Ignoré. Le rapport n'a pas été modifié.",
    undone: (v) => `Annulé. Le rapport est revenu à son état précédent, enregistré comme version ${v}.`,
    warn: (list) => `Vérifiez ces chiffres avant d'appliquer : ${list}. Ils n'ont pas pu être rapprochés de vos données.`,
    conflict: "Le rapport a été modifié après cette suggestion. Redemandez pour obtenir une suggestion sur la dernière version.",
    expired: "Cette suggestion n'est plus disponible. Redemandez.",
    rejected: "Cette modification ne peut pas être appliquée au rapport tel qu'il est maintenant.",
    unavailable: "La modification n'a pas pu être faite pour l'instant. Réessayez dans un moment.",
    tooMany: "Beaucoup de modifications en une heure. Réessayez un peu plus tard.",
    undoConflict: "Le rapport a encore été modifié depuis : cette annulation n'est plus possible. Utilisez Modifier le rapport → Versions pour revenir en arrière.",
    basedOn: "Fondé sur (écrit par DIG)",
    under: (n) => (n ? `Affiché sous l'insight ${n}` : "Affiché avec les autres graphiques, à la fin"),
    sections: { reportTitle: "Titre du rapport", introduction: "Introduction", executiveSummary: "Résumé",
                conclusion: "Conclusion", dataQualitySection: "Qualité des données", assumptions: "Vos hypothèses" },
    types: { bar: "en barres", line: "en courbe", scatter: "en nuage de points", histogram: "en histogramme",
             box: "en boîte", grouped_bar: "en barres groupées" },
    rewrite: (s) => `Réécrire : ${s}`,
    rewriteInsight: (n) => `Réécrire l'insight ${n}`,
    moveInsight: (n, title, to) => `Déplacer l'insight ${n}, « ${title} », en position ${to}`,
    removeInsight: (n, title) => `Retirer l'insight ${n}, « ${title} »`,
    editChart: (l) => `Modifier le graphique « ${l} »`,
    removeChart: (l) => `Retirer le graphique « ${l} »`,
    redrawChart: (l, ty) => `Redessiner « ${l} » ${ty}`,
    rewriteAnswer: (q) => `Réécrire la réponse à « ${q} »`,
    addInsight: (n) => `Nouvel insight, en position ${n}`,
    addChart: (ty) => `Ajouter un graphique ${ty}`,
  },
  fa: {
    heading: (n) => (n === 1 ? "تغییر پیشنهادی" : `تغییرهای پیشنهادی (${n})`),
    now: "اکنون", suggested: "پیشنهاد",
    apply: "اعمال", applying: "در حال اعمال و ساخت دوباره‌ی فایل‌ها…", discard: "کنار گذاشتن",
    undo: "واگرد", undoing: "در حال واگرد…",
    applied: (v) => `به‌عنوان نسخه‌ی ${v} اعمال شد. فایل‌های گزارش دوباره ساخته شدند.`,
    discarded: "کنار گذاشته شد. گزارش تغییری نکرد.",
    undone: (v) => `واگرد شد. گزارش به حالت پیش برگشت و به‌عنوان نسخه‌ی ${v} ذخیره شد.`,
    warn: (list) => `پیش از اعمال، این اعداد را بررسی کنید: ${list}. با داده‌های شما تطبیق داده نشدند.`,
    conflict: "گزارش پس از این پیشنهاد تغییر کرده است. دوباره بپرسید تا پیشنهادی برای تازه‌ترین نسخه بگیرید.",
    expired: "این پیشنهاد دیگر در دسترس نیست. دوباره بپرسید.",
    rejected: "این تغییر را نمی‌توان روی گزارش کنونی اعمال کرد.",
    unavailable: "تغییر اکنون انجام نشد. کمی بعد دوباره تلاش کنید.",
    tooMany: "در این یک ساعت تغییرهای زیادی انجام شده است. کمی بعد دوباره تلاش کنید.",
    undoConflict: "گزارش از آن زمان دوباره تغییر کرده، پس این واگرد ممکن نیست. از «ویرایش گزارش ← نسخه‌ها» برای بازگشت استفاده کنید.",
    basedOn: "بر پایه‌ی (نوشته‌ی DIG)",
    under: (n) => (n ? `نمایش زیرِ یافته‌ی ${n}` : "نمایش همراه نمودارهای دیگر، در پایان"),
    sections: { reportTitle: "عنوان گزارش", introduction: "مقدمه", executiveSummary: "خلاصه",
                conclusion: "نتیجه‌گیری", dataQualitySection: "کیفیت داده", assumptions: "فرض‌های شما" },
    types: { bar: "نمودار میله‌ای", line: "نمودار خطی", scatter: "نمودار پراکندگی", histogram: "هیستوگرام",
             box: "نمودار جعبه‌ای", grouped_bar: "نمودار میله‌ای گروهی" },
    rewrite: (s) => `بازنویسی: ${s}`,
    rewriteInsight: (n) => `بازنویسی یافته‌ی ${n}`,
    moveInsight: (n, title, to) => `جابه‌جایی یافته‌ی ${n}، «${title}»، به جایگاه ${to}`,
    removeInsight: (n, title) => `حذف یافته‌ی ${n}، «${title}»`,
    editChart: (l) => `تغییر نمودار «${l}»`,
    removeChart: (l) => `حذف نمودار «${l}»`,
    redrawChart: (l, ty) => `کشیدن دوباره‌ی «${l}» به‌صورت ${ty}`,
    rewriteAnswer: (q) => `بازنویسی پاسخ به «${q}»`,
    addInsight: (n) => `یافته‌ی تازه، در جایگاه ${n}`,
    addChart: (ty) => `افزودن ${ty}`,
  },
};

/** What one change does, in one line. */
export function describeChange(p, c) {
  const type = c.types[p.type] || p.type;
  switch (p.op) {
    case "set_text":       return c.rewrite(c.sections[p.section] || p.section);
    case "set_insight":    return c.rewriteInsight(p.position);
    case "move_insight":   return c.moveInsight(p.position, p.title, p.to);
    case "remove_insight": return c.removeInsight(p.position, p.title);
    case "set_chart":      return c.editChart(p.chart);
    case "remove_chart":   return c.removeChart(p.chart);
    case "redraw_chart":   return c.redrawChart(p.chart, type);
    case "set_answer":     return c.rewriteAnswer(p.question);
    case "add_insight":    return c.addInsight(p.position);
    case "add_chart":      return c.addChart(type);
    default:               return p.op;
  }
}

const textBox = { margin: 0, padding: "6px 8px", borderRadius: "8px", fontSize: "0.76rem", lineHeight: 1.5,
                  whiteSpace: "pre-wrap", flex: "1 1 180px", minWidth: 0 };
const smallLabel = { display: "block", fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.04em",
                     textTransform: "uppercase", marginBottom: "3px" };

function Words({ title, body }) {
  return (
    <>
      {title ? <strong style={{ display: "block" }}>{title}</strong> : null}
      {body}
    </>
  );
}

function BeforeAfter({ beforeTitle, before, afterTitle, after, c }) {
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      <div dir="auto" style={{ ...textBox, background: "rgba(127,29,29,0.18)", color: "#fecaca" }}>
        <span style={{ ...smallLabel, color: "#fca5a5" }}>{c.now}</span>
        <Words title={beforeTitle} body={before} />
      </div>
      <div dir="auto" style={{ ...textBox, background: "rgba(20,83,45,0.25)", color: "#bbf7d0" }}>
        <span style={{ ...smallLabel, color: "#86efac" }}>{c.suggested}</span>
        <Words title={afterTitle} body={after} />
      </div>
    </div>
  );
}

function Picture({ src, alt }) {
  if (!src) return null;
  return <img src={src} alt={alt} style={{ width: "100%", maxWidth: "320px", borderRadius: "8px", background: "#fff" }} />;
}

function ChangeBody({ p, c }) {
  switch (p.op) {
    case "set_text":
    case "set_answer":
      return <BeforeAfter before={p.before} after={p.after} c={c} />;
    case "set_insight":
      return <BeforeAfter beforeTitle={p.beforeTitle} before={p.before} afterTitle={p.afterTitle} after={p.after} c={c} />;
    case "set_chart":
      return (
        <>
          <BeforeAfter beforeTitle={p.beforeLabel} before={p.before} afterTitle={p.afterLabel} after={p.after} c={c} />
          {"under" in p && <p className="muted-small" style={{ margin: 0 }}>{c.under(p.under)}</p>}
        </>
      );
    case "add_insight":
      return (
        <div dir="auto" style={{ ...textBox, background: "rgba(20,83,45,0.25)", color: "#bbf7d0" }}>
          <Words title={p.title} body={p.after} />
          {p.basedOn?.length > 0 && (
            <span style={{ display: "block", marginTop: "6px", fontStyle: "italic", color: "#d1fae5" }}>
              <span style={{ ...smallLabel, color: "#86efac" }}>{c.basedOn}</span>
              {p.basedOn.join("; ")}
            </span>
          )}
        </div>
      );
    case "add_chart":
      return (
        <>
          <Picture src={p.picture} alt={p.chart} />
          <p dir="auto" style={{ margin: 0, fontSize: "0.76rem", color: "#e5e7eb" }}>
            <strong>{p.chart}</strong>{p.after ? ` — ${p.after}` : ""}
          </p>
          <p className="muted-small" style={{ margin: 0 }}>{c.under(p.under)}</p>
        </>
      );
    case "redraw_chart":
      return <Picture src={p.picture} alt={p.chart} />;
    default:
      return null;
  }
}

/**
 * @param {{ proposal: { id: string, baseVersion: number, preview: object[], warnings?: string[] },
 *   card: { status: "open" | "applying" | "applied" | "undoing" | "undone" | "discarded" | "closed",
 *           version?: number, message?: "conflict" | "expired" | "rejected" | "unavailable" | "tooMany" | "undoConflict",
 *           noUndo?: boolean },
 *   lang: string, onApply: () => void, onDiscard: () => void, onUndo: () => void }} props
 */
export default function ChangeCard({ proposal, card, lang, onApply, onDiscard, onUndo }) {
  const c = T[lang] || T.en;
  const preview = proposal?.preview ?? [];
  const status = card?.status ?? "open";
  const busy = status === "applying" || status === "undoing";

  return (
    <section aria-label={c.heading(preview.length)}
      style={{ marginTop: "8px", padding: "10px", borderRadius: "10px", display: "flex", flexDirection: "column",
               gap: "8px", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(56,189,248,0.35)" }}>
      <strong style={{ fontSize: "0.74rem", color: "#7dd3fc" }}>{c.heading(preview.length)}</strong>

      {preview.map((p, k) => (
        <div key={k} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span dir="auto" style={{ fontSize: "0.76rem", fontWeight: 600, color: "#e5e7eb" }}>{describeChange(p, c)}</span>
          <ChangeBody p={p} c={c} />
        </div>
      ))}

      {proposal?.warnings?.length > 0 && status === "open" && (
        <p role="note" style={{ margin: 0, fontSize: "0.72rem", color: "#fbbf24" }}>⚠ {c.warn(proposal.warnings.join(", "))}</p>
      )}

      {card?.message && (
        <p role="alert" style={{ margin: 0, fontSize: "0.74rem", color: "#fca5a5" }}>{c[card.message] ?? c.unavailable}</p>
      )}
      {status === "applied" && <p role="status" style={{ margin: 0, fontSize: "0.74rem", color: "#bbf7d0" }}>{c.applied(card.version)}</p>}
      {status === "undone" && <p role="status" style={{ margin: 0, fontSize: "0.74rem", color: "#bbf7d0" }}>{c.undone(card.version)}</p>}
      {status === "discarded" && <p role="status" className="muted-small" style={{ margin: 0 }}>{c.discarded}</p>}

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {(status === "open" || status === "applying") && (
          <>
            <button type="button" className="primary-btn" disabled={busy} onClick={onApply}
              style={{ padding: "6px 14px", fontSize: "0.76rem", opacity: busy ? 0.6 : 1 }}>
              {status === "applying" ? c.applying : c.apply}
            </button>
            <button type="button" className="chip-btn subtle" disabled={busy} onClick={onDiscard}
              style={{ fontSize: "0.74rem", padding: "5px 11px" }}>
              {c.discard}
            </button>
          </>
        )}
        {(status === "applied" || status === "undoing") && !card?.noUndo && (
          <button type="button" className="chip-btn subtle" disabled={busy} onClick={onUndo}
            style={{ fontSize: "0.74rem", padding: "5px 11px" }}>
            ↶ {status === "undoing" ? c.undoing : c.undo}
          </button>
        )}
      </div>
    </section>
  );
}
