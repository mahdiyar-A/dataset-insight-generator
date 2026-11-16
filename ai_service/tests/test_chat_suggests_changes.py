"""
The chat suggests changes to the report (Stage D).

The model may answer a request with changes from a fixed list. Every change is
checked against the report before the owner sees it, a new insight must rest
on a computed result whose "Based on" line DIG writes, charts are drawn by DIG,
and Apply goes through the same rebuild as a save in the editor.
"""
import base64
import copy
import json

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import ai_engine.llm.harness as harness
from ai_engine import report_changes as rc
from ai_engine import report_document as rd
from ai_engine.llm.harness import answer_question
from ai_engine.llm.report_writer import ReportProvider
from tests.test_editable_report import PNG, _pdf_text

PROVIDER = ReportProvider("groq", "Test model", "http://test", "test-model", 100, 5)

DIGEST = {
    "findings": {"trend": {"id": "F1", "measure": "revenue", "dateColumn": "month", "direction": "rising",
                           "significant": True, "pValue": 0.01}},
    "correlations": [{"id": "F2", "a": "revenue", "b": "units", "r": 0.82, "n": 300}],
    "group_differences": [{"id": "F3", "by": "region", "measure": "revenue",
                           "highest": {"group": "North", "mean": 300.5}, "lowest": {"group": "South", "mean": 120.25},
                           "eta_squared": 0.31}],
}
CONTEXT = {"version": 1, "digest": DIGEST,
           "columns": [{"name": c, "type": t} for c, t in
                       (("region", "text"), ("revenue", "number"), ("units", "number"), ("month", "date"))],
           "report": {"title": "Sales"}}


def doc():
    return {
        "schema": 1,
        "text": {"reportTitle": "Sales in 2024", "introduction": "Intro.", "executiveSummary": "Revenue rose.",
                 "conclusion": "End.", "dataQualitySection": "Clean.", "assumptions": ""},
        "insights": [
            {"id": "i1", "title": "Revenue rose", "body": "Revenue rose over the year.", "restsOn": ["F1"],
             "basedOn": ["revenue is rising over time (p = 0.01)"]},
            {"id": "i2", "title": "North sells most", "body": "North leads.", "restsOn": [], "basedOn": []},
        ],
        "charts": [
            {"file": 0, "type": "line", "label": "Revenue by month", "desc": "Monthly totals", "color": "#fff",
             "insight": "i1", "spec": {"x": "month", "y": "revenue", "group": None, "yColumns": [],
                                       "aggregate": "sum"}},
            {"file": 1, "type": "bar", "label": "Rows by region", "desc": "", "color": "#fff", "insight": None},
        ],
        "questionAnswers": [{"id": "q1", "question": "Which region?", "answer": "North.", "answerable": True}],
        "facts": {"language": "en", "rowCount": 300, "columnCount": 4, "fileName": "sales.csv",
                  "confidenceScore": 8, "confidenceLevel": "HIGH", "domain": {"domain": "sales"}},
    }


@pytest.fixture(scope="module")
def df():
    rng = np.random.default_rng(3)
    n = 300
    units = rng.integers(1, 20, n)
    return pd.DataFrame({"region": rng.choice(["North", "South", "East"], n),
                         "revenue": (units * 25 + rng.normal(0, 5, n)).round(2),
                         "units": units,
                         "month": pd.date_range("2024-01-01", periods=n, freq="D")})


def check(changes, d=None, **kw):
    kw.setdefault("context", CONTEXT)
    return rc.check(changes, d or doc(), **kw)


# ── What a change may be ──────────────────────────────────────────────────────

def test_a_text_change_is_cleaned_and_kept():
    ok, problems = check([{"op": "set_text", "field": "executiveSummary", "text": "  Revenue rose​ steadily. "}])
    assert problems == []
    assert ok == [{"op": "set_text", "field": "executiveSummary", "text": "Revenue rose steadily."}]


@pytest.mark.parametrize("change, says", [
    ({"op": "rewrite_everything"}, "op must be one of"),
    ({"op": "set_text", "field": "facts", "text": "x"}, "field must be one of"),
    ({"op": "set_text", "field": "conclusion", "text": "End."}, "the same as the report"),
    ({"op": "set_insight", "id": "i9", "title": "x"}, "There is no insight 'i9'. Insights: i1, i2"),
    ({"op": "move_insight", "id": "i1", "to": 7}, "to must be a place from 1 to 2"),
    ({"op": "set_chart", "file": 4, "label": "x"}, "There is no chart 4"),
    ({"op": "set_chart", "file": 0, "insight": "i7"}, "There is no insight 'i7'"),
    ({"op": "set_answer", "id": "q1", "answer": ""}, "answer is empty"),
])
def test_a_change_that_does_not_fit_the_report_is_refused_with_a_reason(change, says):
    ok, problems = check([change])
    assert ok == [] and len(problems) == 1 and says in problems[0]


