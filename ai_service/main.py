import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from ai_engine.core.pipeline import run_pipeline
from ai_engine.quality.quality_checker import check_data_quality
from ai_engine.quality.confidence_engine import evaluate_confidence
from ai_engine.training.training_logger import get_training_stats
import io
import pandas as pd

app = FastAPI(title="DIG AI Engine", version="2.0.0")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY",   "")


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


@app.get("/health")
def health():
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
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        df = _load_dataframe(file_bytes, file.filename or "dataset.csv")
    except Exception as e:
        return JSONResponse({"condition": "not_workable", "error": str(e)})

    quality = check_data_quality(df)

    if not quality.isUsable:
        return JSONResponse({"condition": "not_workable", "error": "; ".join(quality.errors)})

    confidence = evaluate_confidence(df, quality)

    if quality.needsCleaning:
        condition = "not_clean"
    elif confidence.requiresUserConfirmation:
        condition = "low_accuracy"
    else:
        condition = "all_good"

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
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file received.")

    result = run_pipeline(
        file_bytes=file_bytes,
        file_name=file.filename or "dataset.csv",
        user_wants_cleaning=user_wants_cleaning,
        user_confirmed_low=user_confirmed_low,
        gemini_api_key=GEMINI_API_KEY,
        groq_api_key=GROQ_API_KEY,
        session_id=session_id,
    )

    # Return the full pipeline result dict directly — includes all fields
    # (status, condition, error, cleaned_csv_base64, pdf_report_base64,
    #  charts, low_confidence_warning, confidence_score)
    result["session_id"] = session_id
    return JSONResponse(result)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
