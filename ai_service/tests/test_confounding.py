"""
Correlations that groups reverse or explain away, on data with a known answer.

The failure that matters most here is a false alarm: telling someone a real
relationship is an illusion. Most of these tests are about staying quiet.
"""

from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
from scipy import stats as scipy_stats

from ai_engine.core.confidence import count_evidence
from ai_engine.core.confounding import (
    _edge_rows,
    _measure,
    _measures_cut_groups,
    check_correlations,
    misleading_pairs,
)
from ai_engine.core.stats_analyzer import _correlations, build_stats_summary
from ai_engine.llm.insight_agent import _build_fallback_report
from ai_engine.llm.stats_digest import _correlations as digest_correlations
from ai_engine.llm.stats_digest import build_digest
from ai_engine.models.models import DomainResult, StatsSummary


def pair(df, a="x", b="y"):
    """The correlation row stats_analyzer would produce for two columns."""
    return [c for c in _correlations(df, [a, b], "pearson")]


def simpson(seed=1, per_group=150):
    """Inside each region y falls as x rises, but richer regions have more of both."""
    rng = np.random.default_rng(seed)
    frames = []
    for level, centre in zip(("North", "East", "South", "West"), (0.0, 4.0, 8.0, 12.0)):
        x = rng.normal(centre, 2.0, per_group)
        y = 3.0 * centre - 0.8 * (x - centre) + rng.normal(0, 1.0, per_group)
        frames.append(pd.DataFrame({"x": x, "y": y, "region": level}))
    return pd.concat(frames, ignore_index=True)


def confounded(seed=2, per_group=150):
    """x and y each differ by group and are unrelated beyond that."""
    rng = np.random.default_rng(seed)
    frames = []
    for level, centre in zip("ABCD", (0.0, 3.0, 6.0, 9.0)):
        frames.append(pd.DataFrame({
            "x": rng.normal(centre, 1.5, per_group),
            "y": rng.normal(centre * 2, 1.5, per_group),
            "plant": level,
        }))
    return pd.concat(frames, ignore_index=True)


def exact(within_r, shift_x, shift_y, per_group, seed=8):
    """
    Two groups, each with exactly this correlation inside it.

    The groups sit at -shift and +shift, so across both the correlation is
    (within_r + shift_x * shift_y) / sqrt((1 + shift_x^2) * (1 + shift_y^2)).
    """
    rng = np.random.default_rng(seed)
    frames = []
    for level, side in (("a", -1), ("b", 1)):
        raw = rng.normal(size=(per_group, 2))
        raw -= raw.mean(axis=0)
        first = raw[:, 0] / raw[:, 0].std()
        second = raw[:, 1] - (raw[:, 1] @ first) / (first @ first) * first
        second /= second.std()
        frames.append(pd.DataFrame({
            "x": first + side * shift_x,
            "y": within_r * first + np.sqrt(1 - within_r ** 2) * second + side * shift_y,
            "g": level,
        }))
    return pd.concat(frames, ignore_index=True)


def genuine(seed=3, rows=600):
    """y follows x the same way in every group."""
    rng = np.random.default_rng(seed)
    x = rng.normal(0, 1, rows)
    return pd.DataFrame({
        "x": x,
        "y": 2 * x + rng.normal(0, 1, rows),
        "region": rng.choice(["North", "South", "East"], rows),
    })


# ── What it finds ─────────────────────────────────────────────────────────────

def test_finds_a_correlation_that_reverses_inside_every_group():
    df = simpson()
    rows = pair(df)
    assert rows[0]["correlation"] > 0.5, "the overall picture must look positive for this to mean anything"

    found = check_correlations(df, rows, ["region"])

    assert len(found) == 1
    item = found[0]
    assert item["kind"] == "reversed"
    assert item["by"] == "region"
    assert item["overallR"] > 0.5
    assert item["withinR"] < -0.5
    assert all(g["r"] < 0 for g in item["groups"])
    assert item["n"] == len(df)


def test_finds_a_correlation_that_groups_explain_away():
    df = confounded()
    rows = pair(df)
    assert rows[0]["correlation"] > 0.5

    found = check_correlations(df, rows, ["plant"])

    assert [f["kind"] for f in found] == ["vanished"]
    assert abs(found[0]["withinR"]) < 0.1


