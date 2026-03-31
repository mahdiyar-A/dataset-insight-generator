"""
DIG AI Pipeline  —  8-Phase Intelligent Analysis

Phase 0  : Load file + basic quality gate  (Python)
Phase 1  : Groq #1  — domain classification, column decisions, cleaning directives
Phase 2  : Inform user about cleaning / get confirmation  (handled by C# chatbot)
Phase 3  : Context-aware cleaning  (Python, using Groq's directives)
Phase 4  : Enhanced statistical engine  (Python — normality, groups, temporal, IForest)
Phase 5  : Gemini  — insight agent + report writer + chart instructions (no chart images yet)
Phase 6  : Groq #2  — judge: language audit, chart corrections, confidence score 1-10
Phase 7  : Apply judge corrections → generate chart images → build PDF
Phase 8  : Training log

Total LLM calls: 3  (Groq gate → Gemini agent+report → Groq judge)
"""

import io
import base64
import pandas as pd
from typing import Optional, List, Dict, Any

from ai_engine.quality.quality_checker   import check_data_quality
from ai_engine.core.cleaner              import clean_dataset
from ai_engine.core.stats_analyzer       import build_stats_summary
from ai_engine.llm.groq_client           import detect_domain, judge_insights
from ai_engine.llm.gemini_client         import call_gemini
from ai_engine.charts.chart_generator    import generate_charts
from ai_engine.pdf.pdf_builder           import build_pdf
from ai_engine.models.models             import (
    PipelineResult, DomainResult, ChartInstruction, LLMReport
)
from ai_engine.training.training_logger  import log_pipeline_run


# ─────────────────────────────────────────────────────────────────────────────
# File loading
# ─────────────────────────────────────────────────────────────────────────────

