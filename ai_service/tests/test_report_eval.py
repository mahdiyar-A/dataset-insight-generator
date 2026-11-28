"""
The report test set, its score, and offline prompt tuning. No model calls.
"""

import json

import pytest

from ai_engine.core.domain_stats import _pick_headline_measure
from ai_engine.llm import prompt_variants
from ai_engine.models.models import LLMReport
from report_eval import cases as eval_cases
from report_eval.score import score_report, summary
from report_eval.tune import decide


def _report(insights, title="Revenue review", summary_text="", writer="OpenAI gpt-oss-120b"):
    r = LLMReport(reportTitle=title, introduction="", executiveSummary=summary_text, insights=insights,
                  chartInstructions=[], dataQualitySection="", geminiConfidenceScore=7, confidenceNote="",
                  conclusion="", rawResponse="")
    r.writerModel = writer
    return r


CASE = eval_cases.Case(
    name="toy", about="", build=lambda: None, domain="sales", key=[], interpretations={},
    must=[("names the north", r"\bnorth\b")], must_not=[("claims a cause", r"\bcauses?\b")])


# ── The score ────────────────────────────────────────────────────────────────

def test_a_good_report_scores_full_marks():
    report = _report([{"title": "North leads", "body": "North sells 540 a week.", "restsOn": ["F2"]}])
    result = score_report(report, CASE, prompt="North 540", planned=["F2"], asked_insights=1)
    assert result["score"] == 100.0 and all(c["passed"] for c in result["checks"])
    assert result["fallback"] is False


def test_each_fault_costs_points():
    report = _report([{"title": "Price causes churn in F3", "body": "It fell 912 units.", "restsOn": []}])
    result = score_report(report, CASE, prompt="North 540", planned=["F2"], asked_insights=3)
    failed = {c["name"] for c in result["checks"] if not c["passed"]}
    assert failed == {"says: names the north", "never: claims a cause", "every insight rests on a result",
                      "every figure is in the statistics", "writes about the planned findings",
                      "gives the insights asked for", "no result ids in the words"}
    assert result["score"] < 20


def test_a_fallback_report_is_marked():
    result = score_report(_report([], writer=""), CASE)
    assert result["fallback"] is True
    assert summary([result])["meanWritten"] is None


# ── The cases ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("case", eval_cases.CASES, ids=lambda c: c.name)
def test_dig_finds_every_planted_truth(case):
    from ai_engine.core.stats_analyzer import build_stats_summary
    from ai_engine.llm.evidence import catalog
    from ai_engine.llm.stats_digest import build_digest
    from ai_engine.models.models import DomainResult
    from ai_engine.quality.quality_checker import check_data_quality

    df = case.build()
    assert check_data_quality(df).isUsable
    stats = build_stats_summary(df, check_data_quality(df), domain=case.domain, key_columns=case.key)
    domain = DomainResult(domain=case.domain, confidence=0.9, is_analyzable=True, analysis_focus=[],
                          key_questions=[], column_decisions={"key": case.key, "keep": []},
                          attribute_interpretations=case.interpretations)
    assert case.found(catalog(build_digest(stats, domain)))


def test_case_patterns_are_valid_and_names_are_unique():
    import re
    assert len({c.name for c in eval_cases.CASES}) == len(eval_cases.CASES)
    for case in eval_cases.CASES:
        for _, pattern in case.must + case.must_not:
            re.compile(pattern)
    with pytest.raises(SystemExit):
        eval_cases.by_name(["no_such_case"])


# ── Which number a file is about ─────────────────────────────────────────────

def test_the_main_measure_is_never_an_age_when_there_is_another():
    df = eval_cases.clinic()
    assert _pick_headline_measure(df, ["age", "wait_minutes"]) == "wait_minutes"
    assert _pick_headline_measure(df, ["age"]) == "age"


def test_the_key_columns_dig_chose_come_first():
    df = eval_cases.marketing()
    assert _pick_headline_measure(df, ["spend", "revenue", "units"]) in ("spend", "revenue")
    assert _pick_headline_measure(df, ["spend", "revenue", "units"], prefer=["units"]) == "units"
    assert _pick_headline_measure(df, ["spend", "revenue"], prefer=["region"]) in ("spend", "revenue")


