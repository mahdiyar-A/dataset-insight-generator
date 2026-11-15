// @ts-nocheck
"use client";

/**
 * The report as a document its owner edits in DIG. Every save becomes a new
 * version and rebuilds the PDF (and Word and PowerPoint when the analysis has
 * them); Undo and the version list go back to an older version by saving it
 * again as the newest, so nothing is ever lost.
 *
 * What DIG measured (row counts, confidence, what each insight rests on) is
 * shown but cannot be edited. See lib/reportEdits.ts and
 * ai_service/ai_engine/report_document.py.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSettings } from "@/app/contexts/SettingsContext";
import BackendAPI from "@/lib/BackendAPI";
import {
  RTL_LANGUAGES, canRemoveInsight, chartFileOf, chartsUnder, editOf, moveInsight, removeChart,
  removeInsight, sameDocument, setAnswer, setChart, setInsight, setText, undoTarget, warningsAt,
} from "@/lib/reportEdits";

const T = {
  en: {
    title: "Edit the report",
    intro: "Change the words, the order of the insights and the charts. Each save is a new version, and the PDF, Word and PowerPoint files are rebuilt to match.",
    open: "Edit the report", close: "Close the editor",
    loading: "Opening the report…",
    old: "This report was made before reports could be edited. Run the analysis again to edit it.",
    failed: "The report couldn't be opened just now. Try again in a moment.",
    retry: "Try again",
    version: (n) => `Version ${n}`,
    reportTitle: "Report title", introduction: "Introduction", executiveSummary: "Summary",
    insights: "Insights", insight: (n) => `Insight ${n}`, insightTitle: (n) => `Insight ${n} title`,
    insightBody: (n) => `Insight ${n} text`, basedOn: "Based on (computed by DIG, not editable)",
    up: "Move up", down: "Move down", remove: "Remove",
    lastInsight: "A report keeps at least one insight.",
    chart: "Chart", chartTitle: "Chart title", chartCaption: "Chart caption", shownUnder: "Shown under",
    otherCharts: "Other charts, at the end", otherChartsHeading: "Other charts",
    removeChart: "Remove chart",
    answers: "Answers to your questions", answerTo: (q) => `Answer to: ${q}`,
    conclusion: "Conclusion", dataQualitySection: "Data quality", assumptions: "Your assumptions",
    facts: "What DIG measured (not editable)",
    factsLine: (f) => [f.rowCount != null && `${Number(f.rowCount).toLocaleString("en")} rows`,
                       f.columnCount != null && `${f.columnCount} columns`,
                       f.confidenceScore && `confidence ${f.confidenceScore}/10`].filter(Boolean).join(" · "),
    save: "Save", saving: "Saving and rebuilding the files…", discard: "Discard changes",
    undo: "Undo", undoHint: "Save or discard your changes first.",
    versions: "Versions", hideVersions: "Hide versions", goBack: "Go back to this",
    current: "Current", byDig: "Written by DIG", byYou: "Saved by you",
    restoredFrom: (n) => `went back to version ${n}`,
    saved: (n) => `Saved as version ${n}. The files now match it.`,
    restored: (n, to) => `Went back to version ${to}, saved as version ${n}.`,
    conflict: "This report was changed since you opened it, in another tab or window. Reload it to see the newest version; your unsaved changes here will be replaced.",
    reload: "Reload",
    noInsights: "A report keeps at least one insight.",
    unavailable: "The report couldn't be saved just now. Your changes are still here; try again in a moment.",
    tooMany: "That's a lot of saves in one hour. Your changes are still here; try again a little later.",
    unsaved: "Unsaved changes",
    figure: (nums) => `${nums.join(", ")}: not a figure the analysis produced. Check it before sharing the report.`,
  },
  fr: {
    title: "Modifier le rapport",
    intro: "Modifiez le texte, l'ordre des insights et les graphiques. Chaque enregistrement crée une nouvelle version, et les fichiers PDF, Word et PowerPoint sont reconstruits.",
    open: "Modifier le rapport", close: "Fermer l'éditeur",
    loading: "Ouverture du rapport…",
    old: "Ce rapport date d'avant la modification des rapports. Relancez l'analyse pour pouvoir le modifier.",
    failed: "Impossible d'ouvrir le rapport pour l'instant. Réessayez dans un moment.",
    retry: "Réessayer",
    version: (n) => `Version ${n}`,
    reportTitle: "Titre du rapport", introduction: "Introduction", executiveSummary: "Résumé",
    insights: "Insights", insight: (n) => `Insight ${n}`, insightTitle: (n) => `Titre de l'insight ${n}`,
    insightBody: (n) => `Texte de l'insight ${n}`, basedOn: "Fondé sur (calculé par DIG, non modifiable)",
    up: "Monter", down: "Descendre", remove: "Retirer",
    lastInsight: "Un rapport garde au moins un insight.",
    chart: "Graphique", chartTitle: "Titre du graphique", chartCaption: "Légende du graphique", shownUnder: "Affiché sous",
    otherCharts: "Autres graphiques, à la fin", otherChartsHeading: "Autres graphiques",
    removeChart: "Retirer le graphique",
    answers: "Réponses à vos questions", answerTo: (q) => `Réponse à : ${q}`,
    conclusion: "Conclusion", dataQualitySection: "Qualité des données", assumptions: "Vos hypothèses",
    facts: "Ce que DIG a mesuré (non modifiable)",
    factsLine: (f) => [f.rowCount != null && `${Number(f.rowCount).toLocaleString("fr")} lignes`,
                       f.columnCount != null && `${f.columnCount} colonnes`,
                       f.confidenceScore && `confiance ${f.confidenceScore}/10`].filter(Boolean).join(" · "),
    save: "Enregistrer", saving: "Enregistrement et reconstruction des fichiers…", discard: "Annuler les modifications",
    undo: "Annuler", undoHint: "Enregistrez ou annulez d'abord vos modifications.",
    versions: "Versions", hideVersions: "Masquer les versions", goBack: "Revenir à celle-ci",
    current: "Actuelle", byDig: "Écrite par DIG", byYou: "Enregistrée par vous",
    restoredFrom: (n) => `retour à la version ${n}`,
    saved: (n) => `Enregistré comme version ${n}. Les fichiers correspondent.`,
    restored: (n, to) => `Retour à la version ${to}, enregistré comme version ${n}.`,
    conflict: "Ce rapport a été modifié depuis son ouverture, dans un autre onglet ou une autre fenêtre. Rechargez-le pour voir la dernière version ; vos modifications non enregistrées ici seront remplacées.",
    reload: "Recharger",
    noInsights: "Un rapport garde au moins un insight.",
    unavailable: "Le rapport n'a pas pu être enregistré pour l'instant. Vos modifications sont toujours là ; réessayez dans un moment.",
    tooMany: "Beaucoup d'enregistrements en une heure. Vos modifications sont toujours là ; réessayez un peu plus tard.",
    unsaved: "Modifications non enregistrées",
    figure: (nums) => `${nums.join(", ")} : ce chiffre ne vient pas de l'analyse. Vérifiez-le avant de partager le rapport.`,
  },
  fa: {
    title: "ویرایش گزارش",
    intro: "متن، ترتیب یافته‌ها و نمودارها را تغییر دهید. هر ذخیره یک نسخه‌ی تازه است و فایل‌های PDF، Word و PowerPoint دوباره ساخته می‌شوند.",
    open: "ویرایش گزارش", close: "بستن ویرایشگر",
    loading: "در حال باز کردن گزارش…",
    old: "این گزارش پیش از امکان ویرایش ساخته شده است. برای ویرایش، تحلیل را دوباره اجرا کنید.",
    failed: "گزارش اکنون باز نشد. کمی بعد دوباره تلاش کنید.",
    retry: "تلاش دوباره",
    version: (n) => `نسخه‌ی ${n}`,
    reportTitle: "عنوان گزارش", introduction: "مقدمه", executiveSummary: "خلاصه",
    insights: "یافته‌ها", insight: (n) => `یافته‌ی ${n}`, insightTitle: (n) => `عنوان یافته‌ی ${n}`,
    insightBody: (n) => `متن یافته‌ی ${n}`, basedOn: "بر پایه‌ی (محاسبه‌ی DIG، ویرایش‌نشدنی)",
    up: "بالا", down: "پایین", remove: "حذف",
    lastInsight: "گزارش دست‌کم یک یافته نگه می‌دارد.",
    chart: "نمودار", chartTitle: "عنوان نمودار", chartCaption: "توضیح نمودار", shownUnder: "نمایش زیرِ",
    otherCharts: "نمودارهای دیگر، در پایان", otherChartsHeading: "نمودارهای دیگر",
    removeChart: "حذف نمودار",
    answers: "پاسخ به پرسش‌های شما", answerTo: (q) => `پاسخ به: ${q}`,
    conclusion: "نتیجه‌گیری", dataQualitySection: "کیفیت داده", assumptions: "فرض‌های شما",
    facts: "آنچه DIG اندازه گرفت (ویرایش‌نشدنی)",
    factsLine: (f) => [f.rowCount != null && `${Number(f.rowCount).toLocaleString("fa")} ردیف`,
                       f.columnCount != null && `${f.columnCount} ستون`,
                       f.confidenceScore && `اطمینان ${f.confidenceScore}/10`].filter(Boolean).join(" · "),
    save: "ذخیره", saving: "در حال ذخیره و ساخت دوباره‌ی فایل‌ها…", discard: "کنار گذاشتن تغییرات",
    undo: "واگرد", undoHint: "ابتدا تغییرات را ذخیره کنید یا کنار بگذارید.",
    versions: "نسخه‌ها", hideVersions: "پنهان کردن نسخه‌ها", goBack: "بازگشت به این نسخه",
    current: "کنونی", byDig: "نوشته‌ی DIG", byYou: "ذخیره‌شده توسط شما",
    restoredFrom: (n) => `بازگشت به نسخه‌ی ${n}`,
    saved: (n) => `به‌عنوان نسخه‌ی ${n} ذخیره شد. فایل‌ها اکنون با آن یکی‌اند.`,
    restored: (n, to) => `به نسخه‌ی ${to} برگشت و به‌عنوان نسخه‌ی ${n} ذخیره شد.`,
    conflict: "این گزارش پس از باز کردنش، در زبانه یا پنجره‌ای دیگر تغییر کرده است. برای دیدن تازه‌ترین نسخه آن را دوباره بارگذاری کنید؛ تغییرات ذخیره‌نشده‌ی اینجا جایگزین می‌شوند.",
    reload: "بارگذاری دوباره",
    noInsights: "گزارش دست‌کم یک یافته نگه می‌دارد.",
    unavailable: "گزارش اکنون ذخیره نشد. تغییرات شما سر جایشان هستند؛ کمی بعد دوباره تلاش کنید.",
    tooMany: "در این یک ساعت ذخیره‌های زیادی انجام شده است. تغییرات شما سر جایشان هستند؛ کمی بعد دوباره تلاش کنید.",
    unsaved: "تغییرات ذخیره‌نشده",
    figure: (nums) => `${nums.join("، ")}: این عدد از تحلیل نیامده است. پیش از هم‌رسانی گزارش آن را بررسی کنید.`,
  },
};

const box = { padding: "12px 14px", borderRadius: "12px", background: "rgba(15,23,42,0.9)", border: "1px solid rgba(31,41,55,0.9)", display: "flex", flexDirection: "column", gap: "8px" };
const inputStyle = { width: "100%", boxSizing: "border-box", background: "rgba(2,6,23,0.85)", border: "1px solid rgba(55,65,81,0.9)", borderRadius: "8px", padding: "8px 10px", color: "#e5e7eb", fontSize: "0.82rem", fontFamily: "inherit", lineHeight: 1.5, resize: "vertical" };
const labelStyle = { fontSize: "0.72rem", color: "#9ca3af", fontWeight: 600, letterSpacing: "0.02em" };
const smallBtn = { background: "rgba(15,23,42,0.95)", border: "1px solid rgba(55,65,81,0.9)", borderRadius: "999px", padding: "4px 10px", color: "#9ca3af", fontSize: "0.72rem", cursor: "pointer" };

function rowsFor(text) {
  const value = text ?? "";
  return Math.min(16, Math.max(3, value.split("\n").length + Math.floor(value.length / 90)));
}

function Warning({ numbers, t }) {
  if (!numbers?.length) return null;
  return (
    <p role="note" style={{ margin: 0, fontSize: "0.74rem", color: "#fcd34d" }}>⚠ {t.figure(numbers)}</p>
  );
}

function Field({ label, value, onChange, multiline = true, dir, numbers, t }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span style={labelStyle}>{label}</span>
      {multiline
        ? <textarea aria-label={label} dir={dir} value={value ?? ""} rows={rowsFor(value)}
            onChange={e => onChange(e.target.value)} style={inputStyle} />
        : <input aria-label={label} dir={dir} value={value ?? ""}
            onChange={e => onChange(e.target.value)} style={inputStyle} />}
      <Warning numbers={numbers} t={t} />
    </label>
  );
}

function ChartRow({ chart, url, doc, dir, warnings, t, onChange }) {
  return (
    <div style={{ ...box, background: "rgba(2,6,23,0.6)" }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        {url
          ? <img src={url} alt={chart.label || t.chart} style={{ width: "140px", maxWidth: "100%", borderRadius: "8px", background: "#fff" }} />
          : <div style={{ width: "140px", height: "80px", borderRadius: "8px", background: "rgba(31,41,55,0.6)" }} />}
        <div style={{ flex: 1, minWidth: "200px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <Field label={t.chartTitle} value={chart.label} multiline={false} dir={dir} t={t}
            numbers={warningsAt(warnings, { section: "chart", file: chart.file, field: "label" })}
            onChange={v => onChange(setChart(doc, chart.file, { label: v }))} />
          <Field label={t.chartCaption} value={chart.desc} multiline={false} dir={dir} t={t}
            numbers={warningsAt(warnings, { section: "chart", file: chart.file, field: "desc" })}
            onChange={v => onChange(setChart(doc, chart.file, { desc: v }))} />
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={labelStyle}>{t.shownUnder}</span>
              <select aria-label={t.shownUnder} value={chart.insight ?? ""}
                onChange={e => onChange(setChart(doc, chart.file, { insight: e.target.value || null }))}
                style={{ ...inputStyle, width: "auto", padding: "4px 8px" }}>
                {doc.insights.map((ins, i) => (
                  <option key={ins.id} value={ins.id}>{`${i + 1}. ${ins.title}`.slice(0, 70)}</option>
                ))}
                <option value="">{t.otherCharts}</option>
              </select>
            </label>
            <button type="button" style={smallBtn} onClick={() => onChange(removeChart(doc, chart.file))}>
              {t.removeChart}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportEditor({ analysis, ready }) {
  const { token } = useAuth();
  const { lang } = useSettings();
  const t = T[lang] || T.en;

  const [open, setOpen]           = useState(false);
  const [state, setState]         = useState("idle");   // idle | loading | ready | old | failed
  const [base, setBase]           = useState(null);     // { version, document } as last saved
  const [draft, setDraft]         = useState(null);
  const [versions, setVersions]   = useState([]);
  const [warnings, setWarnings]   = useState([]);
  const [busy, setBusy]           = useState(false);
  const [notice, setNotice]       = useState(null);     // { kind: "ok" | "error" | "conflict", text }
  const [showVersions, setShowVersions] = useState(false);
  const [chartUrls, setChartUrls] = useState({});

  const analysisId = analysis?.id;
  const dirty = !!draft && !!base && !sameDocument(draft, base.document);
  const docLanguage = base?.document?.facts?.language;
  const dir = RTL_LANGUAGES.has(docLanguage) ? "rtl" : undefined;

  const take = useCallback((result) => {
    setBase({ version: result.version, document: result.document });
    setDraft(result.document);
    setVersions(result.versions ?? []);
  }, []);

  const load = useCallback(async () => {
    if (!analysisId) return;
    setState("loading");
    setNotice(null);
    try {
      const result = await BackendAPI.getReport(token, analysisId);
      if (!result?.editable) { setState("old"); return; }
      take(result);
      setWarnings([]);
      setState("ready");
      BackendAPI.getVisualizations(token, analysisId)
        .then(charts => {
          const urls = {};
          for (const c of charts) {
            const file = chartFileOf(c?.url);
            if (file !== null) urls[file] = c.url;
          }
          setChartUrls(urls);
        })
        .catch(() => {});
    } catch {
      setState("failed");
    }
  }, [analysisId, token, take]);

  // Opened on demand: most visits never edit, and the document is the report's whole text.
  useEffect(() => { if (open && state === "idle") void load(); }, [open, state, load]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const explain = (err) => {
    if (err?.status === 409) return { kind: "conflict", text: t.conflict };
    if (err?.code === "no_insights") return { kind: "error", text: t.noInsights };
    if (err?.status === 429) return { kind: "error", text: t.tooMany };
    return { kind: "error", text: t.unavailable };
  };

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await BackendAPI.saveReport(token, analysisId, base.version, editOf(draft));
      take(result);
      setWarnings(result.warnings ?? []);
      setNotice({ kind: "ok", text: t.saved(result.version) });
    } catch (err) {
      setNotice(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const goBackTo = async (version) => {
    if (dirty || busy || version == null) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await BackendAPI.restoreReport(token, analysisId, base.version, version);
      take(result);
      setWarnings([]);
      setNotice({ kind: "ok", text: t.restored(result.version, version) });
    } catch (err) {
      setNotice(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const undoTo = useMemo(() => (base ? undoTarget(versions, base.version) : null), [versions, base]);

  if (!analysisId || !ready) return null;

  const doc = draft;
  const facts = doc?.facts ?? {};
  const textField = (field, multiline = true) => (
    <Field label={t[field]} value={doc.text?.[field]} multiline={multiline} dir={dir} t={t}
      numbers={warningsAt(warnings, { section: field })}
      onChange={v => setDraft(setText(doc, field, v))} />
  );

  return (
    <div className="card analysis-report-card" style={{ marginBottom: "16px" }}>
      <div className="card-header">
        <h2>{t.title}</h2>
        {base && <span className="pill">{t.version(base.version)}{dirty ? ` · ${t.unsaved}` : ""}</span>}
      </div>
      <p className="muted-small" style={{ margin: 0 }}>{t.intro}</p>

      <button type="button" className="secondary-btn" onClick={() => setOpen(o => !o)}
        style={{ alignSelf: "flex-start" }}>
        {open ? t.close : t.open}
      </button>

      {open && state === "loading" && <p className="muted-small">{t.loading}</p>}
      {open && state === "old" && <p className="muted-small">{t.old}</p>}
      {open && state === "failed" && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <p className="muted-small" style={{ margin: 0 }}>{t.failed}</p>
          <button type="button" style={smallBtn} onClick={() => void load()}>{t.retry}</button>
        </div>
      )}

      {open && state === "ready" && doc && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={box}>
            {textField("reportTitle", false)}
            {textField("introduction")}
            {textField("executiveSummary")}
          </div>

          <h3 style={{ ...labelStyle, fontSize: "0.78rem", textTransform: "uppercase", margin: "4px 0 0" }}>{t.insights}</h3>
          {doc.insights.map((ins, i) => (
            <div key={ins.id} style={box}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "0.8rem", color: "#e5e7eb" }}>{t.insight(i + 1)}</strong>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button type="button" style={smallBtn} disabled={i === 0}
                    aria-label={`${t.up}: ${t.insight(i + 1)}`}
                    onClick={() => setDraft(moveInsight(doc, ins.id, -1))}>↑ {t.up}</button>
                  <button type="button" style={smallBtn} disabled={i === doc.insights.length - 1}
                    aria-label={`${t.down}: ${t.insight(i + 1)}`}
                    onClick={() => setDraft(moveInsight(doc, ins.id, 1))}>↓ {t.down}</button>
                  <button type="button" style={smallBtn} disabled={!canRemoveInsight(doc)}
                    title={canRemoveInsight(doc) ? undefined : t.lastInsight}
                    aria-label={`${t.remove}: ${t.insight(i + 1)}`}
                    onClick={() => setDraft(removeInsight(doc, ins.id))}>{t.remove}</button>
                </div>
              </div>
              <Field label={t.insightTitle(i + 1)} value={ins.title} multiline={false} dir={dir} t={t}
                numbers={warningsAt(warnings, { section: "insight", id: ins.id, field: "title" })}
                onChange={v => setDraft(setInsight(doc, ins.id, "title", v))} />
              <Field label={t.insightBody(i + 1)} value={ins.body} dir={dir} t={t}
                numbers={warningsAt(warnings, { section: "insight", id: ins.id, field: "body" })}
                onChange={v => setDraft(setInsight(doc, ins.id, "body", v))} />
              {ins.basedOn?.length > 0 && (
                <div>
                  <span style={labelStyle}>{t.basedOn}</span>
                  <p className="muted-small" dir={dir} style={{ margin: "2px 0 0", fontStyle: "italic" }}>
                    {ins.basedOn.join("; ")}
                  </p>
                </div>
              )}
              {chartsUnder(doc, ins.id).map(chart => (
                <ChartRow key={chart.file} chart={chart} url={chartUrls[chart.file]} doc={doc} dir={dir}
                  warnings={warnings} t={t} onChange={setDraft} />
              ))}
            </div>
          ))}

          {chartsUnder(doc, null).length > 0 && (
            <div style={box}>
              <strong style={{ fontSize: "0.8rem", color: "#e5e7eb" }}>{t.otherChartsHeading}</strong>
              {chartsUnder(doc, null).map(chart => (
                <ChartRow key={chart.file} chart={chart} url={chartUrls[chart.file]} doc={doc} dir={dir}
                  warnings={warnings} t={t} onChange={setDraft} />
              ))}
            </div>
          )}

          {doc.questionAnswers?.length > 0 && (
            <div style={box}>
              <strong style={{ fontSize: "0.8rem", color: "#e5e7eb" }}>{t.answers}</strong>
              {doc.questionAnswers.map(qa => (
                <Field key={qa.id} label={t.answerTo(qa.question)} value={qa.answer} dir={dir} t={t}
                  numbers={warningsAt(warnings, { section: "answer", id: qa.id })}
                  onChange={v => setDraft(setAnswer(doc, qa.id, v))} />
              ))}
            </div>
          )}

          <div style={box}>
            {textField("conclusion")}
            {textField("dataQualitySection")}
            {textField("assumptions")}
          </div>

          <p className="muted-small" style={{ margin: 0 }}>
            <strong>{t.facts}:</strong> {t.factsLine(facts)}
          </p>

          {/* Save bar: stays in view while a long report is edited. */}
          <div style={{ position: "sticky", bottom: 0, display: "flex", flexDirection: "column", gap: "8px", padding: "10px 0 4px", background: "rgba(15,23,42,0.98)" }}>
            {notice && (
              <div role={notice.kind === "ok" ? "status" : "alert"}
                style={{ fontSize: "0.78rem", color: notice.kind === "ok" ? "#bbf7d0" : "#fca5a5", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span>{notice.text}</span>
                {notice.kind === "conflict" && (
                  <button type="button" style={smallBtn} onClick={() => void load()}>{t.reload}</button>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="primary-btn-lg" disabled={!dirty || busy} onClick={() => void save()}
                style={{ width: "auto", marginTop: 0, padding: "8px 18px", opacity: (!dirty || busy) ? 0.5 : 1, cursor: (!dirty || busy) ? "not-allowed" : "pointer" }}>
                {busy ? t.saving : t.save}
              </button>
              <button type="button" className="secondary-btn" disabled={!dirty || busy}
                onClick={() => setDraft(base.document)} style={{ opacity: (!dirty || busy) ? 0.5 : 1 }}>
                {t.discard}
              </button>
              <button type="button" className="secondary-btn" disabled={dirty || busy || undoTo == null}
                title={dirty ? t.undoHint : undefined} onClick={() => void goBackTo(undoTo)}
                style={{ opacity: (dirty || busy || undoTo == null) ? 0.5 : 1 }}>
                ↶ {t.undo}
              </button>
              <button type="button" className="secondary-btn" onClick={() => setShowVersions(s => !s)}>
                {showVersions ? t.hideVersions : `${t.versions} (${versions.length})`}
              </button>
            </div>
            {showVersions && (
              <ul aria-label={t.versions} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflowY: "auto" }}>
                {versions.map(v => (
                  <li key={v.version} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.76rem", color: "#d1d5db", flexWrap: "wrap" }}>
                    <strong>{t.version(v.version)}</strong>
                    <span className="muted-small">
                      {v.byDig ? t.byDig : t.byYou}
                      {v.kind === "restored" && v.restoredFrom ? ` · ${t.restoredFrom(v.restoredFrom)}` : ""}
                      {` · ${new Date(v.createdAt).toLocaleString(lang)}`}
                    </span>
                    {v.version === base.version
                      ? <span className="pill">{t.current}</span>
                      : <button type="button" style={smallBtn} disabled={dirty || busy}
                          title={dirty ? t.undoHint : undefined}
                          aria-label={`${t.goBack}: ${t.version(v.version)}`}
                          onClick={() => void goBackTo(v.version)}>{t.goBack}</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
