"""
The statistical procedures every finding is computed with, checked against
scipy, and the key-driver and segment analyses on data with a known answer.
"""

import math

import numpy as np
import pandas as pd
import pytest
from scipy import stats

from ai_engine.core.drivers import key_drivers, pick_target, segments
from ai_engine.core.stat_tests import (
    bh_adjust,
    cohens_d,
    correlation_p_value,
    cramers_v,
    eta_squared,
    fisher_ci,
    gini,
    mann_kendall,
    pareto_share,
    robust_outliers,
)

rng = np.random.default_rng(42)


# ── Procedures against scipy ──────────────────────────────────────────────────

def test_benjamini_hochberg_matches_scipy_and_skips_missing():
    p = rng.uniform(0, 0.2, 40)
    assert bh_adjust(list(p)) == pytest.approx(list(stats.false_discovery_control(p, method="bh")))
    out = bh_adjust([0.01, None, 0.04, float("nan")])
    assert out[1] is None and out[3] is None
    assert out[0] == pytest.approx(0.02) and out[2] == pytest.approx(0.04)


def test_correlation_p_value_and_interval_match_scipy():
    x = rng.normal(size=80)
    y = 0.4 * x + rng.normal(size=80)
    res = stats.pearsonr(x, y)
    assert correlation_p_value(res.statistic, 80) == pytest.approx(res.pvalue, rel=1e-6)
    ci = res.confidence_interval(0.95)
    assert fisher_ci(res.statistic, 80) == pytest.approx((ci.low, ci.high), rel=1e-6)
    assert correlation_p_value(0.5, 2) is None


def test_eta_squared_agrees_with_the_anova_f():
    groups = [rng.normal(m, 1, 50) for m in (0, 0.5, 1.2)]
    f = stats.f_oneway(*groups).statistic
    k, n = 3, 150
    assert eta_squared(groups) == pytest.approx(f * (k - 1) / (f * (k - 1) + (n - k)), rel=1e-9)


def test_cohens_d_on_a_known_gap():
    a = np.array([2.0, 4, 6, 8, 10])
    b = np.array([1.0, 3, 5, 7, 9])
    pooled = math.sqrt((a.var(ddof=1) + b.var(ddof=1)) / 2)
    assert cohens_d(a, b) == pytest.approx(1 / pooled)


def test_cramers_v_uses_scipys_chi_square_and_corrects_for_noise():
    table = np.array([[30, 10], [10, 30]])
    out = cramers_v(table)
    chi2, p, dof, _ = stats.chi2_contingency(table, correction=False)
    assert out["chi2"] == pytest.approx(chi2) and out["p"] == pytest.approx(p) and out["dof"] == dof
    assert 0.4 < out["v"] < 0.55
    noise = rng.integers(20, 30, size=(6, 6))
    assert cramers_v(noise)["v"] < 0.1     # the uncorrected V of a noise table is inflated
    assert cramers_v(np.array([[5, 0], [0, 0]])) is None


def test_mann_kendall_matches_kendall_tau_and_sens_slope():
    y = np.arange(30) * 2.0 + rng.normal(0, 3, 30)
    out = mann_kendall(y)
    tau = stats.kendalltau(np.arange(30), y)
    assert out["tau"] == pytest.approx(tau.statistic) and out["p"] == pytest.approx(tau.pvalue)
    assert out["senSlope"] == pytest.approx(stats.theilslopes(y, np.arange(30)).slope)
    assert mann_kendall([5, 5, 5, 5, 5]) is None and mann_kendall([1, 2, 3]) is None


def test_robust_outliers_are_not_hidden_by_each_other():
    values = np.concatenate([rng.normal(100, 5, 200), [400, 420, -300]])
    out = robust_outliers(values)
    assert out["count"] == 3 and out["high"] == 2 and out["low"] == 1
    assert robust_outliers(np.array([1.0] * 20 + [2.0])) is None   # MAD of zero


def test_gini_and_pareto_on_known_distributions():
    assert gini([5] * 10) == pytest.approx(0.0)
    assert gini([0] * 9 + [10]) == pytest.approx(0.9)
    share = pareto_share([100] + [1] * 9)
    assert share["topShare"] == pytest.approx(101 / 109)
    assert share["holdersFor80Pct"] == 1
    assert gini([-1, 2, 3]) is None


