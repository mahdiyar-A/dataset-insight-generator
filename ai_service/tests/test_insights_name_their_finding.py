"""
Every insight names the computed result it rests on.

The writer used to receive the statistics and write freely, so a fluent
paragraph with nothing under it read exactly like a real finding. Now each
result the writer sees has an id, each insight must cite the ids it stands on,
an insight citing nothing real is sent back once and then left out, and the
"Based on" line under each insight is written by DIG from the numbers.
"""

import base64
import io
import json

import pytest

import ai_engine.llm.insight_agent as insight_agent
from ai_engine.llm.evidence import based_on, basis, catalog, cited, traced, without_ids
from ai_engine.llm.stats_digest import build_digest
from ai_engine.llm.user_requests import for_prompt
from ai_engine.models.models import ChartInstruction, DomainResult, StatsSummary
from ai_engine.report_labels import LABELS, basis_line, labels_for


# ── A statistics summary with one of each kind of result ──────────────────────

def _stats() -> StatsSummary:
    return StatsSummary(
        rowCount=600, columnCount=6,
        columnTypes={"revenue": "numeric", "units": "numeric", "region": "categorical",
                     "channel": "categorical", "order_id": "categorical", "churned": "numeric"},
        missingPercentages={"revenue": 0.0},
        numericStats={"revenue": {"mean": 468.51, "median": 366.19, "min": 9.4, "max": 1775.3, "std": 300.0},
                      "units": {"mean": 14.94, "median": 15.0, "min": 1.0, "max": 29.0, "std": 8.0}},
        topCorrelations=[{"col1": "units", "col2": "revenue", "correlation": 0.713, "n": 600, "significant": True},
                         {"col1": "discount", "col2": "revenue", "correlation": -0.41, "n": 600, "significant": True}],
        categoricalSummaries={"region": {"unique_count": 4, "top_values": {"North": 230, "South": 186}},
                              "order_id": {"unique_count": 600, "top_values": {"A1": 1, "A2": 1}}},
        outlierSummary={}, detectedIssues=[],
        groupComparisons=[{"group_column": "region", "metric_column": "revenue", "eta_squared": 0.0236,
                           "effect": "small", "significant": True,
                           "highest": {"group": "North", "mean": 540.258},
                           "lowest": {"group": "South", "mean": 417.175}}],
        categoricalAssociations=[{"col1": "region", "col2": "channel", "cramers_v": 0.31, "n": 600,
                                  "significant": True}],
        missingnessPatterns=[{"column": "units", "missingPct": 4.0, "by": "channel", "kind": "category"}],
        anomalyScores={"method": "isolation_forest", "rowsScored": 600, "anomalousRows": 12, "anomalousPct": 2.0},
        domainAnalyses={"analyses": {
            "trend": {"measure": "revenue", "direction": "rising", "pValue": "0.368", "significant": False},
            "concentration": {"measure": "revenue", "groupedBy": "region", "groupCount": 4, "top1": "North",
                              "top2Share": 0.718},
            "segments": {"target": "churned", "targetKind": "binary",
                         "high": [{"segment": {"region": "South"}, "rows": 186, "share": 0.31,
                                   "value": 0.441, "rest": 0.0918}], "low": []},
            "key_drivers": {"target": "churned", "drivers": [{"feature": "region", "etaSquared": 0.164},
                                                             {"feature": "units", "rho": -0.044}]},
        }},
    )


def _domain() -> DomainResult:
    return DomainResult(domain="retail", confidence=0.95, is_analyzable=True, analysis_focus=[], key_questions=[],
                        column_decisions={"key": ["revenue"], "keep": ["region"], "drop": []},
                        attribute_interpretations={})


def _ids(stats=None):
    return catalog(build_digest(stats or _stats(), _domain()))


def _id_of(known, kind, **match):
    for i, e in known.items():
        if e["kind"] == kind and all(e["item"].get(k) == v for k, v in match.items()):
            return i
    raise AssertionError(f"no {kind} {match} in {sorted(known)}")


# ── Ids on the digest ─────────────────────────────────────────────────────────

def test_every_result_the_writer_sees_has_its_own_id():
    digest = build_digest(_stats(), _domain())
    known = catalog(digest)
    assert sorted(known, key=lambda i: int(i[1:])) == [f"F{n}" for n in range(1, len(known) + 1)]
    kinds = {e["kind"] for e in known.values()}
    assert kinds >= {"trend", "concentration", "driver", "segment", "correlation", "group_difference",
                     "association", "missing_pattern", "anomalies", "measure", "category"}
    # The ids are in the JSON the writer reads.
    for i in known:
        assert f'"id": "{i}"' in json.dumps(digest)


