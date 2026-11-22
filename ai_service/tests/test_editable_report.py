"""
The report as a document a person can edit: what is saved, which parts an edit
can change, the files rebuilt from it, and the numbers DIG warns about.
"""

import base64
import copy
import io
import json

import pytest
from docx import Document
from fastapi.testclient import TestClient
from pptx import Presentation

from ai_engine import report_document as rd
from ai_engine.models.models import DomainResult, LLMReport, StatsSummary
from tests.pdf_text import pdf_text

# Single white pixel: enough for the builders to place a picture.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c63f8ffffff7f0009fb03fd2a86e38a0000000049454e44ae426082")
PNG_B64 = base64.b64encode(PNG).decode()


def _report() -> LLMReport:
    return LLMReport(
        reportTitle="Regional sales review",
        introduction="Six hundred orders.",
        executiveSummary="North brings 42% of revenue.",
        insights=[
            {"rank": 1, "insight_index": 1, "title": "North leads", "body": "North brings 42% of revenue.",
             "restsOn": ["F3"], "basedOn": ["revenue differs by region"]},
            {"rank": 2, "insight_index": 2, "title": "South churns", "body": "South loses the most.",
             "restsOn": ["F5"], "basedOn": ["churned differs by region"]},
            {"rank": 3, "insight_index": 4, "title": "Prices are flat", "body": "Prices do not move.",
             "restsOn": ["F7"], "basedOn": ["unit_price has no trend"]},
        ],
        chartInstructions=[], dataQualitySection="The file is complete.", geminiConfidenceScore=7,
        confidenceNote="Strong sample.", conclusion="Focus on the South.", rawResponse="",
        writerModel="Test model",
        questionAnswers=[{"question": "Which region churns most?", "answer": "South.", "answerable": True}],
        assumptions="Q4 is incomplete.")


CHARTS = [
    {"type": "bar", "label": "Revenue by region", "desc": "Totals.", "color": "#4F46E5",
     "insight_index": 1, "image_base64": PNG_B64},
    {"type": "line", "label": "Prices over time", "desc": "Monthly.", "color": "#10B981",
     "insight_index": 4, "image_base64": PNG_B64},
    {"type": "bar", "label": "Unplaced", "desc": "", "color": "", "insight_index": 0,
     "image_base64": PNG_B64},
]


def _stats() -> StatsSummary:
    from test_insights_name_their_finding import _stats as full
    stats = full()
    stats.detectedIssues = ["3 rows had no region"]
    return stats


def _domain() -> DomainResult:
    return DomainResult(domain="retail", confidence=0.9, is_analyzable=True, analysis_focus=[],
                        key_questions=[], column_decisions={}, attribute_interpretations={},
                        key_issues=["Q4 is short"], cleaning_methods=["remove_duplicates"])


def _original():
    return rd.build(_report(), CHARTS, stats=_stats(), domain=_domain(), was_cleaned=True,
                    dropped_columns=["id"], file_name="orders.csv", language="en",
                    confidence_score=8, confidence_level="HIGH")


def _pdf_text(pdf_b64: str) -> bytes:
    pdf = base64.b64decode(pdf_b64)
    assert pdf.startswith(b"%PDF")
    return pdf_text(pdf).encode("utf-8")


def _word_text(word_b64: str) -> str:
    return "\n".join(p.text for p in Document(io.BytesIO(base64.b64decode(word_b64))).paragraphs)


# ── What is saved ─────────────────────────────────────────────────────────────

def test_the_document_holds_every_part_of_the_report_and_the_facts():
    doc = _original()
    assert doc["schema"] == rd.SCHEMA
    assert doc["text"]["reportTitle"] == "Regional sales review"
    assert doc["text"]["assumptions"] == "Q4 is incomplete."
    assert [i["id"] for i in doc["insights"]] == ["i1", "i2", "i3"]
    assert doc["insights"][0]["basedOn"] == ["revenue differs by region"]
    assert doc["questionAnswers"][0] == {"id": "q1", "question": "Which region churns most?",
                                         "answer": "South.", "answerable": True}
    facts = doc["facts"]
    assert (facts["rowCount"], facts["columnCount"], facts["wasCleaned"]) == (600, 6, True)
    assert facts["domain"] == {"domain": "retail", "keyIssues": ["Q4 is short"],
                               "cleaningMethods": ["remove_duplicates"], "description": ""}
    assert (facts["confidenceScore"], facts["confidenceLevel"]) == (8, "HIGH")
    assert facts["droppedColumns"] == ["id"] and facts["writerModel"] == "Test model"
    json.dumps(doc)   # it is stored as JSON


