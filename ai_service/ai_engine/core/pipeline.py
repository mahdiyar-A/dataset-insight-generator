"""
DIG AI Pipeline  —  8-Phase Intelligent Analysis

Phase 0  : Load file + basic quality gate  (Python)
Phase 1  : Groq #1  — domain classification, column decisions, cleaning directives
Phase 2  : Inform user about cleaning / get confirmation  (handled by C# chatbot)
Phase 3  : Context-aware cleaning  (Python, using Groq's directives)
Phase 4  : Enhanced statistical engine  (Python — normality, groups, temporal, IForest)
Phase 5  : Report writer — free open-weight models via OpenRouter / Groq (see llm/report_writer.py)
Phase 6  : Groq #2  — judge: language audit, chart corrections, confidence score 1-10
Phase 7  : Apply judge corrections → generate chart images → build PDF
Phase 8  : Training log

Total LLM calls: 3  (Groq gate → report writer → Groq judge)
"""

import io
import json
import base64
import pandas as pd
from typing import Optional, List, Dict, Any

from ai_engine.ingest                    import load_table, UnsupportedFile
from ai_engine.quality.quality_checker   import check_data_quality
from ai_engine.core.cleaner              import clean_dataset, droppable_columns, what_cleaning_did
from ai_engine.core.stats_analyzer       import build_stats_summary
from ai_engine.llm.groq_client           import detect_domain
from ai_engine.core.confidence          import assess_confidence, split_misleading_scatters, validate_chart_instructions
from ai_engine.llm.insight_agent         import generate_report, MAX_INSIGHTS, MIN_INSIGHTS, MAX_QUESTIONS
from ai_engine.llm.stats_digest          import build_digest
from ai_engine.charts.chart_generator    import generate_charts
from ai_engine.pdf.pdf_builder           import build_pdf
from ai_engine.report_labels             import left_out_line
from ai_engine.models.models             import (
    PipelineResult, DomainResult, ChartInstruction, LLMReport
)
from ai_engine.training.training_logger  import log_pipeline_run

# Optional Pro output builders — guarded imports so the pipeline still works
# if python-docx / python-pptx are not installed in the container yet
try:
    from ai_engine.word.word_builder import build_word_doc
    WORD_AVAILABLE = True
except ImportError:
    WORD_AVAILABLE = False
    print("[Pipeline] python-docx not installed — Word export disabled", flush=True)

try:
    from ai_engine.pptx.pptx_builder import build_pptx
    PPTX_AVAILABLE = True
except ImportError:
    PPTX_AVAILABLE = False
    print("[Pipeline] python-pptx not installed — PPTX export disabled", flush=True)


# ─────────────────────────────────────────────────────────────────────────────
# Customization
# ─────────────────────────────────────────────────────────────────────────────

WRITING_FORMATS = ("narrative", "bullets", "mixed")


def _int_in(value: Any, low: int, high: int, default: int) -> int:
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def parse_questions(raw: Any) -> List[Dict[str, str]]:
    """
    The user's own questions, as [{"question", "note"}].

    Accepts a list of strings or of objects, or that list as a JSON string
    (the form field). Anything else is ignored rather than failing the run.
    """
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return []
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = [raw]
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, str]] = []
    for item in raw:
        if isinstance(item, str):
            item = {"question": item}
        if not isinstance(item, dict):
            continue
        question = str(item.get("question") or "").strip()
        if question:
            out.append({"question": question, "note": str(item.get("note") or "").strip()})
        if len(out) >= MAX_QUESTIONS:
            break
    return out