def test_the_same_statistics_always_get_the_same_ids():
    first, second = _ids(), _ids()
    assert {i: e["kind"] for i, e in first.items()} == {i: e["kind"] for i, e in second.items()}


def test_tagging_leaves_the_analysis_itself_unchanged():
    stats = _stats()
    build_digest(stats, _domain())
    assert "id" not in stats.categoricalAssociations[0]
    assert "id" not in stats.domainAnalyses["analyses"]["trend"]
    assert "id" not in stats.domainAnalyses["analyses"]["key_drivers"]["drivers"][0]
    assert "id" not in stats.domainAnalyses["analyses"]["segments"]["high"][0]


def test_a_column_whose_values_never_repeat_offers_no_most_common_value():
    known = _ids()
    assert not any(e["kind"] == "category" and e["column"] == "order_id" for e in known.values())
    assert any(e["kind"] == "category" and e["column"] == "region" for e in known.values())


def test_the_users_requests_get_ids_that_survive_shedding():
    requests = [{"request": f"ask {n}", "kind": "aggregate", "results": [{"op": "describe", "column": "x" * 400}]}
                for n in range(1, 4)]
    text = for_prompt(requests, limit=900)
    entries = json.loads(text)
    assert [e["id"] for e in entries] == [f"R{n}" for n in range(1, len(entries) + 1)]
    assert len(entries) < 3     # the last were shed, and the first kept their ids
    known = catalog({}, text)
    assert basis(known["R1"], "en") == 'Computed for your request: "ask 1"'


# ── Reading what the writer cited ─────────────────────────────────────────────

@pytest.mark.parametrize("given, ids", [
    (["F3", "f7"], ["F3", "F7"]),
    ("F3, [R1]; f3", ["F3", "R1"]),
    (["F", "X3", "F1234", 3, None, "F2"], ["F2"]),
    (None, []),
    ({"F1": True}, []),
])
def test_cited_ids_are_read_whatever_shape_they_come_in(given, ids):
    assert cited(given) == ids


def test_only_ids_that_name_a_real_result_count_and_at_most_three():
    known = _ids()
    assert traced(["F999", "R1"], known) == []
    assert traced(["F1", "F2", "F3", "F4"], known) == ["F1", "F2", "F3"]


def test_ids_written_into_the_prose_are_taken_out():
    assert without_ids("Revenue rose 12% (F3) in the North [F3, F7].") == "Revenue rose 12% in the North."
    assert without_ids("The F3 key stays.") == "The F3 key stays."


# ── The line a reader sees ────────────────────────────────────────────────────

def test_the_lines_say_what_each_result_is_in_plain_words():
    known = _ids()

    def line(kind, **match):
        return basis(known[_id_of(known, kind, **match)], "en")

    assert line("correlation", a="units") == "units and revenue rise together (r = 0.713, 600 rows)"
    assert line("correlation", a="discount") == "discount falls as revenue rises (r = -0.41, 600 rows)"
    assert line("group_difference", by="region") == \
        "revenue differs by region: highest North (540.26), lowest South (417.18) (η² = 0.0236)"
    # A yes/no target is a rate.
    assert line("segment", rows=186) == "region = South: 44.1% against 9.2% for the rest (186 rows)"
    # A trend that is not significant is not called rising, whatever its direction.
    assert line("trend") == "revenue: no reliable trend over the period (p = 0.368)"
    assert line("concentration") == "The largest 2 of 4 region groups hold 71.8% of all revenue, led by North"
    assert line("driver", feature="region") == "region is associated with churned (η² = 0.164)"
    assert line("measure", mean=468.51) == "revenue: average 468.51, median 366.19, from 9.4 to 1,775.3"


@pytest.mark.parametrize("language", sorted(LABELS))
def test_every_result_can_be_said_in_every_report_language(language):
    for i, entry in _ids().items():
        assert basis(entry, language), (language, i, entry["kind"])


def test_based_on_says_each_result_once_and_skips_unknown_ids():
    known = _ids()
    first = _id_of(known, "correlation", a="units")
    assert based_on([first, first, "F999"], known) == [basis(known[first])]


def test_the_based_on_line_uses_the_report_language_and_its_separator():
    insight = {"basedOn": ["a", "b"]}
    assert basis_line(insight, labels_for("en")) == "Based on: a; b"
    assert basis_line(insight, labels_for("fa"), rtl=True).endswith("a؛ b")
    assert basis_line({"basedOn": []}, labels_for("en")) == ""


# ── The writer is held to it ──────────────────────────────────────────────────

def _reply(insights, charts=None):
    return json.dumps({
        "report_title": "Sales review", "introduction": "x", "executive_summary": "North leads.",
        "insights": insights,
        "chart_instructions": charts or [{"index": 1, "chart_type": "bar", "title": "t", "x_column": "region",
                                          "y_column": "revenue", "description": "d", "insight_index": 1}],
        "data_quality_section": "The file is complete.", "gemini_confidence_score": 7,
        "confidence_note": "", "conclusion": "Done.",
    })


