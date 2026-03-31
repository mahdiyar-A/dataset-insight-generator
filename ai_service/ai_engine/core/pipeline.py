import io
import base64
import pandas as pd

from ai_engine.quality.quality_checker  import check_data_quality
from ai_engine.quality.confidence_engine import evaluate_confidence
from ai_engine.core.cleaner             import clean_dataset
from ai_engine.core.stats_analyzer      import build_stats_summary
from ai_engine.llm.gemini_client        import call_gemini
from ai_engine.charts.chart_generator   import generate_charts
from ai_engine.pdf.pdf_builder          import build_pdf
from ai_engine.models.models            import PipelineResult


def _load_dataframe(file_bytes: bytes, file_name: str) -> pd.DataFrame:
    name_lower = file_name.lower()
    if name_lower.endswith(".xlsx") or name_lower.endswith(".xls"):
        return pd.read_excel(io.BytesIO(file_bytes))

    # ── CSV / TSV / DSV — try encodings × delimiters ─────────────────────
    # Order matters: utf-8 first, then latin-1/cp1252 for European files
    encodings  = ("utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1")
    # sep=None + engine='python' lets pandas sniff the delimiter automatically.
    # We also try explicit common delimiters as a fallback in case sniffing fails.
    delimiters = [None, ",", ";", "\t", "|", " "]

    last_err = None
    for enc in encodings:
        for sep in delimiters:
            try:
                kwargs = dict(encoding=enc, on_bad_lines="skip")
                if sep is None:
                    # Auto-sniff: pandas examines the first few lines
                    kwargs["sep"]    = None
                    kwargs["engine"] = "python"
                else:
                    kwargs["sep"] = sep
                df = pd.read_csv(io.BytesIO(file_bytes), **kwargs)
                # Reject single-column results for multi-delimiter files
                # (means the wrong separator was used)
                if len(df.columns) == 1 and sep not in (None, " "):
                    continue
                if df.empty or len(df.columns) == 0:
                    continue
                return df
            except (UnicodeDecodeError, pd.errors.ParserError) as e:
                last_err = e
                continue

    raise ValueError(
        f"Could not parse file as a tabular dataset. "
        f"Supported formats: CSV (comma, semicolon, tab, pipe separated), TSV, Excel. "
        f"Last error: {last_err}"
    )


def run_pipeline(
    file_bytes:           bytes,
    file_name:            str,
    user_wants_cleaning:  bool,   # from chatbot yes/no
    user_confirmed_low:   bool,   # from chatbot yes/no on low confidence
    gemini_api_key:       str,
) -> dict:
    """
    Full analysis pipeline. Returns dict matching C# AnalyzeResponseDto.

    Conditions returned:
      not_workable  → dataset is broken/too small
      not_clean     → dataset needs cleaning (user already said yes/no via flag)
      low_accuracy  → low confidence (user already confirmed via flag)
      all_good      → clean dataset, high confidence
    """

    # ── Step 1: Load file ────────────────────────────────────────────────
    try:
        df_original = _load_dataframe(file_bytes, file_name)
    except Exception as e:
        return PipelineResult(
            status="failed", condition="not_workable",
            error=f"Could not read file: {e}",
            cleanedCsvBase64=None, pdfReportBase64=None, charts=[]
        ).to_response()

    # ── Step 2: Quality check ────────────────────────────────────────────
    quality = check_data_quality(df_original)

    if not quality.isUsable:
        return PipelineResult(
            status="failed", condition="not_workable",
            error=f"Dataset cannot be processed: {'; '.join(quality.errors)}",
            cleanedCsvBase64=None, pdfReportBase64=None, charts=[]
        ).to_response()

    # ── Step 3: Cleaning (if user agreed) ───────────────────────────────
    was_cleaned    = False
    cleaned_csv_b64 = None

    if quality.needsCleaning and user_wants_cleaning:
        try:
            df_work     = clean_dataset(df_original, quality)
            was_cleaned = True
            # Re-check quality after cleaning
            quality = check_data_quality(df_work)
            # Encode cleaned CSV as base64
            csv_buf = io.StringIO()
            df_work.to_csv(csv_buf, index=False)
            cleaned_csv_b64 = base64.b64encode(csv_buf.getvalue().encode("utf-8")).decode("utf-8")
        except Exception as e:
            # Cleaning failed — continue with original
            print(f"[Pipeline] Cleaning failed: {e} — continuing with original")
            df_work = df_original
    else:
        df_work = df_original

    # ── Step 4: Confidence check ─────────────────────────────────────────
    confidence = evaluate_confidence(df_work, quality)

    if confidence.requiresUserConfirmation and not user_confirmed_low:
        # User said no to low confidence → cancel
        return PipelineResult(
            status="failed", condition="low_accuracy",
            error="User chose not to proceed with low-confidence dataset.",
            cleanedCsvBase64=None, pdfReportBase64=None, charts=[]
        ).to_response()

    # ── Step 5: Statistical analysis ─────────────────────────────────────
    stats = build_stats_summary(df_work, quality)

    # ── Step 6: LLM — one call for full report + chart instructions ──────
    try:
        llm_report = call_gemini(
            stats=stats,
            confidence_note=confidence.confidenceReason,
            was_cleaned=was_cleaned,
            api_key=gemini_api_key,
        )
    except Exception as e:
        return PipelineResult(
            status="failed", condition="all_good",
            error=f"AI analysis failed: {e}",
            cleanedCsvBase64=cleaned_csv_b64, pdfReportBase64=None, charts=[]
        ).to_response()

    # ── Step 7: Generate charts from LLM instructions ───────────────────
    try:
        charts = generate_charts(df_work, llm_report.chartInstructions)
    except Exception as e:
        print(f"[Pipeline] Chart generation error: {e}")
        charts = []

    # ── Step 8: Build PDF ────────────────────────────────────────────────
    try:
        pdf_b64 = build_pdf(
            report=llm_report,
            charts=charts,
            stats_summary=stats.__dict__,
            was_cleaned=was_cleaned,
            file_name=file_name,
        )
    except Exception as e:
        return PipelineResult(
            status="failed", condition="all_good",
            error=f"PDF generation failed: {e}",
            cleanedCsvBase64=cleaned_csv_b64, pdfReportBase64=None, charts=charts
        ).to_response()

    # ── Step 9: Determine condition label for chatbot ────────────────────
    if quality.needsCleaning and not was_cleaned:
        condition = "not_clean"
    elif confidence.confidenceLevel in ("LOW", "MEDIUM"):
        condition = "low_accuracy"
    else:
        condition = "all_good"

    return PipelineResult(
        status="done",
        condition=condition,
        error=None,
        cleanedCsvBase64=cleaned_csv_b64,
        pdfReportBase64=pdf_b64,
        charts=charts,
    ).to_response()
