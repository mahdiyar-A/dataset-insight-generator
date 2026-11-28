"""
The findings a report is about are chosen by rules before a model writes.

A free model left to pick wrote about the first block it met, often a link
between a total and its own parts, and left out the reversal inside every
region that a reader most needed. The planner ranks the results the way an
analyst would and hands the writer an ordered plan.
"""

import numpy as np
import pytest

import ai_engine.llm.insight_agent as insight_agent
from ai_engine.core.stats_analyzer import build_stats_summary
from ai_engine.llm.evidence import catalog
from ai_engine.llm.planner import MAX_WEIGHT, MIN_WEIGHT, firmness, plan, plan_block
from ai_engine.llm.stats_digest import build_digest
from ai_engine.models.models import DomainResult, LLMReport
from ai_engine.quality.quality_checker import check_data_quality
from test_confounding import simpson


def _domain(key=("y",)):
    return DomainResult(domain="sales", confidence=0.9, is_analyzable=True, analysis_focus=["Spend"],
                        key_questions=["What moves y?"], column_decisions={"key": list(key), "keep": ["region"]},
                        attribute_interpretations={"x": "spend", "y": "revenue"})


@pytest.fixture(scope="module")
def reversal():
    df = simpson()
    rng = np.random.default_rng(4)
    df["channel"] = rng.choice(["web", "store"], len(df))
    df["spend"] = df["x"] * 10 + rng.normal(0, 0.01, len(df))     # records the same thing as x
    stats = build_stats_summary(df, check_data_quality(df))
    return stats, catalog(build_digest(stats, _domain()))


def _ids_of(known, kind):
    return {fid for fid, e in known.items() if e["kind"] == kind}


def test_a_reversal_inside_the_groups_comes_first(reversal):
    stats, known = reversal
    chosen = plan(known, 4, stats.columnTypes.keys(), key_columns=["y"])
    assert chosen[0]["kind"] == "misleading"
    assert set(chosen[0]["about"]) >= {"x", "y", "region"}


def test_copies_and_calculations_are_never_planned(reversal):
    stats, known = reversal
    chosen = plan(known, 10, stats.columnTypes.keys())
    for c in chosen:
        item = known[c["id"]]["item"]
        assert not item.get("nearDuplicate")
        assert not (c["kind"] == "correlation" and item.get("misleading"))
    # spend records what x records, so the reversal is not planned twice through it
    assert sum(c["kind"] == "misleading" for c in chosen) == 1


def test_each_pick_covers_something_new(reversal):
    stats, known = reversal
    chosen = plan(known, 4, stats.columnTypes.keys())
    assert len({c["id"] for c in chosen}) == 4
    assert len({c["kind"] for c in chosen}) >= 3


def test_the_same_digest_always_gives_the_same_plan(reversal):
    stats, known = reversal
    assert plan(known, 5, stats.columnTypes.keys()) == plan(known, 5, stats.columnTypes.keys())


# ── What the person asked for ────────────────────────────────────────────────

def _known():
    return {
        "F1": {"kind": "correlation", "item": {"id": "F1", "a": "units", "b": "revenue", "r": 0.71,
                                               "strength": "strong"}},
        "F2": {"kind": "group_difference", "item": {"id": "F2", "by": "region", "measure": "revenue",
                                                    "effect": "medium", "significant": True}},
        "F3": {"kind": "group_difference", "item": {"id": "F3", "by": "channel", "measure": "discount",
                                                    "effect": "small", "significant": True}},
        "F4": {"kind": "measure", "item": {"id": "F4", "mean": 3.2}, "column": "discount"},
        "F5": {"kind": "trend", "item": {"id": "F5", "measure": "revenue", "significant": False}},
    }


COLUMNS = ["units", "revenue", "region", "channel", "discount", "date"]


def test_what_the_person_asks_about_moves_up():
    plain = [c["id"] for c in plan(_known(), 5, COLUMNS)]
    asked = [c["id"] for c in plan(_known(), 5, COLUMNS, focus=["Compare the channel"])]
    assert plain[0] != "F3" and asked[0] == "F3"


def test_what_the_person_leaves_out_is_not_planned():
    chosen = plan(_known(), 5, COLUMNS, avoid="nothing about the region please")
    assert "F2" not in [c["id"] for c in chosen]


def test_an_insignificant_trend_ranks_below_a_firm_difference():
    order = [c["id"] for c in plan(_known(), 5, COLUMNS)]
    assert order.index("F2") < order.index("F5")
    assert firmness(_known()["F5"]) < firmness(_known()["F2"])


def test_learned_weights_nudge_but_never_overturn():
    known = _known()
    # Weights outside the range are clamped to it, so no kind is ever silenced.
    assert plan(known, 5, COLUMNS, weights={"group_difference": 0.0}) == \
        plan(known, 5, COLUMNS, weights={"group_difference": MIN_WEIGHT})
    assert plan(known, 5, COLUMNS, weights={"measure": 99}) == \
        plan(known, 5, COLUMNS, weights={"measure": MAX_WEIGHT})
    assert "F2" in [c["id"] for c in plan(known, 5, COLUMNS, weights={"group_difference": 0.0})]
    # A kind readers keep rises; one they delete falls.
    kept = [c["id"] for c in plan(known, 5, COLUMNS, weights={"correlation": MAX_WEIGHT, "group_difference": MIN_WEIGHT})]
    cut = [c["id"] for c in plan(known, 5, COLUMNS, weights={"correlation": MIN_WEIGHT, "group_difference": MAX_WEIGHT})]
    assert kept.index("F1") < cut.index("F1")
    assert 0 < MIN_WEIGHT < 1 < MAX_WEIGHT < 2


