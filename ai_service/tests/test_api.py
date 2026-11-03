"""
The HTTP endpoints the .NET backend calls, through FastAPI, with the model
replaced by a stub. These pin the response shapes the backend parses.
"""

import io
import json

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

import ai_engine.llm.harness as harness  # noqa: E402
import main  # noqa: E402
from ai_engine.llm.report_writer import ReportProvider  # noqa: E402

client = TestClient(main.app)   # not a context manager: the model warm-up thread stays off


@pytest.fixture(scope="module")
def frame() -> pd.DataFrame:
    rng = np.random.default_rng(11)
    n = 200
    return pd.DataFrame({
        "date": pd.date_range("2024-01-01", periods=n, freq="D"),
        "region": rng.choice(["North", "South", "East"], n),
        "revenue": rng.uniform(10, 500, n).round(2),
        "units": rng.integers(1, 20, n),
    })


def _upload(name: str, data: bytes):
    return {"file": (name, data, "application/octet-stream")}


def test_health():
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["version"]


def test_inspect_reads_formats_the_browser_cannot(frame):
    buf = io.BytesIO()
    frame.to_parquet(buf)
    body = client.post("/inspect", files=_upload("sales.parquet", buf.getvalue())).json()
    assert body["ok"] and body["format"] == "parquet" and body["formatLabel"]
    assert body["rows"] == 200 and body["columns"] == 4 and body["headers"] == list(frame.columns)
    assert len(body["preview"]) == 5
    assert {k["name"]: k["kind"] for k in body["columnKinds"]} == {
        "date": "date", "region": "text", "revenue": "number", "units": "number"}


def test_inspect_explains_what_it_cannot_read():
    body = client.post("/inspect", files=_upload("report.pdf", b"%PDF-1.7 ...")).json()
    assert body == {"ok": False, "error": body["error"]} and "PDF" in body["error"]


def test_check_reports_the_condition_and_how_the_file_was_read(frame):
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        frame.to_excel(w, sheet_name="Data", index=False)
    body = client.post("/check", files=_upload("sales.xlsx", buf.getvalue()), data={"session_id": "t"}).json()
    assert body["condition"] in ("all_good", "not_clean", "low_accuracy")
    assert body["error"] is None
    assert body["file"]["format"] == "xlsx" and body["file"]["rows"] == 200


def test_check_refuses_a_document_with_advice():
    body = client.post("/check", files=_upload("notes.pdf", b"%PDF-1.4 x"), data={"session_id": "t"}).json()
    assert body["condition"] == "not_workable" and "CSV" in body["error"]


def test_check_rejects_an_empty_upload():
    assert client.post("/check", files=_upload("x.csv", b""), data={"session_id": "t"}).status_code == 400


class _Stub:
    def __init__(self, *replies):
        self.replies = list(replies)

    def __call__(self, messages, api_keys, accept, tracker=None, **kwargs):
        reply = self.replies.pop(0)
        return accept(json.dumps(reply)), ReportProvider("groq", "Stub", "http://x", "stub", 10, 5)


def test_brief_returns_validated_settings(monkeypatch):
    monkeypatch.setattr(harness, "write_report", _Stub(
        {"settings": {"tone": "casual", "insightsCount": 3, "focusOn": "returns"}, "summary": "Short.",
         "notPossible": []}))
    body = client.post("/brief", data={"text": "Short and casual, about returns",
                                       "columns_json": json.dumps([{"name": "returns"}, "region"])}).json()
    assert body["source"] == "model"
    assert body["settings"] == {"tone": "casual", "insightsCount": 3, "focusOn": "returns"}


def test_ask_queries_the_uploaded_file(monkeypatch, frame):
    total = round(float(frame.loc[frame.region == "South", "revenue"].sum()), 2)
    monkeypatch.setattr(harness, "write_report", _Stub(
        {"action": "query", "queries": [{"op": "aggregate", "measure": "revenue", "agg": "sum",
                                         "where": [{"column": "region", "op": "==", "value": "South"}]}]},
        {"action": "answer", "answer": f"South's revenue is {total}."}))
    context = {"version": 1, "digest": {"dataset": {"rows": 200}}, "report": {"title": "Sales"}}
    body = client.post("/ask", data={"question": "What is South's revenue?",
                                     "context_json": json.dumps(context),
                                     "history_json": json.dumps([{"role": "user", "content": "hi"}])},
                       files=_upload("sales.csv", frame.to_csv(index=False).encode())).json()
    assert body["answer"] == f"South's revenue is {total}." and not body["refused"]
    assert body["grounding"] == "data" and body["unverifiedNumbers"] == []
    assert body["queries"][0]["result"]["value"] == pytest.approx(total, abs=0.01)
    assert "usage" in body


def test_ask_needs_the_analysis_context():
    assert client.post("/ask", data={"question": "hi", "context_json": "not json"}).status_code == 400
