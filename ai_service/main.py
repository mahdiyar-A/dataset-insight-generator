import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from ai_engine.core.pipeline import run_pipeline
from ai_engine.quality.quality_checker import check_data_quality
from ai_engine.quality.confidence_engine import evaluate_confidence
import io
import pandas as pd

app = FastAPI(title="DIG AI Engine", version="1.0.0")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def _load_dataframe(file_bytes: bytes, file_name: str) -> pd.DataFrame:
    name_lower = file_name.lower()
    if name_lower.endswith(".xlsx") or name_lower.endswith(".xls"):
        return pd.read_excel(io.BytesIO(file_bytes))
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            return pd.read_csv(io.BytesIO(file_bytes), encoding=enc)
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode file.")


@app.get("/health")
def health():
    return {"status": "ok", "gemini_key_set": bool(GEMINI_API_KEY)}


@app.post("/check")
async def check(
    file: UploadFile = File(...),
    session_id: str = Form(...),
):
    """
    Quick quality check — no LLM, no PDF.
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
    Receives CSV/XLSX from C# backend and runs full analysis pipeline.

    C# sends:
      - file: the raw CSV bytes
      - session_id: user UUID
      - user_wants_cleaning: true if user said yes to cleaning
      - user_confirmed_low: true if user said yes to proceed despite low confidence
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set in environment.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file received.")

    result = run_pipeline(
        file_bytes=file_bytes,
        file_name=file.filename or "dataset.csv",
        user_wants_cleaning=user_wants_cleaning,
        user_confirmed_low=user_confirmed_low,
        gemini_api_key=GEMINI_API_KEY,
    )

    # Map to C# AnalyzeResponseDto shape
    return JSONResponse({
        "session_id":          session_id,
        "status":              result["status"],
        "condition":           result["condition"],
        "error":               result.get("error"),
        "cleaned_csv_base64":  result.get("cleaned_csv_base64"),
        "pdf_report_base64":   result.get("pdf_report_base64"),
        "charts":              result.get("charts", []),
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)