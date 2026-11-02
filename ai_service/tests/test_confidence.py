"""
Tests for the statistical confidence score that replaced the LLM judge.

The score is printed on every report and decides whether the user is warned
before seeing it. It must move for the right reasons — rows, completeness,
evidence, quality — and always be explainable in its own words.
"""

from ai_engine.core.confidence import assess_confidence, count_evidence, validate_chart_instructions
from ai_engine.models.models import ChartInstruction, StatsSummary


def stats(rows=5000, missing=None, correlations=(), groups=(), issues=(), analyses=None):
    return StatsSummary(
        rowCount=rows, columnCount=6, columnTypes={},
        missingPercentages=missing if missing is not None else {"a": 0.0, "b": 0.0},
        numericStats={}, topCorrelations=list(correlations), categoricalSummaries={},
        outlierSummary={}, detectedIssues=list(issues), groupComparisons=list(groups),
        domainAnalyses={"analyses": analyses or {}},
    )


STRONG_EVIDENCE = [{"col1": "price", "col2": "revenue", "correlation": 0.72},
                   {"col1": "units", "col2": "revenue", "correlation": 0.65},
                   {"col1": "units", "col2": "price", "correlation": -0.41}]


class TestScore:
    def test_large_clean_well_supported_data_scores_high(self):
        r = assess_confidence(stats(rows=30000, correlations=STRONG_EVIDENCE))
        assert r.confidence_level == "HIGH"
        assert r.confidence_score >= 8

    def test_tiny_samples_are_never_confident(self):
        # Risk: a 12-row file with two lucky correlations reading as "HIGH".
        r = assess_confidence(stats(rows=12, correlations=STRONG_EVIDENCE))
        assert r.confidence_level == "LOW"
        assert "12 rows" in r.judge_statement

    def test_missing_data_lowers_the_score_and_says_so(self):
        clean = assess_confidence(stats(correlations=STRONG_EVIDENCE))
        holey = assess_confidence(stats(missing={"a": 30.0, "b": 26.0}, correlations=STRONG_EVIDENCE))
        assert holey.confidence_score < clean.confidence_score
        assert "missing" in holey.judge_statement

    def test_no_statistical_support_lowers_the_score(self):
        r = assess_confidence(stats(rows=30000))
        assert r.confidence_score <= 7
        assert "no statistically significant patterns" in r.judge_statement

    def test_low_confidence_is_flagged_as_directional(self):
        r = assess_confidence(stats(rows=40, missing={"a": 40.0}))
        assert r.confidence_level == "LOW"
        assert r.proceed is False
        assert "directional" in r.judge_statement

    def test_score_stays_in_range(self):
        worst = assess_confidence(stats(rows=5, missing={"a": 90.0}, issues=["x"] * 9))
        assert 1 <= worst.confidence_score <= 10


class TestEvidence:
    def test_weak_correlations_do_not_count(self):
        assert count_evidence(stats(correlations=[{"col1": "a", "col2": "b", "correlation": 0.1}])) == 0

    def test_the_same_pair_is_counted_once(self):
        s = stats(correlations=[{"col1": "a", "col2": "b", "correlation": 0.6}])
        s.spearmanCorrelations = [{"col1": "b", "col2": "a", "spearman": 0.55}]
        assert count_evidence(s) == 1

    def test_significant_group_differences_and_trends_count(self):
        s = stats(groups=[{"significant": True}, {"significant": False}],
                  analyses={"trend": {"significant": True}, "group_effect": {"strength": "large"}})
        assert count_evidence(s) == 3


class TestChartValidation:
    def chart(self, x, y=None, title="c"):
        return ChartInstruction(index=1, chartType="bar", title=title, xColumn=x, yColumn=y,
                                description="", insightIndex=1, color="#000")

    def test_case_mismatches_are_fixed(self):
        kept, issues = validate_chart_instructions([self.chart("Region", "REVENUE")], ["region", "revenue"])
        assert (kept[0].xColumn, kept[0].yColumn) == ("region", "revenue")
        assert issues == []

    def test_a_chart_on_an_invented_column_is_dropped(self):
        kept, issues = validate_chart_instructions([self.chart("profit_margin", title="Margins")], ["region"])
        assert kept == []
        assert "Margins" in issues[0]

    def test_an_unknown_y_column_is_cleared_but_the_chart_kept(self):
        kept, _ = validate_chart_instructions([self.chart("region", "made_up")], ["region"])
        assert kept[0].yColumn is None