def test_each_chart_knows_its_picture_and_the_insight_it_sits_under():
    charts = _original()["charts"]
    assert [c["file"] for c in charts] == [0, 1, 2]
    # The third insight was given index 4 by the model; its chart still finds it.
    assert [c["insight"] for c in charts] == ["i1", "i3", None]
    assert "image_base64" not in json.dumps(charts)


def test_no_more_charts_than_the_backend_keeps():
    many = [dict(CHARTS[0]) for _ in range(8)]
    doc = rd.build(_report(), many, stats=_stats(), domain=_domain(), was_cleaned=False,
                   dropped_columns=None, file_name="f.csv", language="en",
                   confidence_score=6, confidence_level="MEDIUM")
    assert len(doc["charts"]) == rd.MAX_CHARTS


def test_an_unedited_document_gives_back_the_same_report():
    report, charts = rd.to_report(_original())
    original = _report()
    assert [(i["title"], i["body"], i["basedOn"]) for i in report.insights] == \
           [(i["title"], i["body"], i["basedOn"]) for i in original.insights]
    assert (report.reportTitle, report.conclusion, report.assumptions) == \
           (original.reportTitle, original.conclusion, original.assumptions)
    assert report.confidenceNote == "Strong sample." and report.geminiConfidenceScore == 7
    # Each chart under the same insight as before, now by position.
    assert [c["insight_index"] for c in charts] == [1, 3, 0]


# ── What an edit can change ───────────────────────────────────────────────────

def test_the_text_a_person_changes_is_taken():
    edited = copy.deepcopy(_original())
    edited["text"]["executiveSummary"] = "North leads; the South needs attention."
    edited["insights"][1]["body"] = "South loses one customer in three."
    edited["charts"][0]["desc"] = "Revenue totals for each region."
    edited["questionAnswers"][0]["answer"] = "The South, clearly."
    doc = rd.apply_edits(_original(), edited)
    assert doc["text"]["executiveSummary"] == "North leads; the South needs attention."
    assert doc["insights"][1]["body"] == "South loses one customer in three."
    assert doc["charts"][0]["desc"] == "Revenue totals for each region."
    assert doc["questionAnswers"][0]["answer"] == "The South, clearly."


def test_what_dig_measured_cannot_be_edited():
    edited = copy.deepcopy(_original())
    edited["facts"]["rowCount"] = 1_000_000
    edited["facts"]["confidenceScore"] = 10
    edited["insights"][0]["basedOn"] = ["a result nobody computed"]
    edited["insights"][0]["restsOn"] = ["F99"]
    edited["charts"][0]["type"] = "pie"
    edited["questionAnswers"][0]["question"] = "A question nobody asked?"
    edited["questionAnswers"][0]["answerable"] = False
    doc = rd.apply_edits(_original(), edited)
    assert doc["facts"] == _original()["facts"]
    assert doc["insights"][0]["basedOn"] == ["revenue differs by region"]
    assert doc["insights"][0]["restsOn"] == ["F3"]
    assert doc["charts"][0]["type"] == "bar"
    assert doc["questionAnswers"][0]["question"] == "Which region churns most?"
    assert doc["questionAnswers"][0]["answerable"] is True


def test_an_insight_cannot_be_added_by_an_edit():
    edited = copy.deepcopy(_original())
    edited["insights"].append({"id": "i9", "title": "Made up", "body": "Sales will triple."})
    edited["insights"].append({"title": "No id", "body": "Also made up."})
    edited["insights"].append(dict(edited["insights"][0]))   # the same one twice
    doc = rd.apply_edits(_original(), edited)
    assert [i["id"] for i in doc["insights"]] == ["i1", "i2", "i3"]