def test_what_dig_measured_and_the_basis_lines_cannot_be_changed():
    # A model sending basedOn, facts or restsOn with an edit has them ignored:
    # set_insight takes a title and a body, nothing else.
    ok, _ = check([{"op": "set_insight", "id": "i1", "body": "Revenue rose fast.",
                    "basedOn": ["Made up"], "restsOn": ["F2"], "facts": {"rowCount": 1}}])
    assert ok == [{"op": "set_insight", "id": "i1", "body": "Revenue rose fast."}]
    edited, added, _ = rc.apply(doc(), doc(), ok)
    result = rd.apply_edits(doc(), edited, added)
    assert result["insights"][0]["basedOn"] == ["revenue is rising over time (p = 0.01)"]
    assert result["facts"] == doc()["facts"]


def test_at_most_three_changes_in_one_suggestion():
    changes = [{"op": "set_text", "field": f, "text": "New words."}
               for f in ("introduction", "executiveSummary", "conclusion", "dataQualitySection")]
    ok, problems = check(changes)
    assert len(ok) == 3 and "Only 3 changes" in problems[0]


def test_the_last_insight_cannot_be_removed():
    ok, problems = check([{"op": "remove_insight", "id": "i1"}, {"op": "remove_insight", "id": "i2"}])
    assert [c["id"] for c in ok] == ["i1"]
    assert "at least one insight" in problems[0]


# ── New insights ──────────────────────────────────────────────────────────────

def test_a_new_insight_must_rest_on_a_computed_result():
    ok, problems = check([{"op": "add_insight", "title": "Units", "body": "Units follow revenue.",
                           "restsOn": ["F99"]}])
    assert ok == [] and "cannot rest on nothing" in problems[0]


def test_dig_writes_the_new_insights_basis_line_not_the_model():
    ok, problems = check([{"op": "add_insight", "title": "Units follow revenue", "body": "The two move together.",
                           "restsOn": ["f2"], "basedOn": ["Proven beyond doubt"], "after": "i1"}])
    assert problems == []
    assert ok[0]["restsOn"] == ["F2"]
    assert ok[0]["basedOn"] == ["revenue and units rise together (r = 0.82, 300 rows)"]
    assert ok[0]["after"] == "i1"


def test_a_new_insight_can_rest_on_a_lookup_run_in_the_same_request():
    lookups = rc.lookups_of([{"query": {"op": "aggregate", "measure": "revenue", "agg": "sum",
                                        "where": [{"column": "region", "op": "==", "value": "North"}]},
                              "result": {"op": "aggregate", "value": 31234.5, "rows_used": 101,
                                         "filters": ["region == North"]}}])
    ok, problems = check([{"op": "add_insight", "title": "North's total", "body": "North sold 31,234.5.",
                           "restsOn": ["L1"]}], lookups=lookups)
    assert problems == []
    assert ok[0]["restsOn"] == []
    assert ok[0]["basedOn"] == ["Looked up in the data: sum(revenue) | region == North = 31,234.5"]


def test_the_lookup_line_is_in_the_reports_language():
    line = rc.lookup_line({"query": {"op": "count"}, "result": {"op": "count", "rows": 300}}, "fr")
    assert line == "Recherché dans les données : rows = 300"


def test_a_lookup_that_failed_is_nothing_to_rest_on():
    assert rc.lookup_line({"query": {}, "result": {"op": "aggregate", "error": "no column"}}) == ""


# ── Charts DIG draws ──────────────────────────────────────────────────────────

def test_a_new_chart_is_drawn_by_dig_from_named_columns(df):
    ok, problems = check([{"op": "add_chart", "chart": {"type": "scatter", "x": "Revenue", "y": "units"},
                           "label": "Revenue against units", "insight": "i2"}], df=df)
    assert problems == []
    change = ok[0]
    assert change["chart"] == {"type": "scatter", "x": "revenue", "y": "units", "group": None, "agg": "mean"}
    assert base64.b64decode(change["picture"])[:8] == b"\x89PNG\r\n\x1a\n"