def _load_dataframe(file_bytes: bytes, file_name: str) -> pd.DataFrame:
    name_lower = file_name.lower()
    if name_lower.endswith(".xlsx") or name_lower.endswith(".xls"):
        return pd.read_excel(io.BytesIO(file_bytes))

    encodings  = ("utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1")
    delimiters = [None, ",", ";", "\t", "|", " "]
    last_err   = None

    for enc in encodings:
        for sep in delimiters:
            try:
                kwargs = dict(encoding=enc, on_bad_lines="skip")
                if sep is None:
                    kwargs["sep"]    = None
                    kwargs["engine"] = "python"
                else:
                    kwargs["sep"] = sep
                df = pd.read_csv(io.BytesIO(file_bytes), **kwargs)
                if len(df.columns) == 1 and sep not in (None, " "):
                    continue
                if df.empty or len(df.columns) == 0:
                    continue
                return df
            except (UnicodeDecodeError, pd.errors.ParserError) as e:
                last_err = e
                continue

    raise ValueError(
        f"Could not parse file as tabular data. "
        f"Supported: CSV (comma/semicolon/tab/pipe), TSV, Excel (.xlsx/.xls). "
        f"Last error: {last_err}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Judge correction merger
# ─────────────────────────────────────────────────────────────────────────────

def _apply_judge_corrections(report: LLMReport, judge) -> LLMReport:
    """
    Merge judge's corrections back into the LLMReport in place.
    Judge returns corrected_insights and corrected_chart_instructions
    as full replacement lists (None = nothing changed).
    """
    # Replace conclusion with judge's refined version
    if judge.conclusion:
        report.conclusion = judge.conclusion

    # Replace insights if judge corrected any
    if judge.corrected_insights:
        # Build a lookup by rank
        by_rank = {ins.get("rank"): ins for ins in judge.corrected_insights}
        report.insights = [
            by_rank.get(ins.get("rank"), ins)
            for ins in report.insights
        ]

    # Replace chart instructions if judge corrected any
    if judge.corrected_chart_instructions:
        from ai_engine.llm.gemini_client import CHART_COLORS, VALID_CHART_TYPES
        corrected: List[ChartInstruction] = []
        by_index = {c.get("index"): c for c in judge.corrected_chart_instructions}
        for i, instr in enumerate(report.chartInstructions):
            if instr.index in by_index:
                c = by_index[instr.index]
                ct = c.get("chart_type", instr.chartType).lower()
                if ct not in VALID_CHART_TYPES:
                    ct = instr.chartType
                corrected.append(ChartInstruction(
                    index=instr.index,
                    chartType=ct,
                    title=c.get("title", instr.title),
                    xColumn=c.get("x_column", instr.xColumn),
                    yColumn=c.get("y_column", instr.yColumn) or None,
                    description=c.get("description", instr.description),
                    insightIndex=c.get("insight_index", instr.insightIndex),
                    color=CHART_COLORS[i % len(CHART_COLORS)],
                ))
            else:
                corrected.append(instr)
        report.chartInstructions = corrected

    return report


# ─────────────────────────────────────────────────────────────────────────────
# Main pipeline
# ─────────────────────────────────────────────────────────────────────────────

def run_pipeline(
    file_bytes:          bytes,
    file_name:           str,
    user_wants_cleaning: bool,
    user_confirmed_low:  bool,
    gemini_api_key:      str,
    groq_api_key:        str = "",
    session_id:          str = "",
) -> dict:
    """
    Full 8-phase analysis pipeline. Returns dict matching C# AnalyzeResponseDto.
    """

    # ── Phase 0: Load + basic quality gate ───────────────────────────────
    try:
        df_original = _load_dataframe(file_bytes, file_name)
    except Exception as e:
        return _fail("not_workable", f"Could not read file: {e}")

    quality = check_data_quality(df_original)
    if not quality.isUsable:
        return _fail("not_workable", f"Dataset cannot be processed: {'; '.join(quality.errors)}")

    # ── Phase 1: Groq — domain, column decisions, cleaning directives ─────
    domain = _run_domain_gate(df_original, groq_api_key)

    if not domain.is_analyzable:
        return _fail("not_workable", f"Dataset rejected: {domain.rejection_reason}")

    # Columns Groq said to drop
    groq_drops   = domain.column_decisions.get("drop", [])
    groq_methods = domain.cleaning_methods

    # ── Phase 2: Cleaning gate ────────────────────────────────────────────
    # User interaction handled by C# chatbot — we receive user_wants_cleaning as a flag.
    # Confidence is determined later by Gemini (Phase 5) and audited by Groq judge (Phase 6).

    # ── Phase 3: Context-aware cleaning ───────────────────────────────────
    was_cleaned     = False
    cleaned_csv_b64 = None
    df_work         = df_original
    dropped_columns = list(groq_drops)   # track what was actually dropped for PDF

    if quality.needsCleaning and user_wants_cleaning:
        try:
            df_work     = clean_dataset(
                df_original, quality,
                groq_drop_columns=groq_drops,
                groq_methods=groq_methods,
            )
            was_cleaned = True
            quality     = check_data_quality(df_work)
            csv_buf     = io.StringIO()
            df_work.to_csv(csv_buf, index=False)
            cleaned_csv_b64 = base64.b64encode(
                csv_buf.getvalue().encode("utf-8")
            ).decode("utf-8")
        except Exception as e:
            print(f"[Pipeline] Cleaning failed: {e} — continuing with original")
            df_work = df_original
    elif groq_drops:
        # Even if user didn't request cleaning, drop the irrelevant columns
        cols_to_drop = [c for c in groq_drops if c in df_work.columns]
        if cols_to_drop:
            df_work = df_work.drop(columns=cols_to_drop)

    # ── Phase 4: Enhanced statistical engine ─────────────────────────────
    stats = build_stats_summary(df_work, quality)

    # ── Phase 5: Gemini — insights + report + chart instructions ─────────
    try:
        llm_report = call_gemini(
            stats=stats,
            domain=domain,
            was_cleaned=was_cleaned,
            dropped_columns=dropped_columns,
            api_key=gemini_api_key,
        )
    except Exception as e:
        _log(stats, domain, None, was_cleaned, user_wants_cleaning, 0, 0,
             "failed", str(e), session_id, groq_drops, groq_methods, [], {})
        return PipelineResult(
            status="failed", condition="all_good",
            error=f"AI analysis failed: {e}",
            cleanedCsvBase64=cleaned_csv_b64, pdfReportBase64=None, charts=[],
        ).to_response()

    # Build the report dict to send to judge (before chart generation)
    report_for_judge = {
        "report_title":   llm_report.reportTitle,
        "executive_summary": llm_report.executiveSummary,
        "insights":       llm_report.insights,
        "chart_instructions": [
            {
                "index":        c.index,
                "chart_type":   c.chartType,
                "title":        c.title,
                "x_column":     c.xColumn,
                "y_column":     c.yColumn,
                "description":  c.description,
                "insight_index": c.insightIndex,
            }
            for c in llm_report.chartInstructions
        ],
        "conclusion": llm_report.conclusion,
    }

    # ── Phase 6: Groq judge — audit, corrections, confidence score ────────
    judge = _run_judge(
        report_for_judge, stats, domain.domain,
        domain.attribute_interpretations,
        list(df_work.columns),
        groq_api_key,
    )

    # ── Apply judge corrections to report ─────────────────────────────────
    llm_report = _apply_judge_corrections(llm_report, judge)

    # Set the final confidence note combining judge statement + Gemini note
    if judge.judge_statement:
        llm_report.confidenceNote = judge.judge_statement
        if llm_report.confidenceNote and llm_report.confidenceNote:
            # Append Gemini's note as supporting detail
            gemini_note = llm_report.confidenceNote
            llm_report.confidenceNote = judge.judge_statement

    # ── Phase 7: Chart generation (post-judge, using corrected instructions) ──
    try:
        charts = generate_charts(df_work, llm_report.chartInstructions)
    except Exception as e:
        print(f"[Pipeline] Chart generation error: {e}")
        charts = []

    chart_types_chosen = [c.chartType for c in llm_report.chartInstructions]
    judge_changes = {
        "issues": judge.issues,
        "corrected_insights":      bool(judge.corrected_insights),
        "corrected_charts":        bool(judge.corrected_chart_instructions),
    }

    # ── PDF build ─────────────────────────────────────────────────────────
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

    return PipelineResult(
        status="done",
        condition=condition,
        error=None,
        cleanedCsvBase64=cleaned_csv_b64,
        pdfReportBase64=pdf_b64,
        charts=charts,
        lowConfidenceWarning=low_conf_warning,
        confidenceScore=final_score,
    ).to_response()


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fail(condition: str, error: str) -> dict:
    return PipelineResult(
        status="failed", condition=condition, error=error,
        cleanedCsvBase64=None, pdfReportBase64=None, charts=[],
    ).to_response()


def _run_domain_gate(df: pd.DataFrame, groq_api_key: str) -> DomainResult:
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
        return detect_domain(df, groq_api_key)
    except Exception as e:
        print(f"[Pipeline] Domain gate error: {e} — using fallback")
        return _run_domain_gate(df, "")   # recurse with empty key → fallback


def _run_judge(
    report_json: dict,
    stats,
    domain: str,
    attribute_interpretations: dict,
    valid_columns: list,
    groq_api_key: str,
):
    if not groq_api_key:
        print("[Pipeline] GROQ_API_KEY not set — skipping judge")
        from ai_engine.models.models import JudgeResult
        return JudgeResult(
            confidence_score=6,
            confidence_level="MEDIUM",
            overall_confidence=0.6,
            issues=[],
            judge_statement="Analysis completed. Results reflect statistical patterns in the provided dataset.",
            conclusion="",
            corrected_insights=None,
            corrected_chart_instructions=None,
            proceed=True,
        )
    try:
        return judge_insights(
            report_json, stats, domain,
            attribute_interpretations, valid_columns, groq_api_key
        )
    except Exception as e:
        print(f"[Pipeline] Judge error: {e}")
        return _run_judge(report_json, stats, domain, attribute_interpretations, valid_columns, "")


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