def _chat_context(stats, domain, report, columns: List[str], source: Dict[str, Any],
                  set_aside: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    What the chat needs to answer questions after the analysis: the digest the
    report was written from, the report's own words, and the column list.

    Kept small (tens of kilobytes) because the backend stores one per analysis
    and sends it back with every question.
    """
    return {
        "version": 1,
        "digest": build_digest(stats, domain),
        "columns": [{"name": str(c), "type": stats.columnTypes.get(str(c), "")} for c in columns][:200],
        "columnsLeftOutOfTheReport": [str(c) for c in (set_aside or [])][:50],
        "file": {k: source.get(k) for k in ("format", "formatLabel", "notes") if source.get(k)},
        "report": {
            "title": report.reportTitle,
            "summary": report.executiveSummary,
            "insights": [{"rank": i.get("rank"), "title": i.get("title"), "body": i.get("body")}
                         for i in report.insights],
            "conclusion": report.conclusion,
            "questionAnswers": report.questionAnswers,
            "assumptions": report.assumptions,
            "writer": report.writerModel,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Judge correction merger
# ─────────────────────────────────────────────────────────────────────────────


# ─────────────────────────────────────────────────────────────────────────────
# Main pipeline
# ─────────────────────────────────────────────────────────────────────────────

def run_pipeline(
    file_bytes:          bytes,
    file_name:           str,
    user_wants_cleaning: bool,
    user_confirmed_low:  bool,
    openrouter_api_key:  str = "",
    groq_api_key:        str = "",
    session_id:          str = "",
    customization:       Optional[Dict[str, Any]] = None,
) -> dict:
    """
    Full 8-phase analysis pipeline. Returns dict matching C# AnalyzeResponseDto.

    customization (Pro users only, all optional):
      language       — "en" | "fr" | "es" | "de" | "zh" | "ar" | "pt"
      tone           — "professional" | "casual" | "simplified" | "technical" | "storytelling"
      insightsCount  — 3 | 5 | 7
      occasion       — "general" | "academic" | "business" | "personal" | "industry"
      outputFormat   — { "pdf": bool, "word": bool, "pptx": bool }
    """
    # Per-request usage accounting. Created here rather than module-level
    # because FastAPI serves requests concurrently — a global would pool the
    # token spend of two analyses running at once.
    from ai_engine.telemetry.usage import UsageTracker
    tracker = UsageTracker()

    # Parse customization with safe defaults
    cust         = customization or {}
    language     = cust.get("language",     "en")
    tone         = cust.get("tone",         "professional")
    insights_count = _int_in(cust.get("insightsCount", 5), MIN_INSIGHTS, MAX_INSIGHTS, 5)
    occasion     = cust.get("occasion",     "general")
    audience     = cust.get("audience",     "general")
    depth        = cust.get("depth",        "standard")
    focus_on     = cust.get("focusOn",      "").strip()
    comparisons  = cust.get("comparisons",  "").strip()
    must_mention = cust.get("mustMention")  # list or None
    if isinstance(must_mention, str):
        must_mention = [m.strip() for m in must_mention.split(",") if m.strip()]
    chart_style  = cust.get("chartStyle",   "mixed")
    assumptions  = str(cust.get("assumptions") or "").strip()
    avoid        = str(cust.get("avoid") or "").strip()
    questions    = parse_questions(cust.get("questions"))
    writing_format = cust.get("writingFormat") or "narrative"
    if writing_format not in WRITING_FORMATS:
        writing_format = "narrative"
    include_methodology = bool(cust.get("includeMethodology", True))
    include_confidence  = bool(cust.get("includeConfidence",  True))
    output_fmt   = cust.get("outputFormat") or {}
    want_word    = bool(output_fmt.get("word", False))
    want_pptx    = bool(output_fmt.get("pptx", False))
    # PDF is always generated

    print(
        f"[Pipeline] Customization — lang={language} tone={tone} audience={audience} "
        f"depth={depth} insights={insights_count} occasion={occasion} "
        f"chartStyle={chart_style} word={want_word} pptx={want_pptx}",
        flush=True
    )
    if focus_on:   print(f"[Pipeline]   focusOn:    {focus_on[:80]}", flush=True)
    if comparisons:print(f"[Pipeline]   comparisons:{comparisons[:80]}", flush=True)
    if must_mention:print(f"[Pipeline]   mustMention:{must_mention}", flush=True)
    if assumptions: print(f"[Pipeline]   assumptions:{assumptions[:80]}", flush=True)
    if avoid:       print(f"[Pipeline]   avoid:      {avoid[:80]}", flush=True)
    if questions:   print(f"[Pipeline]   questions:  {len(questions)}", flush=True)
    if writing_format != "narrative": print(f"[Pipeline]   format:     {writing_format}", flush=True)

    # ── Phase 0: Load + basic quality gate ───────────────────────────────
    print(f"[Pipeline] Phase 0 — Loading file: {file_name}", flush=True)
    try:
        table = load_table(file_bytes, file_name)
    except UnsupportedFile as e:
        return _fail("not_workable", str(e))
    except Exception as e:
        print(f"[Pipeline] Unexpected error reading {file_name}: {type(e).__name__}: {e}", flush=True)
        return _fail("not_workable", "The file could not be read.")
    df_original = table.df
    source_file = table.summary(preview_rows=0)
    source_file = {k: source_file[k] for k in ("format", "formatLabel", "detail", "notes")}

    print(f"[Pipeline] Loaded {len(df_original):,} rows × {len(df_original.columns)} cols "
          f"as {table.format} {table.detail}", flush=True)
    for note in table.notes:
        print(f"[Pipeline]   {note}", flush=True)
    quality = check_data_quality(df_original)
    if not quality.isUsable:
        return _fail("not_workable", f"Dataset cannot be processed: {'; '.join(quality.errors)}")

    # ── Phase 1: Groq — domain, column decisions, cleaning directives ─────
    print(f"[Pipeline] Phase 1 — Groq domain classification...", flush=True)
    domain = _run_domain_gate(df_original, groq_api_key, tracker)
    print(f"[Pipeline] Domain: {domain.domain} | analyzable: {domain.is_analyzable}", flush=True)

    if not domain.is_analyzable:
        return _fail("not_workable", f"Dataset rejected: {domain.rejection_reason}")

    # Columns Groq said to drop
    suggested    = domain.column_decisions.get("drop", [])
    groq_drops   = droppable_columns(df_original, suggested)
    kept_back    = [c for c in suggested if c not in groq_drops]
    groq_methods = [m for m in domain.cleaning_methods
                    if not m.startswith("drop_column:")
                    or m.split(":", 1)[1] in droppable_columns(df_original, [m.split(":", 1)[1]])]
    if kept_back:
        print(f"[Pipeline] Kept column(s) the model suggested dropping: {kept_back}", flush=True)
        domain.column_decisions["drop"] = groq_drops
        domain.column_decisions.setdefault("keep", []).extend(kept_back)

    # ── Phase 2: Cleaning gate ────────────────────────────────────────────
    # User interaction handled by C# chatbot — we receive user_wants_cleaning as a flag.
    # Confidence is determined later by the report writer (Phase 5) and audited by the Groq judge (Phase 6).

    # ── Phase 3: Context-aware cleaning ───────────────────────────────────
    print(f"[Pipeline] Phase 3 — Cleaning (user_wants={user_wants_cleaning}, needs={quality.needsCleaning})...", flush=True)
    was_cleaned     = False
    cleaned_csv_b64 = None
    df_work         = df_original
    dropped_columns = list(groq_drops)   # track what was actually dropped for PDF

    if quality.needsCleaning and user_wants_cleaning:
        try:
            # The whole file is cleaned, and the cleaned download keeps every
            # column. What the model set aside only leaves the analysis.
            cleaned     = clean_dataset(df_original, quality)
            set_aside   = [c for c in groq_drops if c in cleaned.columns]
            was_cleaned = True
            domain.cleaning_methods = groq_methods = (
                what_cleaning_did(df_original, cleaned) + [f"drop_column:{c}" for c in set_aside])
            quality     = check_data_quality(cleaned)
            csv_buf     = io.StringIO()
            cleaned.to_csv(csv_buf, index=False)
            cleaned_csv_b64 = base64.b64encode(
                csv_buf.getvalue().encode("utf-8")
            ).decode("utf-8")
            df_work     = cleaned.drop(columns=set_aside)
        except Exception as e:
            print(f"[Pipeline] Cleaning failed: {e} — continuing with original")
            df_work = df_original
    elif groq_drops:
        # Even if user didn't request cleaning, drop the irrelevant columns
        cols_to_drop = [c for c in groq_drops if c in df_work.columns]
        if cols_to_drop:
            df_work = df_work.drop(columns=cols_to_drop)

    # ── Phase 4: Enhanced statistical engine ─────────────────────────────
    print(f"[Pipeline] Phase 4 — Statistical engine running on {len(df_work):,} rows...", flush=True)
    # The domain reaches the statistics, not just the narrative. Until now it
    # only flavoured the wording of the insight prompt, so every dataset got an
    # identical set of computations regardless of what it was.
    stats = build_stats_summary(df_work, quality, domain=domain.domain,
                                type_conversions=table.conversions, source_file=source_file)
    print(f"[Pipeline] Stats done. Numeric cols: {len(stats.numericStats)}, Correlations: {len(stats.topCorrelations)}", flush=True)

    # ── Phase 5: report writer — insights + report + chart instructions ──
    print(f"[Pipeline] Phase 5 — report writer...", flush=True)
    # generate_report never raises — if every model fails it returns a stats-only fallback report.
    # The outer try/except is a last-resort safety net.
    try:
        llm_report = generate_report(
            stats=stats,
            domain=domain,
            was_cleaned=was_cleaned,
            dropped_columns=dropped_columns,
            api_keys={"openrouter": openrouter_api_key, "groq": groq_api_key},
            language=language,
            tone=tone,
            insights_count=insights_count,
            occasion=occasion,
            audience=audience,
            depth=depth,
            focus_on=focus_on,
            comparisons=comparisons,
            must_mention=must_mention,
            chart_style=chart_style,
            include_methodology=include_methodology,
            include_confidence=include_confidence,
            tracker=tracker,
            assumptions=assumptions,
            questions=questions,
            writing_format=writing_format,
            avoid=avoid,
        )
    except Exception as e:
        # This should not happen, but if it does — build fallback inline
        print(f"[Pipeline] Unexpected report-writer exception: {e} — building fallback report")
        from ai_engine.llm.insight_agent import _build_fallback_report
        llm_report = _build_fallback_report(stats, domain)

    # Said here, not left to the writer: the report must not pass for the whole
    # file when part of it was never read.
    left_out = left_out_line(table.detail, language)
    if left_out:
        llm_report.dataQualitySection = f"{llm_report.dataQualitySection}\n\n{left_out}".strip()

    print(f"[Pipeline] Phase 5 done. Insights: {len(llm_report.insights)}, Charts: {len(llm_report.chartInstructions)}", flush=True)

    # ── Phase 6: confidence, from the statistics (no model call) ─────────
    # Was an LLM judge on Groq. It cost 6-20s per analysis waiting on the free
    # tier's per-minute token budget, and had a weaker model audit a stronger
    # one. See ai_engine/core/confidence.py.
    print(f"[Pipeline] Phase 6 — statistical confidence check...", flush=True)
    llm_report.chartInstructions, chart_issues = validate_chart_instructions(
        llm_report.chartInstructions, list(df_work.columns))
    split_misleading_scatters(llm_report.chartInstructions, stats)
    judge = assess_confidence(stats, chart_issues)
    llm_report.confidenceNote = judge.judge_statement
    print(f"[Pipeline] Phase 6 done. Confidence: {judge.confidence_score}/10 ({judge.confidence_level})", flush=True)

    # ── Phase 7: Chart generation (using validated instructions) ─────────
    print(f"[Pipeline] Phase 7 — Generating {len(llm_report.chartInstructions)} chart(s)...", flush=True)
    try:
        charts = generate_charts(df_work, llm_report.chartInstructions)
    except Exception as e:
        print(f"[Pipeline] Chart generation error: {e}", flush=True)
        charts = []
    print(f"[Pipeline] Charts done: {len(charts)} generated", flush=True)

    chart_types_chosen = [c.chartType for c in llm_report.chartInstructions]
    judge_changes = {
        "issues": judge.issues,
        "corrected_insights":      bool(judge.corrected_insights),
        "corrected_charts":        bool(judge.corrected_chart_instructions),
    }

    # ── PDF build ─────────────────────────────────────────────────────────
    print(f"[Pipeline] Phase 7 — Building PDF...", flush=True)
    try:
        pdf_b64 = build_pdf(
            report=llm_report,
            charts=charts,
            stats_summary=stats.__dict__,
            was_cleaned=was_cleaned,
            file_name=file_name,
            domain=domain,
            judge_confidence_score=judge.confidence_score if judge else 6,
            judge_confidence_level=judge.confidence_level if judge else "MEDIUM",
            dropped_columns=dropped_columns,
            language=language,
        )
    except Exception as e:
        _log(stats, domain, judge, was_cleaned, user_wants_cleaning,
             len(llm_report.insights), len(charts),
             "failed", str(e), session_id, groq_drops, groq_methods,
             chart_types_chosen, judge_changes)
        return PipelineResult(
            status="failed", condition="all_good",
            error=f"PDF generation failed: {e}",
            cleanedCsvBase64=cleaned_csv_b64, pdfReportBase64=None, charts=charts,
        ).to_response()

    print(f"[Pipeline] PDF built successfully.", flush=True)

    # ── Phase 7b: Word report (Pro — if requested) ────────────────────────
    word_b64 = None
    if want_word:
        if WORD_AVAILABLE:
            print(f"[Pipeline] Generating Word report...", flush=True)
            try:
                word_bytes = build_word_doc(llm_report, file_name=file_name, domain=domain.domain,
                                            charts=charts, language=language,
                                            confidence_score=judge.confidence_score)
                import base64 as _b64
                word_b64 = _b64.b64encode(word_bytes).decode("utf-8")
                print(f"[Pipeline] Word report generated ({len(word_bytes):,} bytes)", flush=True)
            except Exception as e:
                print(f"[Pipeline] Word generation failed: {e} — skipping", flush=True)
        else:
            print("[Pipeline] Word requested but python-docx not available — skipping", flush=True)

    # ── Phase 7c: PPTX (Pro — if requested) ──────────────────────────────
    pptx_b64 = None
    if want_pptx:
        if PPTX_AVAILABLE:
            print(f"[Pipeline] Generating PowerPoint...", flush=True)
            try:
                pptx_bytes = build_pptx(llm_report, file_name=file_name, domain=domain.domain,
                                        charts=charts, language=language,
                                        confidence_score=judge.confidence_score)
                import base64 as _b64
                pptx_b64 = _b64.b64encode(pptx_bytes).decode("utf-8")
                print(f"[Pipeline] PPTX generated ({len(pptx_bytes):,} bytes)", flush=True)
            except Exception as e:
                print(f"[Pipeline] PPTX generation failed: {e} — skipping", flush=True)
        else:
            print("[Pipeline] PPTX requested but python-pptx not available — skipping", flush=True)

    # ── Phase 8: Training log ─────────────────────────────────────────────
    _log(stats, domain, judge, was_cleaned, user_wants_cleaning,
         len(llm_report.insights), len(charts),
         "done", None, session_id, groq_drops, groq_methods,
         chart_types_chosen, judge_changes)

    # ── Condition label ───────────────────────────────────────────────────
    final_score = judge.confidence_score if judge else 6
    LOW_CONFIDENCE_THRESHOLD = 4   # score <= this triggers user advisory

    if quality.needsCleaning and not was_cleaned:
        condition = "not_clean"
    elif judge and judge.confidence_level == "LOW":
        condition = "low_accuracy"
    else:
        condition = "all_good"

    # Low confidence advisory — report IS generated, but C# asks user if they want to see it
    low_conf_warning = final_score <= LOW_CONFIDENCE_THRESHOLD

    chat_context = None
    try:
        chat_context = _chat_context(stats, domain, llm_report, list(df_work.columns), source_file,
                                     dropped_columns)
    except Exception as e:  # the chat is an extra; it must never fail the report
        print(f"[Pipeline] Chat context failed (ignored): {e}", flush=True)

    print(f"[Pipeline] Done. Status=done, condition={condition}, low_conf={low_conf_warning}", flush=True)
    print(tracker.summary_line(), flush=True)
    return PipelineResult(
        status="done",
        condition=condition,
        error=None,
        cleanedCsvBase64=cleaned_csv_b64,
        pdfReportBase64=pdf_b64,
        wordReportBase64=word_b64,
        pptxReportBase64=pptx_b64,
        charts=charts,
        lowConfidenceWarning=low_conf_warning,
        confidenceScore=final_score,
        usage=tracker.to_dict(),
        chatContext=chat_context,
    ).to_response()


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fail(condition: str, error: str) -> dict:
    return PipelineResult(
        status="failed", condition=condition, error=error,
        cleanedCsvBase64=None, pdfReportBase64=None, charts=[],
    ).to_response()


def _run_domain_gate(df: pd.DataFrame, groq_api_key: str, tracker=None) -> DomainResult:
    if not groq_api_key:
        print("[Pipeline] GROQ_API_KEY not set — using general domain fallback")
        numeric_cols = df.select_dtypes(include="number").columns.tolist()[:5]
        return DomainResult(
            domain="general",
            confidence=0.5,
            is_analyzable=True,
            analysis_focus=["statistical patterns", "correlations", "distributions", "outliers"],
            key_questions=[
                "What are the dominant patterns in this dataset?",
                "Which attributes show the strongest relationships?",
                "Are there significant anomalies affecting the analysis?",
                "What does the distribution of primary metrics reveal?",
            ],
            column_decisions={
                "drop": [],
                "keep": df.select_dtypes(include=["object", "category"]).columns.tolist()[:5],
                "key":  numeric_cols,
            },
            attribute_interpretations={
                col: col.replace("_", " ").lower() for col in df.columns[:10]
            },
            cleaning_needed=True,
            cleaning_methods=["remove_empty_rows", "remove_duplicates", "remove_infinity"],
        )
    try:
        return detect_domain(df, groq_api_key, tracker)
    except Exception as e:
        print(f"[Pipeline] Domain gate error: {e} — using fallback")
        return _run_domain_gate(df, "", tracker)   # recurse with empty key → fallback


def _log(stats, domain, judge, was_cleaned, user_wanted_clean,
         insight_count, chart_count, status, error,
         session_id, groq_drops, groq_methods, chart_types, judge_changes):
    try:
        log_pipeline_run(
            stats=stats,
            domain=domain,
            judge=judge,
            was_cleaned=was_cleaned,
            user_wanted_clean=user_wanted_clean,
            insight_count=insight_count,
            chart_count=chart_count,
            status=status,
            error=error,
            session_id=session_id,
            column_decisions=domain.column_decisions if domain else None,
            cleaning_methods=groq_methods,
            chart_types=chart_types,
            judge_changes=judge_changes,
        )
    except Exception as e:
        print(f"[Pipeline] Training log error: {e}")