@pytest.mark.parametrize("chart, says", [
    ({"type": "pie", "x": "region"}, "not on the menu"),
    ({"type": "bar", "x": "colour"}, "There is no column called 'colour'"),
    ({"type": "scatter", "x": "region", "y": "revenue"}, "'region' is not a number column"),
    ({"type": "histogram", "x": "region"}, "not a number column"),
    ({"type": "grouped_bar", "x": "region", "y": "revenue", "group": "region"}, "different column"),
])
def test_a_chart_that_cannot_be_drawn_is_refused_with_a_reason(df, chart, says):
    ok, problems = check([{"op": "add_chart", "chart": chart, "label": "A chart"}], df=df)
    assert ok == [] and says in problems[0]


def test_no_chart_without_the_data_file():
    ok, problems = check([{"op": "add_chart", "chart": {"type": "bar", "x": "region"}, "label": "Rows"}])
    assert ok == [] and "data file is not available" in problems[0]


def test_a_report_holds_at_most_eight_charts(df):
    full = doc()
    full["charts"] = [{**doc()["charts"][1], "file": n} for n in range(8)]
    ok, problems = check([{"op": "add_chart", "chart": {"type": "bar", "x": "region"}, "label": "Rows"}],
                         full, df=df)
    assert ok == [] and "at most 8 charts" in problems[0]


def test_a_chart_is_drawn_again_as_another_kind_from_its_own_columns(df):
    ok, problems = check([{"op": "redraw_chart", "file": 0, "type": "scatter"}], df=df)
    assert ok == [] and "'month' is not a number column" in problems[0]
    ok, problems = check([{"op": "redraw_chart", "file": 0, "type": "bar"}], df=df)
    assert problems == [] and ok[0]["chart"] == {"type": "bar", "x": "month", "y": "revenue", "group": None,
                                                 "agg": "sum"}


def test_a_chart_dig_does_not_know_the_columns_of_cannot_be_drawn_again(df):
    ok, problems = check([{"op": "redraw_chart", "file": 1, "type": "line"}], df=df)
    assert ok == [] and "does not know its columns" in problems[0]


# ── Applying ──────────────────────────────────────────────────────────────────

def _applied(changes, current=None, original=None):
    current, original = current or doc(), original or doc()
    edited, added, files = rc.apply(current, original, changes)
    return rd.apply_edits(original, edited, added), files


def test_applied_changes_become_a_document_like_any_edit(df):
    ok, _ = check([{"op": "set_text", "field": "conclusion", "text": "Revenue keeps rising."},
                   {"op": "move_insight", "id": "i2", "to": 1},
                   {"op": "set_chart", "file": 1, "label": "Rows per region", "insight": "i2"}])
    result, files = _applied(ok)
    assert result["text"]["conclusion"] == "Revenue keeps rising."
    assert [i["id"] for i in result["insights"]] == ["i2", "i1"]
    assert result["charts"][1] == {**doc()["charts"][1], "label": "Rows per region", "insight": "i2"}
    assert files == {}


def test_a_new_insight_joins_what_dig_added_and_survives_later_edits_and_going_back():
    ok, _ = check([{"op": "add_insight", "title": "Units follow revenue", "body": "They move together.",
                    "restsOn": ["F2"], "after": "i1"}])
    v2, _ = _applied(ok)
    assert [i["id"] for i in v2["insights"]] == ["i1", "a1", "i2"]
    assert v2["added"]["insights"][0]["basedOn"] == ["revenue and units rise together (r = 0.82, 300 rows)"]

    # An edit in the editor may reword and move it, using the list the server keeps...
    edit = {"insights": [{"id": "a1", "title": "Units and revenue", "body": "Together."},
                         {"id": "i1", "title": "Revenue rose", "body": "Revenue rose over the year."}]}
    v3 = rd.apply_edits(doc(), edit, rd.added_of(v2))
    assert [i["id"] for i in v3["insights"]] == ["a1", "i1"]
    assert v3["insights"][0]["basedOn"] == v2["added"]["insights"][0]["basedOn"]

    # ...and going back to version 1 keeps it on the list for a later return.
    v4 = rd.apply_edits(doc(), doc(), rd.added_of(v3))
    assert [i["id"] for i in v4["insights"]] == ["i1", "i2"]
    assert rd.added_of(v4)["insights"][0]["id"] == "a1"