def _insight(rank, rests_on=None, body="North leads."):
    item = {"rank": rank, "title": f"Finding {rank}", "body": body, "insight_index": rank}
    if rests_on is not None:
        item["rests_on"] = rests_on
    return item


@pytest.fixture
def writer(monkeypatch):
    """A report writer that gives the replies it is handed, in order, and keeps the prompts."""
    state = {"replies": [], "prompts": []}

    def fake_write_report(prompt, api_keys, accept, tracker=None, **kwargs):
        from ai_engine.llm.report_writer import REPORT_PROVIDERS
        state["prompts"].append(prompt)
        reply = state["replies"][min(len(state["prompts"]), len(state["replies"])) - 1]
        return accept(reply), REPORT_PROVIDERS[0]

    monkeypatch.setattr(insight_agent, "write_report", fake_write_report)
    return state


def _generate(**kw):
    return insight_agent.generate_report(_stats(), _domain(), False, [], {"openrouter": "k"}, **kw)


def test_the_writer_is_told_to_cite_the_ids(writer):
    corr = _id_of(_ids(), "correlation", a="units")
    writer["replies"] = [_reply([_insight(1, [corr])])]
    _generate()
    prompt = writer["prompts"][0]
    assert '"rests_on"' in prompt and "Each insight must" in prompt
    assert f'"id":"{corr}"' in prompt


def test_an_insight_that_cites_a_result_keeps_it_and_says_what_it_is(writer):
    known = _ids()
    corr = _id_of(known, "correlation", a="units")
    writer["replies"] = [_reply([_insight(1, [corr], body="Units and revenue move together (F9).")])]
    report = _generate()
    assert len(writer["prompts"]) == 1                    # nothing to send back
    insight = report.insights[0]
    assert insight["restsOn"] == [corr]
    assert insight["basedOn"] == ["units and revenue rise together (r = 0.713, 600 rows)"]
    assert "(F9)" not in insight["body"]


def test_a_request_the_user_made_can_be_cited(writer):
    writer["replies"] = [_reply([_insight(1, ["R1"])])]
    requested = json.dumps([{"id": "R1", "asked": "revenue by region", "kind": "aggregate", "found": []}])
    report = _generate(requested=requested)
    assert report.insights[0]["basedOn"] == ['Computed for your request: "revenue by region"']


def test_insights_citing_nothing_are_sent_back_once_with_their_titles(writer):
    corr = _id_of(_ids(), "correlation", a="units")
    writer["replies"] = [_reply([_insight(1, []), _insight(2, ["F999"])]),
                         _reply([_insight(1, [corr]), _insight(2, [corr])])]
    report = _generate()
    assert len(writer["prompts"]) == 2
    assert '"Finding 1"; "Finding 2"' in writer["prompts"][1]
    assert [i["restsOn"] for i in report.insights] == [[corr], [corr]]
    assert "left out" not in report.dataQualitySection


def test_an_insight_still_citing_nothing_is_left_out_and_counted(writer):
    corr = _id_of(_ids(), "correlation", a="units")
    charts = [{"index": 1, "chart_type": "bar", "title": "a", "x_column": "region", "y_column": "revenue",
               "description": "d", "insight_index": 1},
              {"index": 2, "chart_type": "bar", "title": "b", "x_column": "region", "y_column": "units",
               "description": "d", "insight_index": 2}]
    stuck = _reply([_insight(1, []), _insight(2, [corr]), _insight(3, [corr])], charts)
    writer["replies"] = [stuck, stuck]
    report = _generate()
    assert len(writer["prompts"]) == 2
    assert [i["title"] for i in report.insights] == ["Finding 2", "Finding 3"]
    assert [i["rank"] for i in report.insights] == [1, 2]
    assert "Insights left out because they did not rest on a computed result: 1." in report.dataQualitySection
    # The chart drawn for the insight that went joins the charts at the end;
    # the other stays with its insight.
    by_title = {c.title: c.insightIndex for c in report.chartInstructions}
    assert by_title == {"a": 0, "b": 2}


def test_when_nothing_is_traced_the_insights_stay_with_a_warning(writer):
    stuck = _reply([_insight(1), _insight(2)])
    writer["replies"] = [stuck, stuck]
    report = _generate()
    assert len(report.insights) == 2
    assert labels_for("en")["ev_untraced"] in report.dataQualitySection


def test_a_rewrite_that_clears_the_problem_by_dropping_every_insight_is_refused(writer):
    corr = _id_of(_ids(), "correlation", a="units")
    first = _reply([_insight(1, [corr]), _insight(2, [])])
    empty = json.dumps({**json.loads(first), "insights": []})
    writer["replies"] = [first, empty]
    report = _generate()
    assert len(writer["prompts"]) == 2
    assert [i["title"] for i in report.insights] == ["Finding 1"]