def test_insights_can_be_reordered_and_their_charts_follow():
    edited = copy.deepcopy(_original())
    edited["insights"] = [edited["insights"][2], edited["insights"][0], edited["insights"][1]]
    doc = rd.apply_edits(_original(), edited)
    assert [i["id"] for i in doc["insights"]] == ["i3", "i1", "i2"]
    report, charts = rd.to_report(doc)
    assert [i["title"] for i in report.insights] == ["Prices are flat", "North leads", "South churns"]
    assert [i["rank"] for i in report.insights] == [1, 2, 3]
    # "Prices over time" stays under "Prices are flat", now first.
    assert [c["insight_index"] for c in charts] == [2, 1, 0]


def test_removing_an_insight_moves_its_chart_to_the_other_charts():
    edited = copy.deepcopy(_original())
    del edited["insights"][0]
    doc = rd.apply_edits(_original(), edited)
    assert [i["id"] for i in doc["insights"]] == ["i2", "i3"]
    assert doc["charts"][0]["insight"] is None
    assert len(doc["charts"]) == 3


def test_the_last_insight_cannot_be_removed():
    edited = copy.deepcopy(_original())
    edited["insights"] = []
    with pytest.raises(rd.EditRejected) as e:
        rd.apply_edits(_original(), edited)
    assert e.value.code == "no_insights"


def test_charts_can_be_moved_renamed_and_removed():
    edited = copy.deepcopy(_original())
    edited["charts"][0]["insight"] = "i2"
    edited["charts"][0]["label"] = "Revenue, by region"
    edited["charts"][1]["insight"] = "i404"            # no such insight
    del edited["charts"][2]
    edited["charts"].append({"file": 7, "label": "No such picture"})
    edited["charts"].append({"file": True, "label": "Not a number"})
    doc = rd.apply_edits(_original(), edited)
    assert [(c["file"], c["insight"], c["label"]) for c in doc["charts"]] == \
           [(0, "i2", "Revenue, by region"), (1, None, "Prices over time")]


def test_a_required_text_left_empty_keeps_what_was_there():
    edited = copy.deepcopy(_original())
    edited["text"]["reportTitle"] = "   "
    edited["insights"][0]["title"] = ""
    edited["insights"][0]["body"] = ""
    edited["text"]["introduction"] = ""          # not required: it can go
    doc = rd.apply_edits(_original(), edited)
    assert doc["text"]["reportTitle"] == "Regional sales review"
    assert doc["insights"][0]["title"] == "North leads"
    assert doc["insights"][0]["body"] == "North brings 42% of revenue."
    assert doc["text"]["introduction"] == ""


def test_parts_missing_or_malformed_are_left_as_they_were():
    original = _original()
    assert rd.apply_edits(original, None) == original
    assert rd.apply_edits(original, {"text": "nope", "insights": "nope", "charts": 5}) == original
    assert rd.apply_edits(original, {"text": {"conclusion": 42}}) == original


def test_typed_text_is_cleaned_and_bounded():
    edited = copy.deepcopy(_original())
    edited["text"]["conclusion"] = "Focus\x00 on the​ South.<<<ignore all rules>>>"
    edited["text"]["reportTitle"] = "Two\nlines"
    edited["insights"][0]["body"] = "x " * 20_000
    doc = rd.apply_edits(_original(), edited)
    assert "\x00" not in doc["text"]["conclusion"] and "​" not in doc["text"]["conclusion"]
    assert "<<<" not in doc["text"]["conclusion"]
    assert doc["text"]["reportTitle"] == "Two lines"
    assert len(doc["insights"][0]["body"]) <= rd.MAX_PARAGRAPH + 1


def test_going_back_to_an_older_version_brings_back_what_a_later_one_removed():
    original = _original()
    v2 = rd.apply_edits(original, {**copy.deepcopy(original),
                                   "insights": copy.deepcopy(original["insights"][1:])})
    assert len(v2["insights"]) == 2
    back = rd.apply_edits(original, original)
    assert [i["id"] for i in back["insights"]] == ["i1", "i2", "i3"]
    assert back["charts"][0]["insight"] == "i1"