def test_an_edit_cannot_add_an_insight_by_sending_its_own_added_list():
    forged = {"added": {"insights": [{"id": "a1", "title": "Made up", "body": "x", "basedOn": ["Proof"]}]},
              "insights": [{"id": "a1", "title": "Made up", "body": "x"}, {"id": "i1"}]}
    result = rd.apply_edits(doc(), forged, rd.added_of(doc()))
    assert [i["id"] for i in result["insights"]] == ["i1"]
    assert "added" not in result


def test_new_charts_take_the_next_free_picture_files(df):
    ok, _ = check([{"op": "add_chart", "chart": {"type": "bar", "x": "region", "y": "revenue", "agg": "sum"},
                    "label": "Revenue by region"},
                   {"op": "redraw_chart", "file": 0, "type": "bar"}], df=df)
    result, files = _applied(ok)
    assert files == {0: 2, 1: 3}
    assert [c["file"] for c in result["charts"]] == [3, 1, 2]       # the redrawn one keeps its place
    assert result["charts"][0]["label"] == "Revenue by month"
    assert {c["file"] for c in result["added"]["charts"]} == {2, 3}
    # The picture it replaced stays, so going back can put it back.
    back = rd.apply_edits(doc(), doc(), rd.added_of(result))
    assert [c["file"] for c in back["charts"]] == [0, 1]


def test_an_analysis_holds_twenty_chart_pictures_at_most():
    full = doc()
    full["added"] = {"insights": [], "charts": [{"file": n} for n in range(2, rd.MAX_CHART_FILES)]}
    with pytest.raises(rc.Rejected):
        rc.apply(full, doc(), [{"op": "add_chart", "chart": {"type": "bar", "x": "region"}, "label": "x"}])


def test_the_files_show_a_new_insight_and_its_basis_line(df):
    ok, _ = check([{"op": "add_insight", "title": "Units follow revenue", "body": "They move together.",
                    "restsOn": ["F2"]}])
    result, _ = _applied(ok)
    files = rd.build_files(result, {0: PNG, 1: PNG})
    text = _pdf_text(files["pdf"])
    assert b"Units follow revenue" in text and b"0.82" in text


# ── Next steps ────────────────────────────────────────────────────────────────

def test_next_steps_offer_what_dig_computed_and_the_report_does_not_use():
    steps = rc.next_steps(doc(), CONTEXT)
    assert steps == [
        {"kind": "ask", "what": "insight", "about": ["revenue", "units"]},
        {"kind": "ask", "what": "insight", "about": ["revenue", "region"]},
        {"kind": "chart", "what": "relation", "about": ["revenue", "units"],
         "chart": {"type": "scatter", "x": "revenue", "y": "units"}, "label": "units against revenue"},
        {"kind": "chart", "what": "compare", "about": ["revenue", "region"],
         "chart": {"type": "box", "x": "region", "y": "revenue"}, "label": "revenue by region"},
    ]


def test_a_chart_step_is_titled_in_the_reports_language():
    d = doc()
    d["facts"]["language"] = "fr"
    assert [s.get("label") for s in rc.next_steps(d, CONTEXT) if s["kind"] == "chart"] == [
        "units selon revenue", "revenue par region"]


def test_next_steps_skip_charts_the_report_already_shows_and_charts_that_do_not_fit():
    d = doc()
    d["insights"][1]["restsOn"] = ["F2", "F3"]
    assert rc.next_steps(d, CONTEXT) == []          # F1's line chart is already there
    d["charts"] = [{**doc()["charts"][1], "file": n} for n in range(8)]
    d["insights"][1]["restsOn"] = []
    assert [s["kind"] for s in rc.next_steps(d, CONTEXT)] == ["ask", "ask"]


def test_a_long_summary_gets_a_shorten_step():
    d = doc()
    d["text"]["executiveSummary"] = "word " * 120
    d["insights"][1]["restsOn"] = ["F2", "F3"]
    assert rc.next_steps(d, CONTEXT) == [{"kind": "ask", "what": "shorten", "section": "executiveSummary"}]


# ── The chat ──────────────────────────────────────────────────────────────────

class FakeModel:
    def __init__(self, *replies):
        self.replies, self.calls = list(replies), []

    def __call__(self, messages, api_keys, accept, tracker=None, **kwargs):
        self.calls.append(messages)
        if not self.replies:
            return None, None
        reply = self.replies.pop(0)
        return accept(reply if isinstance(reply, str) else json.dumps(reply)), PROVIDER


@pytest.fixture
def model(monkeypatch):
    def install(*replies):
        fake = FakeModel(*replies)
        monkeypatch.setattr(harness, "write_report", fake)
        return fake
    return install


