import os
import json
import time
import hashlib
import threading
from collections import OrderedDict
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from ai_engine.core.pipeline import run_pipeline, parse_questions
from ai_engine.ingest import load_table, UnsupportedFile
from ai_engine.quality.quality_checker import check_data_quality, impossible_values
from ai_engine.quality.confidence_engine import evaluate_confidence
from ai_engine.training.training_logger import get_training_stats
from ai_engine.llm.harness import answer_question, build_brief

# ── Startup banner ────────────────────────────────────────────────────────────
print("╔══════════════════════════════════════════════╗", flush=True)
print("║   DIG — AI Engine  ·  FastAPI  ·  Port 8000 ║", flush=True)
print("║   Python  ·  7-Phase Analysis Pipeline      ║", flush=True)
print("╚══════════════════════════════════════════════╝", flush=True)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY",   "")
API_KEYS       = {"openrouter": OPENROUTER_API_KEY, "groq": GROQ_API_KEY}

print(f"[AI] OpenRouter key : {'✓ set' if OPENROUTER_API_KEY else '✗ NOT SET — reports fall back to Groq only'}", flush=True)
print(f"[AI] Groq key   : {'✓ set' if GROQ_API_KEY   else '✗ NOT SET — domain gate will use fallback'}", flush=True)

app = FastAPI(title="DIG AI Engine", version="2.1.0")


# ── Warm-up ───────────────────────────────────────────────────────────────────
# The first analysis after a restart paid about 2.5 s for importing
# scikit-learn and starting its thread pools. A tiny fit in the background at
# startup moves that cost off the first user's analysis.
def _warm_up() -> None:
    try:
        started = time.perf_counter()
        import numpy as np
        from sklearn.ensemble import HistGradientBoostingRegressor, IsolationForest
        x = np.random.default_rng(0).normal(size=(200, 3))
        HistGradientBoostingRegressor(max_iter=5).fit(x, x[:, 0])
        IsolationForest(n_estimators=5, random_state=0).fit(x)
        print(f"[AI] warm-up done in {time.perf_counter() - started:.1f}s", flush=True)
    except Exception as e:
        print(f"[AI] warm-up skipped: {e}", flush=True)


@app.on_event("startup")
def _start_warm_up() -> None:
    threading.Thread(target=_warm_up, daemon=True, name="warm-up").start()


# ── Request logging middleware ────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    ts    = datetime.now().strftime("%H:%M:%S.%f")[:12]
    start = time.perf_counter()
    print(f"[{ts}] [HTTP] → {request.method} {request.url.path}", flush=True)
    response = await call_next(request)
    elapsed  = (time.perf_counter() - start) * 1000
    status   = response.status_code
    symbol   = "✓" if status < 400 else "✗"
    print(f"[{ts}] [HTTP] {symbol} {status} {request.url.path}  ({elapsed:.0f}ms)", flush=True)
    return response


# ── Helpers ───────────────────────────────────────────────────────────────────
def _column_kinds(df) -> list:
    import pandas as pd
    kinds = []
    for col in df.columns:
        s = df[col]
        if pd.api.types.is_bool_dtype(s):
            kind = "bool"
        elif pd.api.types.is_numeric_dtype(s):
            kind = "number"
        elif pd.api.types.is_datetime64_any_dtype(s):
            kind = "date"
        else:
            kind = "text"
        kinds.append({"name": str(col), "kind": kind})
    return kinds


