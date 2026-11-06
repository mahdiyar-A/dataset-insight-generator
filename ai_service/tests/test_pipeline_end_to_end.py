"""
The whole pipeline on a real file, with the report model replaced by a stub.

Each other test checks one stage. This one checks that the stages connect:
that a non-CSV upload is read, that the brief (assumptions, questions, writing
format, things to leave out) reaches the prompt, that the answers come back
into the report, and that the PDF, Word and PowerPoint files and the chat
context are all produced.
"""

import base64
import io
import json

import numpy as np
import pandas as pd
import pytest

import ai_engine.core.pipeline as pipeline
import ai_engine.llm.insight_agent as insight_agent
from ai_engine.core.pipeline import run_pipeline


def _sales_frame(n: int = 600) -> pd.DataFrame:
    rng = np.random.default_rng(7)
    region = rng.choice(["North", "South", "East", "West"], n, p=[0.4, 0.3, 0.2, 0.1])
    units = rng.integers(1, 30, n)
    price = rng.uniform(5, 50, n).round(2)
    churned = (rng.uniform(size=n) < np.where(region == "South", 0.35, 0.12)).astype(int)
    return pd.DataFrame({
        "order_date": pd.date_range("2023-01-01", periods=n, freq="D"),
        "region": region,
        "units": units,
        "unit_price": price,
        "revenue": (units * price).round(2),
        "churned": churned,
    })