# ── The writer gets the plan ─────────────────────────────────────────────────

def test_the_prompt_carries_the_plan_in_order(reversal):
    stats, known = reversal
    prompt = insight_agent._build_prompt(stats, _domain(), False, [], insights_count=3)
    assert "ANALYST'S PLAN" in prompt
    planned = plan(known, 3, stats.columnTypes.keys(), key_columns=["y"])
    block = plan_block(planned)
    assert block.strip() in prompt
    assert f"1. {planned[0]['id']}:" in prompt


def test_no_plan_when_there_is_nothing_to_plan():
    assert plan_block([]) == ""
    assert plan({}, 5, COLUMNS) == []


def _report(rests_on):
    return LLMReport(
        reportTitle="Review", introduction="x", executiveSummary="North leads.",
        insights=[{"rank": 1, "title": "Groups differ", "body": "North leads.", "insight_index": 1,
                   "restsOn": rests_on}],
        chartInstructions=[], dataQualitySection="", geminiConfidenceScore=7, confidenceNote="",
        conclusion="Done.", rawResponse="")


class _Provider:
    display_name = "test"


def test_the_one_correction_names_the_planned_findings_it_skipped():
    asked = []

    def write(prompt):
        asked.append(prompt)
        return None, None

    known = _known()
    # The draft cites nothing real, so a correction is asked for anyway.
    insight_agent._with_checks(_report(["F99"]), _Provider(), write, "prompt", {}, known, "en",
                               planned=["F2", "F1"])
    assert len(asked) == 1 and "F2" in asked[0] and "ANALYST'S PLAN" in asked[0]


def test_a_skipped_finding_alone_costs_no_model_call():
    asked = []
    insight_agent._with_checks(_report(["F1"]), _Provider(), lambda p: asked.append(p) or (None, None),
                               "prompt North leads.", {}, _known(), "en", planned=["F2"])
    assert asked == []


def test_each_kept_insight_says_what_kind_of_finding_it_is():
    report = _report(["F2"])
    insight_agent._keep_traced(report, _known(), "en")
    assert report.insights[0]["findingKind"] == "group_difference"


# ── Learning from what people keep ───────────────────────────────────────────

def test_kinds_people_delete_weigh_less_and_kinds_they_keep_more():
    from ai_engine.llm.feedback import weights
    rows = [{"domain": "sales", "kind": "correlation", "shown": 200, "removed": 120, "rewritten": 0},
            {"domain": "sales", "kind": "group_difference", "shown": 200, "removed": 10, "rewritten": 10}]
    w = weights(rows, "sales")
    assert w["correlation"] < 1 < w["group_difference"]


def test_a_handful_of_edits_barely_moves_anything():
    from ai_engine.llm.feedback import weights
    rows = [{"domain": "sales", "kind": "correlation", "shown": 3, "removed": 3},
            {"domain": "sales", "kind": "trend", "shown": 100, "removed": 10}]
    assert 0.85 < weights(rows, "sales")["correlation"] < 1


def test_another_kind_of_data_borrows_everyones_counts():
    from ai_engine.llm.feedback import weights
    rows = [{"domain": "hr", "kind": "segment", "shown": 100, "removed": 80},
            {"domain": "hr", "kind": "driver", "shown": 100, "removed": 5}]
    assert weights(rows, "retail") == weights(rows, "hr")
    assert weights(rows, "hr")["segment"] < 1


def test_nothing_counted_or_nonsense_means_no_weights():
    from ai_engine.llm.feedback import weights
    assert weights(None) == {} and weights("") == {} and weights("{bad") == {}
    assert weights([{"kind": 3}, "x", {"kind": "trend", "shown": "many"}]) == {}
    assert weights('[{"domain":"sales","kind":"trend","shown":10,"removed":50}]', "sales") == {}


def test_the_saved_report_remembers_each_insights_kind_through_an_edit():
    from ai_engine import report_document
    report = _report(["F2"])
    report.insights[0]["findingKind"] = "group_difference"
    doc = report_document.build(report, [], stats=None, domain=_domain(), was_cleaned=False,
                                dropped_columns=[], file_name="x.csv", language="en",
                                confidence_score=7, confidence_level="HIGH")
    assert doc["insights"][0]["kind"] == "group_difference"
    edited = report_document.apply_edits(doc, {"insights": [{"id": "i1", "title": "New title", "body": "New body."}]})
    assert edited["insights"][0]["kind"] == "group_difference" and edited["insights"][0]["title"] == "New title"


def test_the_writer_is_told_how_many_figures_went_out_unmatched():
    report = _report(["F1"])
    report.introduction = "Revenue rose 912%."
    insight_agent._with_checks(report, _Provider(), lambda p: (None, None), "prompt", {}, _known(), "en")
    assert report.unmatchedFigures == 1