# ── Drivers and segments on data with a known answer ──────────────────────────

@pytest.fixture(scope="module")
def churn() -> pd.DataFrame:
    r = np.random.default_rng(7)
    n = 900
    contract = r.choice(["monthly", "yearly", "two-year"], n, p=[0.5, 0.3, 0.2])
    tenure = r.integers(1, 72, n)
    region = r.choice(["North", "South", "East", "West"], n)
    logit = (-1.2 + np.where(contract == "monthly", 1.6, -0.8) - 0.03 * tenure
             + np.where(region == "South", 0.9, 0.0))
    churned = r.uniform(size=n) < 1 / (1 + np.exp(-logit))
    return pd.DataFrame({
        "customer_id": [f"C{i:05d}" for i in range(n)],
        "contract": contract,
        "tenure_months": tenure,
        "region": region,
        "favourite_colour": r.choice(["red", "green", "blue"], n),
        "monthly_fee": r.uniform(20, 120, n).round(2),
        "churn": np.where(churned, "Yes", "No"),
    })


def test_an_outcome_column_is_the_target(churn):
    target = pick_target(churn, headline="monthly_fee")
    assert target == {"column": "churn", "kind": "binary", "positive": "Yes"}


def test_key_drivers_rank_the_real_causes_above_noise(churn):
    out = key_drivers(churn, headline="monthly_fee")
    drivers = {d["feature"]: d for d in out["drivers"]}
    names = list(drivers)
    assert out["target"] == "churn" and out["targetKind"] == "binary"
    assert names[0] == "contract"
    assert set(names[:3]) == {"contract", "region", "tenure_months"}
    assert all(drivers[c]["significant"] for c in names[:3])
    assert not drivers["favourite_colour"]["significant"] and not drivers["monthly_fee"]["significant"]
    assert drivers["contract"]["highest"] == "monthly" and drivers["tenure_months"]["direction"] == "lower"
    assert "customer_id" not in names                       # identifiers are not drivers
    assert "Associations, not causes" in out["note"]
    assert out["model"]["metric"] == "roc_auc" and out["model"]["score"] > 0.65
    assert 0.1 < out["overallRate"] < 0.6


def test_a_noisy_model_share_cannot_lift_noise_above_a_proven_driver(churn, monkeypatch):
    import ai_engine.core.drivers as drivers

    def noisy(df, y, nums, cats, binary, seed=0):
        shares = {c: 0.01 for c in nums + cats}
        shares["favourite_colour"] = 0.9                      # a lucky permutation
        return {"metric": "roc_auc", "score": 0.75, "rowsUsed": len(df), "importance": shares}

    monkeypatch.setattr(drivers, "_model_importance", noisy)
    names = [d["feature"] for d in key_drivers(churn, headline="monthly_fee")["drivers"]]
    assert names.index("favourite_colour") > names.index("tenure_months")


def test_a_copy_of_the_target_is_excluded_not_ranked():
    r = np.random.default_rng(1)
    n = 500
    units = r.integers(1, 40, n)
    df = pd.DataFrame({"units": units, "region": r.choice(["A", "B", "C"], n),
                       "revenue": units * 9.5 + r.normal(0, 3, n)})
    df["revenue_usd"] = df["revenue"] * 1.36
    out = key_drivers(df, headline="revenue")
    assert out["target"] == "revenue"
    assert "revenue_usd" in out["excludedAsDerived"]
    assert "revenue_usd" not in [d["feature"] for d in out["drivers"]]


def test_segments_find_the_group_that_stands_out(churn):
    out = segments(churn, headline="monthly_fee")
    assert out["target"] == "churn"
    top = out["high"][0]
    assert top["segment"] in ({"contract": "monthly"}, {"contract": "monthly", "region": "South"},
                              {"region": "South", "contract": "monthly"})
    assert top["value"] > top["rest"] and top["q"] < 0.05 and top["lift"] > 1
    flat = churn.assign(churn=np.random.default_rng(3).choice(["Yes", "No"], len(churn)))
    noise = segments(flat.drop(columns=["contract", "tenure_months", "region"]), headline=None)
    assert noise is None or noise["high"] == []