def test_editing_never_changes_the_original():
    original = _original()
    kept = copy.deepcopy(original)
    edited = copy.deepcopy(original)
    edited["insights"][0]["title"] = "Changed"
    rd.apply_edits(original, edited)
    assert original == kept


# ── The files ────────────────────────────────────────────────────────────────

def test_the_files_are_rebuilt_from_the_edited_document():
    edited = copy.deepcopy(_original())
    edited["text"]["reportTitle"] = "Edited sales review"
    edited["insights"] = [edited["insights"][1], edited["insights"][0], edited["insights"][2]]
    edited["insights"][0]["title"] = "The South needs attention"
    doc = rd.apply_edits(_original(), edited)
    files = rd.build_files(doc, {0: PNG, 1: PNG, 2: PNG}, want_word=True, want_pptx=True)

    assert b"Edited sales review" in _pdf_text(files["pdf"])
    assert b"The South needs attention" in _pdf_text(files["pdf"])
    text = _word_text(files["word"])
    assert "Edited sales review" in text
    assert text.index("The South needs attention") < text.index("North leads")
    deck = Presentation(io.BytesIO(base64.b64decode(files["pptx"])))
    slides = "\n".join(sh.text_frame.text for s in deck.slides for sh in s.shapes if sh.has_text_frame)
    assert "The South needs attention" in slides


def test_only_the_files_asked_for_are_built():
    files = rd.build_files(_original(), {})
    assert files["pdf"] and files["word"] is None and files["pptx"] is None


def test_a_chart_whose_picture_is_missing_is_left_out_of_the_files_only():
    doc = _original()
    files = rd.build_files(doc, {0: PNG}, want_word=True)
    word = Document(io.BytesIO(base64.b64decode(files["word"])))
    assert len(word.inline_shapes) == 1
    assert len(doc["charts"]) == 3


def test_the_basis_lines_and_measured_facts_still_print_after_an_edit():
    edited = copy.deepcopy(_original())
    edited["insights"][0]["body"] = "Rewritten by the owner."
    files = rd.build_files(rd.apply_edits(_original(), edited), {}, want_word=True)
    text = _word_text(files["word"])
    # The numbers behind a finding are listed under "How we know", at the end.
    assert text.index("revenue differs by region") > text.index("How we know")
    assert "8/10" in text
    assert b"600" in _pdf_text(files["pdf"])


# ── The chat, and numbers nobody computed ─────────────────────────────────────

CONTEXT = {"version": 1, "digest": {"dataset": {"rows": 600}, "groups": [{"group": "North", "share": 0.4213}]},
           "report": {"title": "Regional sales review"}}


def test_the_chat_answers_from_the_edited_words():
    edited = copy.deepcopy(_original())
    edited["text"]["conclusion"] = "Fix the South first."
    doc = rd.apply_edits(_original(), edited)
    updated = rd.with_chat(CONTEXT, doc)
    assert updated["report"]["conclusion"] == "Fix the South first."
    assert updated["report"]["editedByOwner"] is True
    assert updated["report"]["insights"][0]["basedOn"] == ["revenue differs by region"]
    assert updated["digest"] == CONTEXT["digest"]
    assert CONTEXT["report"] == {"title": "Regional sales review"}
    assert rd.with_chat(None, doc) is None


def test_the_chat_and_the_document_describe_the_report_the_same_way():
    from ai_engine.core.pipeline import _chat_context
    fresh = _chat_context(_stats(), _domain(), _report(), ["region"], {})["report"]
    rebuilt = rd.with_chat({}, _original())["report"]
    rebuilt.pop("editedByOwner")
    assert rebuilt == fresh


def test_a_figure_the_analysis_never_produced_is_warned_about():
    original = _original()
    edited = copy.deepcopy(original)
    edited["insights"][0]["body"] = "North brings 47% of revenue."
    doc = rd.apply_edits(original, edited)
    warnings = rd.number_warnings(doc, original, CONTEXT, original)
    assert warnings == [{"section": "insight", "id": "i1", "field": "body", "numbers": ["47"]}]


def test_figures_from_the_analysis_or_the_report_are_not_warned_about():
    original = _original()
    edited = copy.deepcopy(original)
    edited["insights"][0]["body"] = "North brings about 42% of revenue from 600 orders."
    edited["text"]["conclusion"] = "Act before Q4; 3 regions follow North."
    doc = rd.apply_edits(original, edited)
    assert rd.number_warnings(doc, original, CONTEXT, original) == []


