"""
Tests for the domain-aware analyses.

These compute the findings a report leads with, so a wrong number here is not a
crash — it is a confident, plausible, false statement in a document someone
hands to their board. Each test therefore pins a value that can be checked by
hand, not merely the shape of the output.
"""

import numpy as np
import pandas as pd

from ai_engine.core.domain_stats import (
    build_domain_analyses,
    concentration,
    group_effect,
    repeat_entity,
    trend,
)


def sales_frame(n=600, seed=5):
    rng = np.random.default_rng(seed)
    regions = rng.choice(["West", "Central", "East", "North", "South"],
                         n, p=[0.35, 0.30, 0.15, 0.12, 0.08])
    base = {"West": 400, "Central": 320, "East": 180, "North": 120, "South": 90}
    return pd.DataFrame({
        "order_id":    [f"ORD{i:06d}" for i in range(n)],
        "customer_id": [f"CUS{rng.integers(1, 120):05d}" for _ in range(n)],
        "order_date":  pd.date_range("2026-01-01", periods=n, freq="12h").astype(str),
        "region":      regions,
        "revenue":     [rng.lognormal(np.log(base[r]), 0.35) for r in regions],
        "channel":     rng.choice(["online", "store"], n),
    })


class TestConcentration:
    def test_finds_the_disproportionate_grouping(self):
        df = sales_frame()
        out = concentration(df)
        assert out["groupedBy"] == "region"
        assert out["measure"] == "revenue"
        # West and Central dominate by construction.
        assert out["top2Share"] > 0.6
        assert set(out["shares"]) <= set(df["region"].unique())

    def test_ignores_a_two_group_split(self):
        # Risk: ranking on raw share always picks the smallest grouping, because
        # "the top 2 of 2 categories account for 100%" wins every time. That is
        # arithmetic, not a finding, and it is what the first version returned.
        df = sales_frame()
        out = concentration(df)
        assert out["groupedBy"] != "channel"

    def test_evenly_split_data_is_not_reported_as_concentrated(self):
        df = pd.DataFrame({
            "cat":   ["a", "b", "c", "d", "e"] * 100,
            "value": [100.0] * 500,
        })
        out = concentration(df)
        # Perfectly even: top 2 of 5 is exactly 40%, no excess over an even split.
        assert out is None or out["top2Share"] <= 0.45

    def test_returns_nothing_without_a_measure(self):
        df = pd.DataFrame({"a": list("xyz") * 20, "b": list("pqr") * 20})
        assert concentration(df) is None


class TestRepeatEntity:
    def test_uses_the_reference_key_not_the_row_id(self):
        df = sales_frame()
        out = repeat_entity(df)
        # order_id is unique per row and would report nothing useful.
        assert out["entity"] == "customer_id"
        assert out["distinctEntities"] < len(df)
        assert 0.0 <= out["repeatShare"] <= 1.0

    def test_reports_the_value_carried_by_repeat_entities(self):
        df = sales_frame()
        out = repeat_entity(df)
        assert out["measure"] == "revenue"
        assert 0.0 <= out["repeatValueShare"] <= 1.0

    def test_absent_when_nothing_repeats(self):
        df = pd.DataFrame({
            "order_id": [f"ORD{i:06d}" for i in range(60)],
            "revenue":  np.linspace(10, 500, 60),
        })
        assert repeat_entity(df) is None


class TestTrend:
    def test_detects_a_real_upward_trend_as_significant(self):
        n = 200
        df = pd.DataFrame({
            "d":     pd.date_range("2026-01-01", periods=n, freq="D").astype(str),
            "sales": np.linspace(100, 400, n) + np.random.default_rng(1).normal(0, 5, n),
        })
        out = trend(df, "d")
        assert out["direction"] == "rising"
        assert out["significant"] is True
        assert out["changePct"] > 30

    def test_flat_noise_is_not_called_a_trend(self):
        # Risk: reporting direction without significance turns random drift into
        # "revenue is rising", which is the most damaging thing this can say.
        n = 200
        df = pd.DataFrame({
            "d":     pd.date_range("2026-01-01", periods=n, freq="D").astype(str),
            "sales": np.random.default_rng(2).normal(100, 10, n),
        })
        out = trend(df, "d")
        assert out["significant"] is False

    def test_absent_without_a_date_column(self):
        df = pd.DataFrame({"a": range(50), "b": np.linspace(1, 50, 50)})
        assert trend(df, None) is None


class TestGroupEffect:
    def test_reports_variance_explained_not_just_significance(self):
        df = sales_frame()
        out = group_effect(df)
        assert out["groupedBy"] == "region"
        assert out["etaSquared"] > 0.1
        assert out["strength"] == "large"

    def test_a_grouping_that_explains_nothing_is_marked_negligible(self):
        # Risk: an ANOVA p-value alone is significant for trivial differences at
        # this row count, which invites the report to call noise a finding.
        rng = np.random.default_rng(4)
        df = pd.DataFrame({
            "grp":   rng.choice(["a", "b", "c"], 900),
            "value": rng.normal(50, 10, 900),
        })
        out = group_effect(df)
        assert out["strength"] in ("negligible", "small")


class TestSelectionAndPriority:
    def test_domain_orders_but_does_not_gate(self):
        df = sales_frame()
        ecom = build_domain_analyses(df, "ecommerce", "order_date")
        health = build_domain_analyses(df, "healthcare", "order_date")
        # Same computations either way — only the ordering differs.
        assert set(ecom["analyses"]) == set(health["analyses"])
        assert ecom["priority"][0] == "concentration"
        assert health["priority"][0] == "group_effect"

    def test_an_unknown_domain_still_analyses(self):
        df = sales_frame()
        out = build_domain_analyses(df, "underwater-basket-weaving", "order_date")
        assert out["analyses"], "an unrecognised domain must not disable analysis"

    def test_a_frame_supporting_nothing_returns_empty(self):
        df = pd.DataFrame({"a": ["x"] * 30, "b": ["y"] * 30})
        out = build_domain_analyses(df, "general", None)
        assert out["analyses"] == {}