def test_the_owner_gets_a_checked_suggestion_to_apply(model):
    fake = model({"action": "propose", "answer": "I'd shorten the summary.",
                  "changes": [{"op": "set_text", "field": "executiveSummary", "text": "Revenue rose all year."}]})
    out = answer_question(CONTEXT, "Make the summary shorter", document=doc())
    assert out["answer"] == "I'd shorten the summary."
    assert out["proposal"]["changes"] == [{"op": "set_text", "field": "executiveSummary",
                                           "text": "Revenue rose all year."}]
    assert out["proposal"]["preview"] == [{"op": "set_text", "section": "executiveSummary",
                                           "before": "Revenue rose.", "after": "Revenue rose all year."}]
    assert out["proposal"]["warnings"] == []
    system, user = fake.calls[0][0]["content"], fake.calls[0][1]["content"]
    assert '"action": "propose"' in system and "written in English" in system
    assert "REPORT as it stands" in user and '"id":"i1"' in user


def test_the_report_is_written_in_its_own_language_whatever_the_chat_is_in(model):
    fake = model({"action": "answer", "answer": "Bien sûr."})
    d = doc()
    d["facts"]["language"] = "fa"
    answer_question(CONTEXT, "Raccourcis le résumé", document=d, ui_language="fr")
    assert "written in Persian" in fake.calls[0][0]["content"]


def test_a_wrong_change_goes_back_once_and_the_fixed_one_is_kept(model):
    fake = model(
        {"action": "propose", "answer": "Done.", "changes": [{"op": "set_insight", "id": "i3", "title": "x"}]},
        {"action": "propose", "answer": "Done.", "changes": [{"op": "set_insight", "id": "i2", "title": "North leads"}]},
    )
    out = answer_question(CONTEXT, "Retitle the second insight", document=doc())
    assert out["proposal"]["changes"] == [{"op": "set_insight", "id": "i2", "title": "North leads"}]
    assert "There is no insight 'i3'" in fake.calls[1][-1]["content"]


def test_a_figure_nobody_computed_is_sent_back_then_warned_about(model):
    fake = model(
        {"action": "propose", "answer": "Done.",
         "changes": [{"op": "set_text", "field": "conclusion", "text": "Revenue will reach 9,999,999."}]},
        {"action": "propose", "answer": "Done.",
         "changes": [{"op": "set_text", "field": "conclusion", "text": "Revenue will reach 9,999,999."}]},
    )
    out = answer_question(CONTEXT, "Add a forecast to the conclusion", document=doc())
    assert "do not appear in the ANALYSIS, REPORT or QUERY RESULTS: 9999999" in fake.calls[1][-1]["content"]
    assert out["proposal"]["warnings"] == ["9999999"]


def test_when_no_change_fits_the_owner_is_told_and_nothing_is_offered(model):
    model({"action": "propose", "answer": "Done.", "changes": [{"op": "remove_insight", "id": "i9"}]},
          {"action": "propose", "answer": "Done.", "changes": [{"op": "remove_insight", "id": "i8"}]})
    out = answer_question(CONTEXT, "Remove the fourth insight", document=doc())
    assert "proposal" not in out and "couldn't turn that into a change" in out["answer"]


def test_without_the_report_the_chat_cannot_change_anything(model):
    fake = model({"action": "propose", "answer": "Shall I shorten it?",
                  "changes": [{"op": "set_text", "field": "executiveSummary", "text": "Short."}]})
    out = answer_question(CONTEXT, "Make the summary shorter")
    assert "proposal" not in out and out["answer"] == "Shall I shorten it?"
    assert '"action": "propose"' not in fake.calls[0][0]["content"]


def test_a_new_insight_from_a_lookup_in_the_same_request(model, df):
    north = round(df.loc[df.region == "North", "revenue"].sum(), 2)
    model({"action": "query", "queries": [{"op": "aggregate", "measure": "revenue", "agg": "sum",
                                           "where": [{"column": "region", "op": "==", "value": "North"}]}]},
          {"action": "propose", "answer": "Here is an insight on North (L1).",
           "changes": [{"op": "add_insight", "title": "North's revenue", "body": f"North sold {north:,.2f}.",
                        "restsOn": ["L1"]}]})
    out = answer_question(CONTEXT, "Add an insight about North's total revenue", df=df, document=doc())
    change = out["proposal"]["changes"][0]
    assert change["basedOn"][0].startswith("Looked up in the data: sum(revenue) | region == North")
    assert out["answer"] == "Here is an insight on North."
    assert out["proposal"]["warnings"] == []