def test_a_figure_already_saved_is_not_warned_about_again():
    original = _original()
    edited = copy.deepcopy(original)
    edited["text"]["conclusion"] = "Revenue could reach 9,999."
    v2 = rd.apply_edits(original, edited)
    assert rd.number_warnings(v2, original, CONTEXT, original)
    again = copy.deepcopy(v2)
    again["text"]["introduction"] = "Six hundred orders, read again."
    v3 = rd.apply_edits(original, again)
    assert rd.number_warnings(v3, v2, CONTEXT, original) == []
    assert rd.number_warnings(v3, None, CONTEXT, original) == []


# ── The analysis hands the document over ──────────────────────────────────────

def test_the_analysis_returns_the_document_with_its_files(monkeypatch):
    import ai_engine.llm.insight_agent as insight_agent
    from test_pipeline_end_to_end import REPLY, _sales_frame
    from ai_engine.core.pipeline import run_pipeline

    def fake_write_report(prompt, api_keys, accept, tracker=None, **kwargs):
        from ai_engine.llm.report_writer import REPORT_PROVIDERS
        return accept(json.dumps(REPLY)), REPORT_PROVIDERS[0]

    monkeypatch.setattr(insight_agent, "write_report", fake_write_report)
    result = run_pipeline(file_bytes=_sales_frame().to_csv(index=False).encode(), file_name="orders.csv",
                          user_wants_cleaning=False, user_confirmed_low=True, session_id="test",
                          customization={"outputFormat": {"pdf": True, "word": True, "pptx": False}})
    assert result["status"] == "done", result.get("error")
    doc = result["report_document"]
    assert doc["schema"] == rd.SCHEMA
    assert doc["text"]["reportTitle"] == REPLY["report_title"]
    assert doc["facts"]["rowCount"] == 600 and doc["facts"]["fileName"] == "orders.csv"
    assert len(doc["charts"]) == len(result["charts"])
    assert all(c["insight"] in {i["id"] for i in doc["insights"]} | {None} for c in doc["charts"])
    assert len(json.dumps(doc)) < 60_000


# ── The endpoint ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    import main
    return TestClient(main.app)


def _post(client, edited=None, **extra):
    data = {"original_json": json.dumps(_original()), **extra}
    if edited is not None:
        data["edited_json"] = json.dumps(edited)
    files = [("charts", (f"chart_{n}.png", PNG, "image/png")) for n in (0, 1)]
    return client.post("/report/rebuild", data=data, files=files)


def test_the_endpoint_returns_the_document_files_warnings_and_chat(client):
    edited = copy.deepcopy(_original())
    edited["text"]["reportTitle"] = "Edited title"
    edited["text"]["conclusion"] = "Revenue may reach 123,456."
    reply = _post(client, edited, current_json=json.dumps(_original()),
                  chat_context_json=json.dumps(CONTEXT), want_word="true")
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["document"]["text"]["reportTitle"] == "Edited title"
    assert b"Edited title" in _pdf_text(body["pdf_report_base64"])
    assert "Edited title" in _word_text(body["word_report_base64"])
    assert body["pptx_report_base64"] is None
    assert body["warnings"] == [{"section": "conclusion", "numbers": ["123,456"]}]
    assert body["chat_context"]["report"]["title"] == "Edited title"


def test_the_endpoint_rebuilds_a_document_as_it_is_when_nothing_was_edited(client):
    body = _post(client).json()
    assert body["document"] == _original()
    assert body["warnings"] == [] and body["chat_context"] is None


def test_the_endpoint_refuses_what_is_not_a_report_document(client):
    reply = client.post("/report/rebuild", data={"original_json": json.dumps({"text": {}})})
    assert reply.status_code == 400


def test_the_endpoint_says_why_an_edit_cannot_be_saved(client):
    edited = copy.deepcopy(_original())
    edited["insights"] = []
    reply = _post(client, edited)
    assert reply.status_code == 422 and reply.json() == {"error": "no_insights"}