def test_matches_the_textbook_partial_correlation():
    # Regressing both measures on group dummies and correlating the residuals
    # is the definition; the group-mean shortcut must agree with it.
    df = simpson()
    dummies = pd.get_dummies(df["region"], dtype=float).to_numpy()

    def residuals(col):
        beta, *_ = np.linalg.lstsq(dummies, df[col].to_numpy(), rcond=None)
        return df[col].to_numpy() - dummies @ beta

    expected = np.corrcoef(residuals("x"), residuals("y"))[0, 1]

    found = check_correlations(df, pair(df), ["region"])

    assert found[0]["withinR"] == pytest.approx(expected, abs=1e-3)


def test_the_p_value_matches_a_regression_with_group_terms():
    # Removing group means costs a degree of freedom per group. The t test on
    # x in y ~ x + groups is the standard answer, worked out independently.
    rng = np.random.default_rng(11)
    group = rng.integers(0, 6, 600)
    x = rng.normal(size=600) + group
    y = 0.15 * x + rng.normal(size=600) + group
    design = np.column_stack([x, (group[:, None] == np.arange(6)).astype(float)])
    beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    residuals = y - design @ beta
    freedom = 600 - design.shape[1]
    variance = residuals @ residuals / freedom * np.linalg.inv(design.T @ design)[0, 0]
    expected = 2 * scipy_stats.t.sf(abs(beta[0]) / np.sqrt(variance), freedom)

    measured = _measure(x, y, group, list("abcdef"))

    assert measured["p"] == pytest.approx(expected, rel=1e-6)


def test_reports_a_pair_once_for_the_category_that_changes_it_most():
    # Sites sit inside regions: both reverse the correlation, sites more fully.
    rng = np.random.default_rng(4)
    frames = []
    for region, base in zip("ABCD", (0.0, 8.0, 16.0, 24.0)):
        for site, centre in (("1", base), ("2", base + 1.0)):
            x = rng.normal(centre, 2.0, 100)
            y = 3.0 * centre - 0.8 * (x - centre) + rng.normal(0, 1.0, 100)
            frames.append(pd.DataFrame({"x": x, "y": y, "region": region, "site": region + site}))
    df = pd.concat(frames, ignore_index=True)
    df["noise"] = rng.choice(["p", "q"], len(df))
    assert [f["kind"] for f in check_correlations(df, pair(df), ["region"])] == ["reversed"]

    found = check_correlations(df, pair(df), ["noise", "region", "site"])

    assert len(found) == 1
    assert found[0]["by"] == "site"


def test_reports_at_most_three():
    rng = np.random.default_rng(14)
    frames = []
    for level, centre in zip(("North", "East", "South", "West"), (0.0, 4.0, 8.0, 12.0)):
        columns = {"region": level}
        for i in range(4):
            x = rng.normal(centre, 2.0, 100)
            columns[f"x{i}"] = x
            columns[f"y{i}"] = 3.0 * centre - 0.8 * (x - centre) + rng.normal(0, 1.0, 100)
        frames.append(pd.DataFrame(columns))
    df = pd.concat(frames, ignore_index=True)
    rows = [{"col1": f"x{i}", "col2": f"y{i}", "correlation": 0.8, "significant": True} for i in range(4)]

    assert len(check_correlations(df, rows, ["region"])) == 3


# ── When it must stay quiet ───────────────────────────────────────────────────

def test_a_real_relationship_is_left_alone():
    df = genuine()

    assert check_correlations(df, pair(df), ["region"]) == []


@pytest.mark.parametrize("seed", range(20))
def test_no_false_alarms_on_real_relationships_across_seeds(seed):
    df = genuine(seed=seed)

    assert check_correlations(df, pair(df), ["region"]) == []


def test_a_category_that_only_bands_the_measure_is_not_an_explanation():
    # Risk: inside age bands the range of age is narrow, so its correlation
    # with anything shrinks. That would read as "age doesn't really matter".
    rng = np.random.default_rng(5)
    age = rng.uniform(20, 70, 800)
    df = pd.DataFrame({"x": age, "y": age * 0.1 + rng.normal(0, 1.5, 800)})
    df["band"] = pd.cut(df["x"], [0, 30, 40, 50, 60, 100], labels=["20s", "30s", "40s", "50s", "60s"]).astype(str)

    assert check_correlations(df, pair(df), ["band"]) == []