# ── The service ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    import main
    return TestClient(main.app)


def _csv(df):
    return df.to_csv(index=False).encode()


def test_the_service_draws_a_chart_as_a_suggestion(client, df):
    reply = client.post("/report/draw", data={"document_json": json.dumps(doc()), "label": "Revenue by region",
                                              "chart_json": json.dumps({"type": "bar", "x": "region",
                                                                        "y": "revenue", "agg": "sum"})},
                        files={"file": ("sales.csv", _csv(df), "text/csv")})
    assert reply.status_code == 200, reply.text
    proposal = reply.json()["proposal"]
    assert proposal["changes"][0]["op"] == "add_chart" and proposal["changes"][0]["picture"]
    assert proposal["preview"][0] == {"op": "add_chart", "chart": "Revenue by region", "after": "",
                                      "type": "bar", "under": None}


def test_the_service_says_why_a_chart_cannot_be_drawn(client, df):
    reply = client.post("/report/draw", data={"document_json": json.dumps(doc()), "label": "x",
                                              "chart_json": json.dumps({"type": "scatter", "x": "region",
                                                                        "y": "revenue"})},
                        files={"file": ("sales.csv", _csv(df), "text/csv")})
    assert reply.status_code == 422 and "not a number column" in reply.json()["error"]


def test_the_service_lists_next_steps(client):
    reply = client.post("/report/next-steps", data={"document_json": json.dumps(doc()),
                                                    "chat_context_json": json.dumps(CONTEXT)})
    assert reply.status_code == 200 and len(reply.json()["steps"]) == 4


def test_applying_from_the_chat_rebuilds_and_says_where_new_pictures_go(client, df):
    ok, _ = check([{"op": "add_chart", "chart": {"type": "bar", "x": "region"}, "label": "Rows by region again"},
                   {"op": "add_insight", "title": "Units follow revenue", "body": "Together.", "restsOn": ["F2"]}],
                  df=df)
    pictures = [rc.picture_bytes(ok[0])]
    sent = [{k: v for k, v in c.items() if k != "picture"} for c in ok]
    reply = client.post("/report/rebuild",
                        data={"original_json": json.dumps(doc()), "current_json": json.dumps(doc()),
                              "edited_json": "", "changes_json": json.dumps(sent), "warn": "false"},
                        files=[("charts", ("chart_0.png", PNG, "image/png")),
                               ("charts", ("chart_1.png", PNG, "image/png")),
                               ("new_charts", ("new_0.png", pictures[0], "image/png"))])
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["new_chart_files"] == {"0": 2}
    assert [c["file"] for c in body["document"]["charts"]] == [0, 1, 2]
    assert body["document"]["insights"][-1]["id"] == "a1"
    assert b"Units follow revenue" in _pdf_text(body["pdf_report_base64"])


def test_going_back_keeps_what_dig_added_when_the_newest_version_is_sent(client):
    newest = doc()
    newest["added"] = {"insights": [{"id": "a1", "title": "Added", "body": "x", "restsOn": ["F2"],
                                     "basedOn": ["line"]}], "charts": []}
    newest["insights"].append({"id": "a1", "title": "Added", "body": "x", "restsOn": ["F2"], "basedOn": ["line"]})
    reply = client.post("/report/rebuild", data={"original_json": json.dumps(doc()),
                                                 "edited_json": json.dumps(doc()),
                                                 "current_json": json.dumps(newest), "warn": "false"})
    body = reply.json()
    assert [i["id"] for i in body["document"]["insights"]] == ["i1", "i2"]
    assert body["document"]["added"]["insights"][0]["id"] == "a1"
    assert body["warnings"] == []


def test_the_service_passes_the_report_to_the_chat(client, monkeypatch):
    seen = {}

    def fake(context, question, history, **kw):
        seen.update(kw)
        return {"answer": "ok", "refused": False, "queries": [], "unverifiedNumbers": [], "model": "",
                "grounding": "analysis"}
    import main
    monkeypatch.setattr(main, "answer_question", fake)
    client.post("/ask", data={"question": "Shorten the summary", "context_json": json.dumps(CONTEXT),
                              "document_json": json.dumps(doc())})
    assert seen["document"]["text"]["reportTitle"] == "Sales in 2024"
    client.post("/ask", data={"question": "Shorten", "context_json": json.dumps(CONTEXT),
                              "document_json": json.dumps({"schema": 9})})
    assert seen["document"] is None
