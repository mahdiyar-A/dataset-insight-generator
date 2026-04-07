import os
import time
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from ai_engine.core.pipeline import run_pipeline
from ai_engine.quality.quality_checker import check_data_quality
from ai_engine.quality.confidence_engine import evaluate_confidence
from ai_engine.training.training_logger import get_training_stats
import io
import pandas as pd

# ── Startup banner ────────────────────────────────────────────────────────────
print("╔══════════════════════════════════════════════╗", flush=True)
print("║   DIG — AI Engine  ·  FastAPI  ·  Port 8000 ║", flush=True)
print("║   Python  ·  7-Phase Analysis Pipeline      ║", flush=True)
print("╚══════════════════════════════════════════════╝", flush=True)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY",   "")

print(f"[AI] Gemini key : {'✓ set' if GEMINI_API_KEY else '✗ NOT SET — /analyze will fail'}", flush=True)
print(f"[AI] Groq key   : {'✓ set' if GROQ_API_KEY   else '✗ NOT SET — domain gate will use fallback'}", flush=True)

app = FastAPI(title="DIG AI Engine", version="2.0.0")


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
def _load_dataframe(file_bytes: bytes, file_name: str) -> pd.DataFrame:
    name_lower = file_name.lower()
    if name_lower.endswith(".xlsx") or name_lower.endswith(".xls"):
        return pd.read_excel(io.BytesIO(file_bytes))

    encodings  = ("utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1")
    delimiters = [None, ",", ";", "\t", "|", " "]

    last_err = None
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

    raise ValueError(f"Could not decode file. Last error: {last_err}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    print("[Health] Health check requested", flush=True)
    return {
        "status":          "ok",
        "version":         "2.0.0",
        "gemini_key_set":  bool(GEMINI_API_KEY),
        "groq_key_set":    bool(GROQ_API_KEY),
        "pipeline":        "7-phase (Groq gate → Gemini agent → Groq judge)",
    }


@app.get("/training-stats")
def training_stats():
    """Returns a summary of the local training log."""
    print("[TrainingStats] Fetching training stats", flush=True)
    return JSONResponse(get_training_stats())


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
        df = _load_dataframe(file_bytes, file.filename or "dataset.csv")
        print(f"[Check] Loaded DataFrame: {len(df):,} rows × {len(df.columns)} cols", flush=True)
    except Exception as e:
        # Log full error server-side but never expose internal details to clients
        print(f"[Check] ✗ Could not parse file: {e}", flush=True)
        return JSONResponse({"condition": "not_workable", "error": "Could not parse the uploaded file. Please ensure it is a valid CSV."})

    quality = check_data_quality(df)
    print(f"[Check] Quality — usable={quality.isUsable}, needsCleaning={quality.needsCleaning}", flush=True)
    if quality.warnings:
        for w in quality.warnings:
            print(f"[Check]   ⚠ {w}", flush=True)

    if not quality.isUsable:
        print(f"[Check] ✗ Dataset not usable: {'; '.join(quality.errors)}", flush=True)
        return JSONResponse({"condition": "not_workable", "error": "; ".join(quality.errors)})

    confidence = evaluate_confidence(df, quality)

    if quality.needsCleaning:
        condition = "not_clean"
    elif confidence.requiresUserConfirmation:
        condition = "low_accuracy"
    else:
        condition = "all_good"

    print(f"[Check] ✓ Condition: {condition}", flush=True)
    return JSONResponse({"condition": condition, "error": None})


@app.post("/analyze")
async def analyze(
    file:                UploadFile = File(...),
    session_id:          str  = Form(...),
    dataset_id:          str  = Form(None),
    user_wants_cleaning: bool = Form(False),
    user_confirmed_low:  bool = Form(False),
):
    """
    Full 7-phase analysis pipeline.

    C# sends:
      - file:                the raw CSV/XLSX bytes
      - session_id:          user UUID
      - dataset_id:          optional dataset identifier
      - user_wants_cleaning: true if user agreed to auto-clean
      - user_confirmed_low:  true if user confirmed proceed despite low confidence
    """
    print(f"\n{'='*52}", flush=True)
    print(f"[Analyze] ▶ Pipeline start", flush=True)
    print(f"[Analyze]   file     : {file.filename}", flush=True)
    print(f"[Analyze]   session  : {session_id}", flush=True)
    print(f"[Analyze]   cleaning : {user_wants_cleaning}", flush=True)
    print(f"[Analyze]   low_conf : {user_confirmed_low}", flush=True)

    if not GEMINI_API_KEY:
        print("[Analyze] ✗ GEMINI_API_KEY not set — aborting", flush=True)
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured.")

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
        gemini_api_key=GEMINI_API_KEY,
        groq_api_key=GROQ_API_KEY,
        session_id=session_id,
    )
    elapsed = time.perf_counter() - t_start

    status = result.get("status", "unknown")
    has_pdf = bool(result.get("pdf_report_base64"))
    has_csv = bool(result.get("cleaned_csv_base64"))
    n_charts = len(result.get("charts") or [])
    confidence = result.get("confidence_score", "?")

    print(f"[Analyze] ✓ Pipeline complete in {elapsed:.1f}s", flush=True)
    print(f"[Analyze]   status     : {status}", flush=True)
    print(f"[Analyze]   pdf        : {'✓' if has_pdf else '✗'}", flush=True)
    print(f"[Analyze]   cleaned csv: {'✓' if has_csv else '—'}", flush=True)
    print(f"[Analyze]   charts     : {n_charts}", flush=True)
    print(f"[Analyze]   confidence : {confidence}/10", flush=True)
    print(f"{'='*52}\n", flush=True)

    result["session_id"] = session_id
    return JSONResponse(result)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