def test_a_category_that_nearly_bands_the_measure_is_not_an_explanation():
    # Risk: bands with a few rows in the wrong place pass the exact check, and
    # r still collapses because each band is narrow. The slope gives it away.
    rng = np.random.default_rng(9)
    x = rng.uniform(0, 100, 6000)
    df = pd.DataFrame({"x": x, "y": 0.05 * x + rng.normal(0, 2, 6000)})
    df["band"] = (x // 5).astype(int).astype(str)
    wrong = rng.choice(len(df), 30, replace=False)
    df.loc[wrong, "band"] = rng.choice(df["band"].unique(), 30)
    rows = pair(df)
    assert rows[0]["correlation"] > 0.5

    assert check_correlations(df, rows, ["band"]) == []


def test_a_category_that_nearly_bands_the_other_measure_is_not_an_explanation():
    rng = np.random.default_rng(10)
    x = rng.uniform(0, 100, 6000)
    df = pd.DataFrame({"y": x, "x": 0.05 * x + rng.normal(0, 2, 6000)})
    df["band"] = (x // 5).astype(int).astype(str)
    wrong = rng.choice(len(df), 30, replace=False)
    df.loc[wrong, "band"] = rng.choice(df["band"].unique(), 30)

    assert check_correlations(df, pair(df), ["band"]) == []


def test_one_odd_group_cannot_call_the_whole_file_reversed():
    # South is small but so spread out that it sets the pooled figure, and it
    # alone runs the other way. Most rows do not.
    rng = np.random.default_rng(12)
    frames = []
    for level, centre, rows, spread, slope in (("North", 0, 400, 1, 0.5), ("East", 20, 400, 1, 0.5),
                                               ("South", 40, 100, 10, -1.0)):
        x = rng.normal(0, spread, rows)
        frames.append(pd.DataFrame({"x": centre + x, "y": centre + slope * x + rng.normal(0, 0.5, rows),
                                    "region": level}))
    df = pd.concat(frames, ignore_index=True)
    rows = pair(df)
    assert rows[0]["correlation"] > 0.5
    assert _measure(df["x"].to_numpy(), df["y"].to_numpy(), *pd.factorize(df["region"]))["within"] < -0.5

    assert check_correlations(df, rows, ["region"]) == []


@pytest.mark.parametrize("seed", range(10))
def test_narrow_bands_stay_quiet_across_seeds(seed):
    rng = np.random.default_rng(seed)
    x = rng.uniform(0, 100, 4000)
    df = pd.DataFrame({"x": x, "y": 0.05 * x + rng.normal(0, 2, 4000), "band": (x // 5).astype(int).astype(str)})

    assert check_correlations(df, pair(df), ["band"]) == []


def test_a_measure_set_once_per_group_is_not_an_explanation():
    # A regional budget is constant inside each region: removing group means
    # leaves only rounding error, which must not be read as a correlation.
    df = genuine()
    df["x"] = df["region"].map({"North": 1.1, "South": 2.3, "East": 3.7})
    df["y"] = df["x"] * 2 + np.random.default_rng(13).normal(0, 1, len(df))
    rows = pair(df)
    assert rows[0]["correlation"] > 0.5

    assert check_correlations(df, rows, ["region"]) == []


def test_a_weak_correlation_is_not_checked():
    rows = [{"col1": "x", "col2": "y", "correlation": 0.2, "significant": True}]

    assert check_correlations(simpson(), rows, ["region"]) == []


def test_judged_on_the_rows_measured_not_the_figure_it_was_handed():
    # Dropping small groups can leave a correlation too weak to be a finding,
    # whatever it was across every row.
    df = exact(within_r=0.02, shift_x=0.3, shift_y=0.3, per_group=5000)
    rows = [{"col1": "x", "col2": "y", "correlation": 0.8, "significant": True}]

    assert check_correlations(df, rows, ["g"]) == []


def test_a_reversal_too_small_to_matter_is_not_called_one():
    # Plenty of rows make -0.05 significant. It is still next to nothing.
    df = exact(within_r=-0.05, shift_x=1.0, shift_y=1.0, per_group=20000)
    rows = [{"col1": "x", "col2": "y", "correlation": 0.47, "significant": True}]

    assert [f["kind"] for f in check_correlations(df, rows, ["g"])] == ["vanished"]


@pytest.mark.parametrize("per_group, kinds", [(30, []), (600, ["reversed"])])
def test_a_reversal_must_be_significant(per_group, kinds):
    df = exact(within_r=-0.15, shift_x=1.0, shift_y=1.0, per_group=per_group)
    rows = [{"col1": "x", "col2": "y", "correlation": 0.42, "significant": True}]

    assert [f["kind"] for f in check_correlations(df, rows, ["g"])] == kinds


def test_half_the_slope_left_is_not_vanished():
    # 0.09 looks like nothing beside 0.37, but the groups narrowed y far more
    # than x, and as a slope about half the relationship is still there.
    df = exact(within_r=0.09, shift_x=0.4, shift_y=2.0, per_group=10000)
    rows = [{"col1": "x", "col2": "y", "correlation": 0.37, "significant": True}]

    assert check_correlations(df, rows, ["g"]) == []


def test_an_insignificant_correlation_is_not_checked():
    rows = [{"col1": "x", "col2": "y", "correlation": 0.8, "significant": False}]

    assert check_correlations(simpson(), rows, ["region"]) == []


def test_near_duplicates_are_not_checked():
    rows = [{"col1": "x", "col2": "y", "correlation": 0.8, "significant": True, "nearDuplicate": True}]

    assert check_correlations(simpson(), rows, ["region"]) == []


def test_groups_too_small_to_trust_are_not_used():
    df = simpson(per_group=20)

    assert check_correlations(df, pair(df), ["region"]) == []


def test_a_few_big_groups_among_many_small_ones_are_not_enough():
    # Risk: judging a file by the 60% of rows that happen to sit in big groups.
    df = simpson(per_group=150)
    df.loc[df.index[: int(len(df) * 0.4)], "region"] = [f"tiny{i}" for i in range(int(len(df) * 0.4))]

    assert check_correlations(df, pair(df), ["region"]) == []


@pytest.mark.parametrize("per_group, kinds", [(30, []), (300, ["vanished"])])
def test_a_small_sample_cannot_pass_for_an_explanation(per_group, kinds):
    # The same correlations at two sizes. With 60 rows the interval around the
    # leftover r still reaches the overall r, so it explains nothing yet.
    df = exact(within_r=0.09, shift_x=0.58, shift_y=0.58, per_group=per_group)
    rows = [{"col1": "x", "col2": "y", "correlation": 0.32, "significant": True}]

    assert [f["kind"] for f in check_correlations(df, rows, ["g"])] == kinds


def test_survives_awkward_columns():
    df = simpson()
    df["constant"] = 1.0
    df.loc[df.index[::7], "x"] = np.nan
    df["all_missing"] = None
    rows = pair(df) + [{"col1": "x", "col2": "constant", "correlation": 0.9, "significant": True},
                       {"col1": "x", "col2": "not_a_column", "correlation": 0.9, "significant": True}]

    found = check_correlations(df, rows, ["region", "all_missing", "not_a_category"])

    assert [f["kind"] for f in found] == ["reversed"]
    assert found[0]["n"] < len(df), "n counts only the rows both measures have"


def test_a_group_where_a_measure_never_changes_is_left_out_of_the_groups():
    df = simpson()
    df.loc[df["region"] == "West", "x"] = 12.0

    found = check_correlations(df, pair(df), ["region"])

    assert {g["group"] for g in found[0]["groups"]} == {"North", "East", "South"}


def test_no_correlations_or_no_categories():
    assert check_correlations(simpson(), [], ["region"]) == []
    assert check_correlations(simpson(), pair(simpson()), []) == []


# ── How a finding reaches the report ──────────────────────────────────────────

def summary(checks, correlations=None):
    rows = correlations if correlations is not None else [
        {"col1": "x", "col2": "y", "correlation": 0.7, "n": 600, "significant": True, "strength": "strong"},
        {"col1": "p", "col2": "q", "correlation": 0.6, "n": 600, "significant": True, "strength": "strong"},
    ]
    return StatsSummary(
        rowCount=600, columnCount=4, columnTypes={}, missingPercentages={}, numericStats={},
        topCorrelations=rows, categoricalSummaries={}, outlierSummary={}, detectedIssues=[],
        correlationChecks=checks,
    )


CHECK = {"a": "x", "b": "y", "by": "region", "kind": "reversed", "overallR": 0.7, "withinR": -0.5,
         "n": 600, "q": 0.001, "groups": []}
DOMAIN = DomainResult(domain="sales", confidence=0.9, is_analyzable=True, analysis_focus=[],
                      key_questions=[], column_decisions={}, attribute_interpretations={})


def test_misleading_pairs_ignores_column_order():
    assert frozenset(("y", "x")) in misleading_pairs([CHECK])
    assert misleading_pairs(None) == set()


def test_the_digest_marks_the_correlation_itself():
    # Risk: a warning in a separate block is easy for a writer to miss.
    rows = digest_correlations(summary([CHECK]))

    flagged = next(r for r in rows if r["a"] == "x")
    other = next(r for r in rows if r["a"] == "p")
    assert flagged["misleading"] == "reversed within region"
    assert "misleading" not in other


def test_a_misleading_correlation_does_not_count_as_evidence():
    assert count_evidence(summary([CHECK])) == count_evidence(summary([])) - 1


def test_the_fallback_report_does_not_headline_a_misleading_correlation():
    # Risk: with no model available, the fallback quotes the top correlation.
    report = _build_fallback_report(summary([CHECK]), DOMAIN)

    text = " ".join(i["body"] for i in report.insights)
    assert "between x and y" not in text
    assert "between p and q" in text
    assert "identified 1 notable" in report.executiveSummary


@pytest.mark.parametrize("flag", [{"significant": False}, {"nearDuplicate": True}])
def test_the_fallback_report_only_headlines_a_real_finding(flag):
    rows = [{"col1": "x", "col2": "y", "correlation": 0.99, **flag},
            {"col1": "p", "col2": "q", "correlation": 0.6, "significant": True}]

    report = _build_fallback_report(summary([], rows), DOMAIN)

    assert "between p and q" in " ".join(i["body"] for i in report.insights)


def test_from_a_file_to_the_digest():
    stats = build_stats_summary(simpson(), SimpleNamespace(warnings=[], errors=[]))

    digest = build_digest(stats, DOMAIN)

    assert [c["by"] for c in stats.correlationChecks] == ["region"]
    item = digest["misleading_correlations"][0]
    assert item["kind"] == "reversed"
    assert item["overall_r"] > 0 > item["within_groups_r"]
    assert digest["correlations"][0]["misleading"] == "reversed within region"


def test_a_digest_with_nothing_misleading_says_nothing():
    stats = build_stats_summary(genuine(), SimpleNamespace(warnings=[], errors=[]))

    assert "misleading_correlations" not in build_digest(stats, DOMAIN)


# --- Categories calculated from the measures ---------------------------------
# Tiers set on x + y force a relationship: inside a tier a low x has to come with
# a high y. Every file below would report a false finding without the guard.


def correlated(rng, n=2000, r=0.5):
    shared = rng.standard_normal(n)
    return (np.sqrt(r) * shared + np.sqrt(1 - r) * rng.standard_normal(n),
            np.sqrt(r) * shared + np.sqrt(1 - r) * rng.standard_normal(n))


def tiers(score, k=3):
    return pd.qcut(score, k, labels=[f"t{i}" for i in range(k)]).astype(str)


def checked(df, by="tier"):
    """The kinds reported, with every number in the file offered as a measure."""
    measures = [c for c in df.columns if c != by]
    return [c["kind"] for c in check_correlations(df, pair(df), [by], measures)]


def on_the_sum(rng):
    x, y = correlated(rng)
    return pd.DataFrame({"x": x, "y": y, "tier": tiers(x + y)})


def in_two_tiers(rng):
    x, y = correlated(rng)
    return pd.DataFrame({"x": x, "y": y, "tier": tiers(x + y, 2)})


def on_a_weighted_sum(rng):
    x, y = correlated(rng)
    return pd.DataFrame({"x": x, "y": y, "tier": tiers(0.7 * x + 0.3 * y)})


def on_skewed_money(rng):
    x, y = np.exp(correlated(rng))
    return pd.DataFrame({"x": x, "y": y, "tier": tiers(x + y)})


def on_unequal_skewed_money(rng):
    x, y = np.exp(correlated(rng))
    return pd.DataFrame({"x": x, "y": y, "tier": tiers(x + 3 * y)})


def on_a_total_in_the_file(rng):
    x, y = correlated(rng)
    total = x + y + rng.standard_normal(len(x))
    return pd.DataFrame({"x": x, "y": y, "total": total, "tier": tiers(total)})


def on_three_measures(rng, n=2000):
    x, y = correlated(rng, n)
    z = rng.standard_normal(n)
    return pd.DataFrame({"x": x, "y": y, "z": z, "tier": tiers(x + y + z)})


def on_three_measures_among_others(rng, n=2000, others=4):
    df = on_three_measures(rng, n)
    for i in range(others):
        df[f"other{i}"] = rng.standard_normal(n)
    return df


def on_a_product_in_the_file(rng):
    x, y = np.exp(correlated(rng))
    return pd.DataFrame({"x": x, "y": y, "product": x * y, "tier": tiers(x * y)})


def in_whole_number_bands(rng):
    x, y = correlated(rng)
    age = np.round(x * 10 + 40)
    return pd.DataFrame({"x": age, "y": y, "tier": tiers(age, 4)})


def with_holes(rng):
    df = on_the_sum(rng)
    df.loc[rng.choice(len(df), 100, replace=False), "x"] = np.nan
    return df


def with_holes_in_the_third_measure(rng):
    df = on_three_measures(rng)
    df.loc[rng.choice(len(df), 100, replace=False), "z"] = np.nan
    return df


def with_blank_labels(rng):
    df = on_the_sum(rng)
    df.loc[rng.choice(len(df), 100, replace=False), "tier"] = np.nan
    return df


def with_a_stray_label(rng):
    df = on_the_sum(rng)
    df.loc[rng.choice(len(df), 5, replace=False), "tier"] = "unknown"
    return df


def rating(values, top):
    """Normal values as whole-number answers on a scale of 1 to top."""
    return np.clip(np.round((values + 2.5) / 5 * (top - 1)) + 1, 1, top)


def regions(rng, gap, inside=0.0, noise=None, n=2000):
    """Three real groups this many noise SDs apart, with this correlation inside each."""
    noise = noise or rng.standard_normal
    group = rng.integers(0, 3, n)
    x = noise(n)
    y = inside * x + np.sqrt(1 - inside ** 2) * noise(n)
    return pd.DataFrame({"x": gap * group + x, "y": gap * group + y, "tier": [f"g{g}" for g in group]})


def test_tiers_on_a_sum_really_do_turn_a_relationship_over():
    df = on_the_sum(np.random.default_rng(0))

    found = _measure(df["x"].to_numpy(), df["y"].to_numpy(), *pd.factorize(df["tier"]))

    assert found["overall"] > 0.3 and found["within"] < -0.1


@pytest.mark.parametrize("seed", range(5))
@pytest.mark.parametrize("make", [
    on_the_sum, in_two_tiers, on_a_weighted_sum, on_skewed_money, on_unequal_skewed_money,
    on_a_total_in_the_file, on_three_measures, on_three_measures_among_others,
    on_a_product_in_the_file, in_whole_number_bands, with_holes, with_holes_in_the_third_measure,
    with_blank_labels, with_a_stray_label,
])
def test_a_category_calculated_from_the_measures_explains_nothing(make, seed):
    assert checked(make(np.random.default_rng(seed))) == []


@pytest.mark.parametrize("seed", range(3))
@pytest.mark.parametrize("top, count, k", [(5, 2, 3), (5, 2, 2), (7, 2, 3), (10, 2, 3), (5, 3, 3), (10, 3, 3)])
def test_tiers_on_a_sum_of_ratings_explain_nothing(top, count, k, seed):
    # A survey's overall score. Whole numbers leave a gap of one step at every cut.
    rng = np.random.default_rng(seed)
    x, y = correlated(rng)
    columns = {"x": rating(x, top), "y": rating(y, top), "z": rating(rng.standard_normal(len(x)), top)}
    columns = dict(list(columns.items())[:count])

    assert checked(pd.DataFrame({**columns, "tier": tiers(sum(columns.values()), k)})) == []


def test_unrelated_columns_do_not_blur_the_search():
    # Let in, they would hide the cut on about one file in three of this size.
    found = [checked(on_three_measures_among_others(np.random.default_rng(seed), 600, 8)) for seed in range(30)]

    assert sum(map(bool, found)) <= 2


def test_small_files_stay_mostly_quiet():
    # They show their edges less clearly, so this is a rate and not a promise.
    def small(rng):
        x, y = correlated(rng, 150, 0.7)
        return pd.DataFrame({"x": x, "y": y, "tier": tiers(x + y)})

    assert sum(bool(checked(small(np.random.default_rng(seed)))) for seed in range(60)) <= 3


def test_a_file_too_long_to_read_in_full():
    x, y = correlated(np.random.default_rng(7), 12000)

    assert checked(pd.DataFrame({"x": x, "y": y, "tier": tiers(x + y)})) == []


def test_a_long_file_is_read_from_end_to_end():
    rows = _edge_rows(np.zeros(12000, dtype=int), np.ones(12000, dtype=bool))

    assert len(rows) == 5000 and rows[0] == 0 and rows[-1] == 11999


@pytest.mark.parametrize("gap", (2, 3, 4, 4.5, 6))
@pytest.mark.parametrize("inside, kind", ((0.0, "vanished"), (-0.5, "reversed")))
def test_real_groups_stay_checked_however_far_apart(gap, inside, kind):
    # 4.5 is where the ends of normal groups meet: they taper there, a cut does not.
    assert checked(regions(np.random.default_rng(4), gap, inside)) == [kind]


@pytest.mark.parametrize("gap", (2.5, 3.5, 4.5))
@pytest.mark.parametrize("inside, kind", ((0.0, "vanished"), (-0.5, "reversed")))
def test_real_groups_on_a_whole_number_scale_stay_checked(gap, inside, kind):
    # Rounding must not pass for a cut: a real group still tapers, one step at a time.
    df = regions(np.random.default_rng(4), gap, inside)
    df[["x", "y"]] = np.clip(np.round(1.5 * df[["x", "y"]] + 3), 1, 20)

    assert checked(df) == [kind]


@pytest.mark.parametrize("seed", range(10))
def test_groups_with_a_floor_and_a_long_tail_stay_checked(seed):
    # Each stops dead at the bottom, as spending stops at zero, but tapers at the top.
    rng = np.random.default_rng(seed)

    assert checked(regions(rng, 4.6, noise=lambda size: rng.exponential(1, size))) == ["vanished"]


@pytest.mark.parametrize("gap", (2, 6))
def test_flat_edged_groups_that_do_not_meet_stay_checked(gap):
    # Their edges are as sharp as a cut, but one overlaps and the other stands apart.
    rng = np.random.default_rng(5)

    assert checked(regions(rng, gap, noise=lambda size: rng.uniform(-1.7, 1.7, size))) == ["vanished"]


def test_a_numeric_code_for_the_group_is_not_a_cut():
    # One value per group lines the groups up end to end, and says nothing about them.
    df = simpson()
    df["code"] = df["region"].map({"North": 1, "East": 2, "South": 3, "West": 4})

    assert checked(df, "region") == ["reversed"]


def test_bands_of_one_whole_number_measure_are_seen():
    score = np.round(np.random.default_rng(10).normal(50, 4, 2000))

    assert _measures_cut_groups(score[:, None], pd.factorize(tiers(score))[0])


def test_holes_in_a_measure_do_not_hide_a_cut():
    total = np.random.default_rng(9).standard_normal(2000)
    codes = pd.factorize(tiers(total))[0]
    total[:50] = np.nan

    assert _measures_cut_groups(total[:, None], codes)


def test_measures_that_repeat_each_other_do_not_break_the_search():
    # They leave nothing inside the groups in one direction, which is a singular matrix.
    df = regions(np.random.default_rng(7), 3, -0.5)
    df["total"] = df["x"] + df["y"]
    df["copy"] = df["x"]

    assert checked(df) == ["reversed"]


def test_columns_with_no_usable_spread_do_not_break_the_search():
    df = simpson()
    df["z"] = df["x"] + 1.0
    df["huge"] = np.random.default_rng(8).standard_normal(len(df)) * 1e300
    df["flat"] = 1.0

    assert "reversed" in checked(df, "region")


def test_a_calculated_category_does_not_take_a_real_one_down_with_it():
    df = regions(np.random.default_rng(6), 3, -0.5)
    df["band"] = tiers(df["x"])

    found = check_correlations(df, pair(df), ["band", "tier"], ["x", "y"])

    assert [(c["by"], c["kind"]) for c in found] == [("tier", "reversed")]


def test_a_cut_on_something_the_file_lacks_cannot_be_seen():
    # A stated limit of the check, held here so that a change to it gets noticed.
    df = on_three_measures(np.random.default_rng(0)).drop(columns="z")

    assert checked(df) == ["vanished"]


def test_the_rest_of_the_file_reaches_the_check():
    # z is in no strong pair, so only the measures handed over can give the tiers away.
    df = on_three_measures(np.random.default_rng(0))
    assert check_correlations(df, pair(df), ["tier"]) != []

    stats = build_stats_summary(df, SimpleNamespace(warnings=[], errors=[]))

    assert stats.correlationChecks == []