def _xlsx_bytes(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Orders", index=False)
        pd.DataFrame({"note": ["exported from the CRM"]}).to_excel(writer, sheet_name="About", index=False)
    return buf.getvalue()


REPLY = {
    "report_title": "Regional sales review",
    "introduction": "Six hundred orders across four regions.",
    "executive_summary": "North leads revenue; South loses the most customers.",
    "insights": [
        {"rank": i, "title": f"Finding {i}", "body": "• first point\n• second point", "insight_index": i}
        for i in range(1, 5)
    ],
    "chart_instructions": [
        {"index": 1, "chart_type": "bar", "title": "Revenue by region", "x_column": "region",
         "y_column": "revenue", "description": "Totals per region.", "insight_index": 1},
        {"index": 2, "chart_type": "line", "title": "Revenue over time", "x_column": "order_date",
         "y_column": "revenue", "description": "Monthly revenue.", "insight_index": 2},
    ],
    "data_quality_section": "The file is complete.",
    "gemini_confidence_score": 7,
    "confidence_note": "",
    "conclusion": "Focus retention work on the South.",
    "question_answers": [
        {"question": "Which region churns most?", "answer": "South, at about a third of customers.",
         "answerable": True},
        {"question": "What will revenue be next year?", "answer": "The data has no forecast.",
         "answerable": False},
    ],
}


@pytest.fixture
def stub_writer(monkeypatch):
    prompts = []

    def fake_write_report(prompt, api_keys, accept, tracker=None, **kwargs):
        prompts.append(prompt)
        from ai_engine.llm.report_writer import REPORT_PROVIDERS
        return accept(json.dumps(REPLY)), REPORT_PROVIDERS[0]

    monkeypatch.setattr(insight_agent, "write_report", fake_write_report)
    return prompts


def test_xlsx_upload_with_a_brief_produces_every_output(stub_writer):
    result = run_pipeline(
        file_bytes=_xlsx_bytes(_sales_frame()),
        file_name="orders.xlsx",
        user_wants_cleaning=False,
        user_confirmed_low=True,
        openrouter_api_key="",
        groq_api_key="",          # the domain gate uses its offline fallback
        session_id="test",
        customization={
            "insightsCount": 4,
            "focusOn": "churn by region",
            "assumptions": "Q4 2024 is incomplete",
            "avoid": "unit price",
            "questions": [{"question": "Which region churns most?", "note": "for the board"},
                          "What will revenue be next year?"],
            "writingFormat": "bullets",
            "outputFormat": {"pdf": True, "word": True, "pptx": True},
        },
    )

    assert result["status"] == "done", result.get("error")

    # The brief reached the prompt the model saw.
    prompt = stub_writer[0]
    assert "ASSUME:" in prompt and "Q4 2024 is incomplete" in prompt
    assert "LEAVE OUT:" in prompt and "unit price" in prompt
    assert "Q1. Which region churns most?" in prompt and "for the board" in prompt
    assert "Q2. What will revenue be next year?" in prompt
    assert '"question_answers"' in prompt
    assert "Produce exactly 4 insights." in prompt
    assert "bullet points" in prompt
    # The workbook's data sheet was read, and the prompt says so.
    assert '"file_format":"Excel"' in prompt and '"read_from":"Orders"' in prompt

    # Every output exists and opens.
    assert base64.b64decode(result["pdf_report_base64"]).startswith(b"%PDF")
    from docx import Document
    from pptx import Presentation
    doc = Document(io.BytesIO(base64.b64decode(result["word_report_base64"])))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "Which region churns most?" in text
    deck = Presentation(io.BytesIO(base64.b64decode(result["pptx_report_base64"])))
    assert len(deck.slides) >= 4

    # The chat can answer from what the report saw.
    ctx = result["chat_context"]
    assert ctx["report"]["questionAnswers"][0]["question"] == "Which region churns most?"
    assert ctx["report"]["assumptions"] == "Q4 2024 is incomplete"
    assert {c["name"] for c in ctx["columns"]} >= {"region", "revenue", "churned"}
    assert ctx["digest"]["dataset"]["rows"] == 600
    assert len(json.dumps(ctx)) < 60_000


def test_the_report_says_which_sheets_were_not_read(stub_writer, monkeypatch):
    seen = {}
    real_build = pipeline.build_pdf

    def keep(report, **kwargs):
        seen["section"] = report.dataQualitySection
        return real_build(report=report, **kwargs)

    monkeypatch.setattr(pipeline, "build_pdf", keep)
    result = run_pipeline(
        file_bytes=_xlsx_bytes(_sales_frame()), file_name="sales.xlsx",
        user_wants_cleaning=False, user_confirmed_low=True,
        openrouter_api_key="", groq_api_key="", session_id="test",
    )
    assert result["status"] == "done", result.get("error")
    assert '"Orders"' in seen["section"] and "Not read: About" in seen["section"]


def test_a_model_cannot_drop_a_real_column(stub_writer, monkeypatch):
    # A real run lost discount_pct this way, and the questions box then said the
    # file had no discount information.
    real_gate = pipeline._run_domain_gate

    def wants_it_gone(df, *args, **kwargs):
        domain = real_gate(df, *args, **kwargs)
        domain.column_decisions["drop"] = ["units"]
        domain.cleaning_methods = [*domain.cleaning_methods, "drop_column:units"]
        return domain

    monkeypatch.setattr(pipeline, "_run_domain_gate", wants_it_gone)
    df = _sales_frame()
    df.loc[df.index[:30], "units"] = np.nan
    result = run_pipeline(
        file_bytes=df.to_csv(index=False).encode(), file_name="sales.csv",
        user_wants_cleaning=True, user_confirmed_low=True,
        openrouter_api_key="", groq_api_key="", session_id="test",
    )
    assert result["status"] == "done", result.get("error")
    assert "units" in [c["name"] for c in result["chat_context"]["columns"]]
    assert result["chat_context"]["columnsLeftOutOfTheReport"] == []


def test_unreadable_upload_fails_with_a_message_for_the_user(stub_writer):
    result = run_pipeline(
        file_bytes=b"%PDF-1.7 not a table", file_name="report.pdf",
        user_wants_cleaning=False, user_confirmed_low=True, session_id="test",
    )
    assert result["status"] == "failed"
    assert result["condition"] == "not_workable"
    assert "PDF" in result["error"] and "CSV" in result["error"]
    assert not stub_writer, "no model call for a file that cannot be read"


def test_a_correlation_that_reverses_inside_groups_reaches_the_writer_the_chart_and_the_chat(stub_writer, monkeypatch):
    rng = np.random.default_rng(3)
    frames = []
    for region, centre in zip(("North", "East", "South", "West"), (20.0, 30.0, 40.0, 50.0)):
        spend = rng.normal(centre, 3.0, 150)
        revenue = 3 * centre - 0.9 * (spend - centre) + rng.normal(0, 2.0, 150)
        frames.append(pd.DataFrame({"region": region, "ad_spend": spend.round(2), "revenue": revenue.round(2)}))
    upload = pd.concat(frames, ignore_index=True).to_csv(index=False).encode()
    # The model asks for the plain scatter it was told not to.
    monkeypatch.setitem(REPLY, "chart_instructions", [
        {"index": 1, "chart_type": "scatter", "title": "Spend and revenue", "x_column": "ad_spend",
         "y_column": "revenue", "description": "", "insight_index": 1},
    ])
    charted = []
    real_generate = pipeline.generate_charts
    monkeypatch.setattr(pipeline, "generate_charts", lambda df, charts: charted.extend(charts) or real_generate(df, charts))

    result = run_pipeline(file_bytes=upload, file_name="spend.csv", user_wants_cleaning=False,
                          user_confirmed_low=True, session_id="test")

    assert result["status"] == "done", result.get("error")
    assert '"misleading":"reversed within region"' in stub_writer[0]
    assert '"misleading_correlations"' in stub_writer[0]
    assert charted[0].groupColumn == "region"
    assert result["chat_context"]["digest"]["misleading_correlations"][0]["kind"] == "reversed"


def test_bad_customization_values_fall_back_to_defaults(stub_writer):
    result = run_pipeline(
        file_bytes=_sales_frame(200).to_csv(index=False).encode(), file_name="orders.csv",
        user_wants_cleaning=False, user_confirmed_low=True, session_id="test",
        customization={"insightsCount": "lots", "writingFormat": "haiku", "questions": "not json ["},
    )
    assert result["status"] == "done", result.get("error")
    prompt = stub_writer[0]
    assert "Produce exactly 5 insights." in prompt
    assert "Q1. not json [" in prompt   # a bare string is taken as one question


def test_the_report_describes_the_cleaning_that_happened(stub_writer, monkeypatch):
    # The model planned zeros; the rule fills with the median. The report has to
    # say the median.
    real_gate = pipeline._run_domain_gate
    seen = {}

    def plans_zeros(df, *args, **kwargs):
        domain = real_gate(df, *args, **kwargs)
        domain.cleaning_methods = [*domain.cleaning_methods, "impute_zero:units"]
        return domain

    real_build = pipeline.build_pdf

    def keep(domain, **kwargs):
        seen["methods"] = list(domain.cleaning_methods)
        return real_build(domain=domain, **kwargs)

    monkeypatch.setattr(pipeline, "_run_domain_gate", plans_zeros)
    monkeypatch.setattr(pipeline, "build_pdf", keep)
    df = _sales_frame()
    df.loc[df.index[:30], "units"] = np.nan
    result = run_pipeline(
        file_bytes=df.to_csv(index=False).encode(), file_name="sales.csv",
        user_wants_cleaning=True, user_confirmed_low=True,
        openrouter_api_key="", groq_api_key="", session_id="test",
    )
    assert result["status"] == "done", result.get("error")
    assert "impute_median:units" in seen["methods"]
    assert "impute_zero:units" not in seen["methods"]