def _json_form(raw: str, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except ValueError:
        return default


# Tables the chat has queried recently, keyed by a hash of the file's bytes.
# A conversation asks several questions of the same file; parsing it once
# per question would make every answer wait on the file again.
_TABLE_CACHE: "OrderedDict[str, object]" = OrderedDict()
_TABLE_CACHE_SIZE = 3
_table_cache_lock = threading.Lock()


def _cached_table(file_bytes: bytes, file_name: str):
    key = hashlib.sha256(file_bytes).hexdigest()
    with _table_cache_lock:
        if key in _TABLE_CACHE:
            _TABLE_CACHE.move_to_end(key)
            return _TABLE_CACHE[key]
    table = load_table(file_bytes, file_name)
    with _table_cache_lock:
        _TABLE_CACHE[key] = table
        while len(_TABLE_CACHE) > _TABLE_CACHE_SIZE:
            _TABLE_CACHE.popitem(last=False)
    return table


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    print("[Health] Health check requested", flush=True)
    return {
        "status":          "ok",
        "version":         "2.1.0",
        "openrouter_key_set": bool(OPENROUTER_API_KEY),
        "groq_key_set":    bool(GROQ_API_KEY),
        "pipeline":        "7-phase (Groq gate → free report-writer chain → statistical confidence)",
    }


@app.get("/training-stats")
def training_stats():
    """Returns a summary of the local training log."""
    print("[TrainingStats] Fetching training stats", flush=True)
    return JSONResponse(get_training_stats())


@app.post("/inspect")
async def inspect(
    file: UploadFile = File(...),
):
    """
    What the upload form shows before anything runs: the format the file was
    read as, its shape, its headers and first rows. No model calls.

    The browser previews CSV itself, but cannot open Parquet, SPSS or a
    database, so the backend asks here for every upload and stores the answer.
    """
    file_bytes = await file.read()
    name = file.filename or "dataset"
    print(f"[Inspect] {name}: {len(file_bytes):,} bytes", flush=True)
    try:
        table = load_table(file_bytes, name)
    except UnsupportedFile as e:
        print(f"[Inspect] ✗ {e}", flush=True)
        return JSONResponse({"ok": False, "error": str(e)})
    except Exception as e:
        print(f"[Inspect] ✗ unexpected: {type(e).__name__}: {e}", flush=True)
        return JSONResponse({"ok": False, "error": "The file could not be read."})
    summary = table.summary(preview_rows=5)
    summary["columnKinds"] = _column_kinds(table.df)
    summary["notes"] = [*summary["notes"], *impossible_values(table.df)]
    print(f"[Inspect] ✓ {summary['format']} {summary['rows']:,}×{summary['columns']}", flush=True)
    return JSONResponse({"ok": True, **summary})


@app.post("/check")
async def check(
    file:       UploadFile = File(...),
    session_id: str        = Form(...),
):
    """
    Quick quality check — no LLM calls.
    Returns condition so C# chatbot can ask the right question.
    """
    print(f"\n{'='*52}", flush=True)
    print(f"[Check] ▶ Received file: {file.filename}  session={session_id}", flush=True)

    file_bytes = await file.read()
    if not file_bytes:
        print("[Check] ✗ Empty file received", flush=True)
        raise HTTPException(status_code=400, detail="Empty file.")

    print(f"[Check] File size: {len(file_bytes):,} bytes", flush=True)

    try:
        table = load_table(file_bytes, file.filename or "dataset.csv")
        df = table.df
        print(f"[Check] Loaded {table.format}: {len(df):,} rows × {len(df.columns)} cols", flush=True)
    except UnsupportedFile as e:
        # These messages are written for users: what is wrong and what to do.
        print(f"[Check] ✗ {e}", flush=True)
        return JSONResponse({"condition": "not_workable", "error": str(e)})
    except Exception as e:
        # Log full error server-side but never expose internal details to clients
        print(f"[Check] ✗ Could not parse file: {type(e).__name__}: {e}", flush=True)
        return JSONResponse({"condition": "not_workable", "error": "The file could not be read."})

    quality = check_data_quality(df)
    print(f"[Check] Quality — usable={quality.isUsable}, needsCleaning={quality.needsCleaning}", flush=True)
    if quality.warnings:
        for w in quality.warnings:
            print(f"[Check]   ⚠ {w}", flush=True)

    file_info = {"format": table.format, "rows": int(len(df)), "columns": int(len(df.columns)),
                 "notes": table.notes}

    if not quality.isUsable:
        print(f"[Check] ✗ Dataset not usable: {'; '.join(quality.errors)}", flush=True)
        return JSONResponse({"condition": "not_workable", "error": "; ".join(quality.errors), "file": file_info})

    confidence = evaluate_confidence(df, quality)

    if quality.needsCleaning:
        condition = "not_clean"
    elif confidence.requiresUserConfirmation:
        condition = "low_accuracy"
    else:
        condition = "all_good"

    print(f"[Check] ✓ Condition: {condition}", flush=True)
    return JSONResponse({"condition": condition, "error": None, "file": file_info})


@app.post("/analyze")
async def analyze(
    file:                UploadFile = File(...),
    session_id:          str  = Form(...),
    dataset_id:          str  = Form(None),
    user_wants_cleaning: bool = Form(False),
    user_confirmed_low:  bool = Form(False),
    # Pro customization — all optional, safe defaults applied in pipeline
    language:            str  = Form("en"),
    tone:                str  = Form("professional"),
    insights_count:      int  = Form(5),
    occasion:            str  = Form("general"),
    audience:            str  = Form("general"),
    depth:               str  = Form("standard"),
    focus_on:            str  = Form(""),
    comparisons:         str  = Form(""),
    must_mention:        str  = Form(""),    # comma-separated list
    chart_style:         str  = Form("mixed"),
    include_methodology: bool = Form(True),
    include_confidence:  bool = Form(True),
    want_word:           bool = Form(False),
    want_pptx:           bool = Form(False),
    # The brief: free text from the panel or the chat
    assumptions:         str  = Form(""),
    avoid:               str  = Form(""),
    questions_json:      str  = Form(""),    # JSON list of {"question", "note"} or strings
    writing_format:      str  = Form("narrative"),
):
    """
    Full 8-phase analysis pipeline.

    C# sends:
      - file:                the uploaded file's bytes, in any format ai_engine.ingest reads
      - session_id:          user UUID
      - dataset_id:          optional dataset identifier
      - user_wants_cleaning: true if user agreed to auto-clean
      - user_confirmed_low:  true if user confirmed proceed despite low confidence

    Pro customization (optional):
      - language:       output language code (en/fr/es/de/zh/ar/pt/fa)
      - tone:           writing style
      - insights_count: 1-10
      - occasion:       report framing context
      - assumptions, avoid, questions_json, writing_format: the brief
      - want_word:      generate .docx Word report
      - want_pptx:      generate .pptx PowerPoint
    """
    print(f"\n{'='*52}", flush=True)
    print(f"[Analyze] ▶ Pipeline start", flush=True)
    print(f"[Analyze]   file     : {file.filename}", flush=True)
    print(f"[Analyze]   session  : {session_id}", flush=True)
    print(f"[Analyze]   cleaning : {user_wants_cleaning}", flush=True)
    print(f"[Analyze]   low_conf : {user_confirmed_low}", flush=True)
    print(f"[Analyze]   lang={language} tone={tone} insights={insights_count} occasion={occasion} word={want_word} pptx={want_pptx}", flush=True)

    # At least one report-writer key is needed. Without either, every report
    # would silently be the stats-only fallback, so refuse loudly instead.
    if not (OPENROUTER_API_KEY or GROQ_API_KEY):
        print("[Analyze] ✗ no OPENROUTER_API_KEY or GROQ_API_KEY — aborting", flush=True)
        raise HTTPException(status_code=500, detail="No report-writer API key configured.")

    file_bytes = await file.read()
    if not file_bytes:
        print("[Analyze] ✗ Empty file received", flush=True)
        raise HTTPException(status_code=400, detail="Empty file received.")

    print(f"[Analyze] File size: {len(file_bytes):,} bytes ({len(file_bytes)/1_048_576:.2f} MB)", flush=True)

    t_start = time.perf_counter()
    result = run_pipeline(
        file_bytes=file_bytes,
        file_name=file.filename or "dataset.csv",
        user_wants_cleaning=user_wants_cleaning,
        user_confirmed_low=user_confirmed_low,
        openrouter_api_key=OPENROUTER_API_KEY,
        groq_api_key=GROQ_API_KEY,
        session_id=session_id,
        customization={
            "language":           language,
            "tone":               tone,
            "insightsCount":      insights_count,
            "occasion":           occasion,
            "audience":           audience,
            "depth":              depth,
            "focusOn":            focus_on,
            "comparisons":        comparisons,
            "mustMention":        [m.strip() for m in must_mention.split(",") if m.strip()],
            "chartStyle":         chart_style,
            "includeMethodology": include_methodology,
            "includeConfidence":  include_confidence,
            "assumptions":        assumptions,
            "avoid":              avoid,
            "questions":          parse_questions(questions_json),
            "writingFormat":      writing_format,
            "outputFormat": {
                "pdf":  True,
                "word": want_word,
                "pptx": want_pptx,
            },
        },
    )
    elapsed = time.perf_counter() - t_start

    status = result.get("status", "unknown")
    has_pdf  = bool(result.get("pdf_report_base64"))
    has_word = bool(result.get("word_report_base64"))
    has_pptx = bool(result.get("pptx_report_base64"))
    has_csv  = bool(result.get("cleaned_csv_base64"))
    n_charts   = len(result.get("charts") or [])
    confidence = result.get("confidence_score", "?")

    print(f"[Analyze] ✓ Pipeline complete in {elapsed:.1f}s", flush=True)
    print(f"[Analyze]   status     : {status}", flush=True)
    print(f"[Analyze]   pdf        : {'✓' if has_pdf  else '✗'}", flush=True)
    print(f"[Analyze]   word       : {'✓' if has_word else '—'}", flush=True)
    print(f"[Analyze]   pptx       : {'✓' if has_pptx else '—'}", flush=True)
    print(f"[Analyze]   cleaned csv: {'✓' if has_csv  else '—'}", flush=True)
    print(f"[Analyze]   charts     : {n_charts}", flush=True)
    print(f"[Analyze]   confidence : {confidence}/10", flush=True)
    print(f"{'='*52}\n", flush=True)

    result["session_id"] = session_id
    return JSONResponse(result)


@app.post("/brief")
async def brief(
    text:         str = Form(...),
    columns_json: str = Form(""),     # JSON list of column names
    ui_language:  str = Form("en"),
):
    """
    Report settings from the user's own description of the report they want.
    Returns {"settings", "summary", "notPossible", "source"}. See llm.harness.
    """
    columns = _json_form(columns_json, [])
    if not isinstance(columns, list):
        columns = []
    columns = [c.get("name") if isinstance(c, dict) else c for c in columns]
    started = time.perf_counter()
    result = build_brief(text, [str(c) for c in columns if c is not None], api_keys=API_KEYS,
                         ui_language=ui_language)
    print(f"[Brief] {result.get('source')} in {time.perf_counter() - started:.1f}s: "
          f"{sorted(result.get('settings', {}))}", flush=True)
    return JSONResponse(result)


@app.post("/ask")
async def ask(
    question:     str = Form(...),
    context_json: str = Form(...),    # the chat_context /analyze returned for this analysis
    history_json: str = Form(""),     # [{"role": "user"|"assistant", "content"}], most recent last
    ui_language:  str = Form("en"),
    file:         UploadFile = File(None),   # optional: lets the chat query the data itself
):
    """
    Answer one question about a finished analysis. See llm.harness.
    """
    context = _json_form(context_json, None)
    if not isinstance(context, dict):
        raise HTTPException(status_code=400, detail="context_json must be the analysis's chat context.")
    history = _json_form(history_json, [])

    df = None
    if file is not None:
        file_bytes = await file.read()
        if file_bytes:
            try:
                df = _cached_table(file_bytes, file.filename or "dataset").df
            except Exception as e:  # answer from the context alone
                print(f"[Ask] file unreadable, answering from context: {type(e).__name__}: {e}", flush=True)

    from ai_engine.telemetry.usage import UsageTracker
    tracker = UsageTracker()
    started = time.perf_counter()
    result = answer_question(context, question, history, df=df, api_keys=API_KEYS,
                             tracker=tracker, ui_language=ui_language)
    result["usage"] = tracker.to_dict()
    print(f"[Ask] {'refused' if result.get('refused') else 'answered'} in "
          f"{time.perf_counter() - started:.1f}s by {result.get('model') or '—'}; "
          f"queries={len(result.get('queries') or [])} unverified={result.get('unverifiedNumbers')}", flush=True)
    return JSONResponse(result)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