def test_the_warning_and_the_left_out_line_are_in_the_report_language(writer):
    corr = _id_of(_ids(), "correlation", a="units")
    stuck = _reply([_insight(1, []), _insight(2, [corr])])
    writer["replies"] = [stuck, stuck]
    report = _generate(language="fr")
    assert labels_for("fr")["ev_left_out"].format(count=1) in report.dataQualitySection
    assert report.insights[0]["basedOn"] == [basis(_ids()[corr], "fr")]


# ── Into the files and the chat ───────────────────────────────────────────────

def _report_with_basis():
    from ai_engine.models.models import LLMReport
    return LLMReport(
        reportTitle="Sales review", introduction="x", executiveSummary="North leads.",
        insights=[{"rank": 1, "title": "Groups differ", "body": "North leads.", "insight_index": 1,
                   "restsOn": ["F5"], "basedOn": ["revenue differs by region: highest North (540.26), "
                                                  "lowest South (417.18) (η² = 0.0236)"]}],
        chartInstructions=[], dataQualitySection="", geminiConfidenceScore=7, confidenceNote="",
        conclusion="Done.", rawResponse="")


def test_word_and_powerpoint_print_the_line_under_the_insight():
    from docx import Document
    from pptx import Presentation
    from ai_engine.pptx.pptx_builder import build_pptx
    from ai_engine.word.word_builder import build_word_doc

    report = _report_with_basis()
    docx = build_word_doc(report, file_name="f.csv", domain="retail", charts=[])
    text = "\n".join(p.text for p in Document(io.BytesIO(docx)).paragraphs)
    # The numbers sit under "How we know", away from the words a reader reads first.
    assert text.index("revenue differs by region: highest North") > text.index("How we know")

    deck = Presentation(io.BytesIO(build_pptx(report, file_name="f.csv", domain="retail", charts=[])))
    slides = ["\n".join(s.text_frame.text for s in slide.shapes if s.has_text_frame) for slide in deck.slides]
    behind = [t for t in slides if "revenue differs by region: highest North" in t]
    assert behind and all("How we know" in t for t in behind)
    # The presenter still has it beside the finding, in the notes.
    notes = [s.notes_slide.notes_text_frame.text for s in deck.slides if s.has_notes_slide]
    assert any("Based on: revenue differs by region" in n for n in notes)


@pytest.mark.parametrize("language", ["en", "fa"])
def test_the_pdf_prints_the_line_under_how_we_know_and_keeps_greek_letters(language):
    from ai_engine.pdf.pdf_builder import build_pdf
    from tests.pdf_text import pdf_text
    report = _report_with_basis()
    pdf_b64 = build_pdf(report=report, charts=[], stats_summary={"rowCount": 600, "columnCount": 6},
                        was_cleaned=False, file_name="f.csv", domain=_domain(), language=language)
    pdf = base64.b64decode(pdf_b64)
    assert pdf.startswith(b"%PDF")
    text = pdf_text(pdf)
    # Shaped right-to-left pages place each letter on its own, and a fallback
    # font's letters come in separate runs: compare without the spaces.
    flat = text.replace(" ", "")
    assert "revenuediffersbyregion" in flat
    # The report's own fonts lack η; a fallback font draws it, so it is not spelled out.
    assert "η²=0.0236" in flat
    if language == "en":
        assert text.index("revenue differs by region") > text.index("How we know")


def test_the_chat_knows_what_each_insight_rests_on():
    from ai_engine.core.pipeline import _chat_context
    context = _chat_context(_stats(), _domain(), _report_with_basis(), ["revenue"], {})
    assert context["report"]["insights"][0]["basedOn"][0].startswith("revenue differs by region")


def test_the_chat_never_shows_a_person_an_id(monkeypatch):
    import ai_engine.llm.harness as harness
    from ai_engine.core.pipeline import _chat_context
    from ai_engine.llm.report_writer import ReportProvider

    seen = []

    def fake(messages, api_keys, accept, tracker=None, **kwargs):
        seen.append(messages)
        reply = {"action": "answer", "answer": "That comes from the group comparison (F5): North leads."}
        return accept(json.dumps(reply)), ReportProvider("groq", "Test model", "http://test", "m", 100, 5)

    monkeypatch.setattr(harness, "write_report", fake)
    context = _chat_context(_stats(), _domain(), _report_with_basis(), ["revenue"], {})
    out = harness.answer_question(context, "Where does the first insight come from?")
    assert out["answer"] == "That comes from the group comparison: North leads."
    assert "never write one in a reply" in seen[0][0]["content"]