# ── Prompt variants ──────────────────────────────────────────────────────────

_PROMPT = ("Intro\n═══\nENRICHED STATISTICAL DATA\n═══\n{\"F1\":1}\n"
           "\n═══\nANALYST'S PLAN — the findings\n═══\n  1. F1: x\nBuild insight 1 on finding 1.\n"
           "\n═══\nWRITING STANDARD\n═══\nWrite well.\nINSIGHT RULES:\n- Be right.\n")


def _real_prompt():
    from ai_engine.llm import insight_agent
    from ai_engine.core.stats_analyzer import build_stats_summary
    from ai_engine.models.models import DomainResult
    from ai_engine.quality.quality_checker import check_data_quality
    case = eval_cases.CASES[0]
    df = case.build()
    stats = build_stats_summary(df, check_data_quality(df), domain=case.domain, key_columns=case.key)
    domain = DomainResult(domain=case.domain, confidence=0.9, is_analyzable=True, analysis_focus=[],
                          key_questions=[], column_decisions={"key": case.key, "keep": []},
                          attribute_interpretations=case.interpretations)
    return insight_agent._build_prompt(stats, domain, False, [], insights_count=3)


@pytest.fixture(scope="module")
def real_prompt():
    return _real_prompt()


def test_plan_first_moves_the_plan_above_the_statistics(real_prompt):
    moved = prompt_variants.apply(real_prompt, "plan_first")
    assert moved.index("ANALYST'S PLAN") < moved.index("ENRICHED STATISTICAL DATA")
    assert moved.count("ANALYST'S PLAN") == 1
    assert sorted(moved.split()) == sorted(real_prompt.split())


def test_no_plan_takes_only_the_plan_out(real_prompt):
    bare = prompt_variants.apply(real_prompt, "no_plan")
    assert "ANALYST'S PLAN" not in bare and "WRITING STANDARD" in bare and "ENRICHED STATISTICAL DATA" in bare


def test_a_rule_variant_adds_one_rule(real_prompt):
    ruled = prompt_variants.apply(real_prompt, "split_before_whole")
    assert ruled.count("INSIGHT RULES:") == 1 and "inside-group figure first" in ruled


def test_an_unknown_or_broken_choice_means_the_prompt_as_written(tmp_path, monkeypatch):
    monkeypatch.setattr(prompt_variants, "CHOICE_FILE", tmp_path / "choice.json")
    assert prompt_variants.chosen() == "baseline"
    (tmp_path / "choice.json").write_text("{not json", encoding="utf-8")
    assert prompt_variants.chosen() == "baseline"
    (tmp_path / "choice.json").write_text(json.dumps({"variant": "gone_now"}), encoding="utf-8")
    assert prompt_variants.chosen() == "baseline" and prompt_variants.apply(_PROMPT) == _PROMPT
    (tmp_path / "choice.json").write_text(json.dumps({"variant": "no_plan"}), encoding="utf-8")
    assert "ANALYST'S PLAN" not in prompt_variants.apply(_PROMPT)


def test_the_shipped_choice_is_a_known_variant():
    assert prompt_variants.chosen() in prompt_variants.VARIANTS


# ── Keeping a winner ─────────────────────────────────────────────────────────

def _card(scores, fallback=False):
    results = [{"case": c, "score": s, "fallback": fallback} for c, s in scores.items()]
    return {"results": results, "summary": summary(results)}


def test_a_variant_wins_only_by_a_margin_and_without_losing_a_case():
    current = _card({"a": 70, "b": 70})
    assert decide(current, {"x": _card({"a": 72, "b": 71})}) is None              # not by enough
    assert decide(current, {"x": _card({"a": 90, "b": 75})}) == "x"
    assert decide(current, {"x": _card({"a": 99, "b": 55})}) is None              # lost a case
    assert decide(current, {"x": _card({"a": 90, "b": 90}, fallback=True)}) is None
    assert decide(_card({"a": 70}, fallback=True), {"x": _card({"a": 99})}) is None
    assert decide(current, {"x": _card({"a": 80, "b": 80}), "y": _card({"a": 85, "b": 85})}) == "y"
