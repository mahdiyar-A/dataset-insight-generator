"""
Columns calculated from other columns.

The expensive mistake is claiming a formula that is not there, so most of these
are about staying quiet on data that merely looks arithmetic.
"""

import time
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from ai_engine.core.confidence import count_evidence
from ai_engine.core.confounding import check_correlations
from ai_engine.core.drivers import key_drivers
from ai_engine.core.identities import arithmetic_pairs, find_derived_columns, tied_to
from ai_engine.core.stats_analyzer import _correlations, build_stats_summary
from ai_engine.llm.insight_agent import _build_fallback_report
from ai_engine.llm.stats_digest import build_digest
from ai_engine.models.models import DomainResult, StatsSummary

DOMAIN = DomainResult(domain="sales", confidence=0.9, is_analyzable=True, analysis_focus=[],
                      key_questions=[], column_decisions={}, attribute_interpretations={})


def stats_with(correlations):
    return StatsSummary(rowCount=600, columnCount=4, columnTypes={}, missingPercentages={}, numericStats={},
                        topCorrelations=correlations, categoricalSummaries={}, outlierSummary={}, detectedIssues=[])


def found(df):
    return find_derived_columns(df, list(df.columns))


def formulas(df):
    return {d["column"]: d["formula"] for d in found(df)}


def rng(seed=1):
    return np.random.default_rng(seed)


def orders(rows=500, seed=1):
    r = rng(seed)
    units = r.integers(1, 40, rows)
    price = r.uniform(5, 50, rows).round(2)
    return pd.DataFrame({"units": units, "unit_price": price, "revenue": (units * price).round(2)})


# ── What it finds ─────────────────────────────────────────────────────────────

def test_a_product():
    assert formulas(orders()) == {"revenue": "units × unit_price"}


def test_a_difference():
    r = rng()
    revenue = r.uniform(100, 900, 400).round(2)
    cost = r.uniform(50, 400, 400).round(2)
    df = pd.DataFrame({"revenue": revenue, "cost": cost, "profit": (revenue - cost).round(2)})

    assert formulas(df) == {"profit": "revenue − cost"}


def test_a_sum():
    r = rng()
    subtotal = r.uniform(10, 500, 400).round(2)
    shipping = r.uniform(3, 30, 400).round(2)
    df = pd.DataFrame({"subtotal": subtotal, "shipping": shipping, "paid": (subtotal + shipping).round(2)})

    assert formulas(df) == {"paid": "subtotal + shipping"}


def test_a_ratio_rounded_to_few_decimals():
    r = rng()
    impressions = r.integers(1000, 90000, 400)
    clicks = (impressions * r.uniform(0.01, 0.2, 400)).astype(int)
    df = pd.DataFrame({"impressions": impressions, "clicks": clicks, "ctr": (clicks / impressions).round(4)})

    assert formulas(df) == {"ctr": "clicks ÷ impressions"}


def test_a_percentage():
    r = rng()
    revenue = r.uniform(100, 900, 400).round(2)
    profit = (revenue * r.uniform(0.05, 0.6, 400)).round(2)
    df = pd.DataFrame({"revenue": revenue, "profit": profit, "margin_pct": (100 * profit / revenue).round(2)})

    assert formulas(df) == {"margin_pct": "100 × profit ÷ revenue"}


def test_a_share_of_a_value():
    r = rng()
    price = r.uniform(10, 900, 400).round(2)
    discount = r.uniform(1, 40, 400).round(1)
    df = pd.DataFrame({"price": price, "discount": discount, "saving_amount": (price * discount / 100).round(2)})

    assert formulas(df) == {"saving_amount": "price × discount ÷ 100"}


def test_a_whole_number_result_of_parts_that_are_not_whole():
    r = rng()
    hours = r.uniform(5, 60, 400).round(2)
    rate = r.uniform(15, 80, 400).round(2)
    df = pd.DataFrame({"hours": hours, "rate": rate, "pay": (hours * rate).round()})

    assert formulas(df) == {"pay": "hours × rate"}


def test_parts_rounded_after_the_total_was_worked_out():
    # Each part is off by up to half a cent, so the total can be off by a cent.
    r = rng()
    a, b = r.uniform(10, 500, 400), r.uniform(3, 30, 400)
    df = pd.DataFrame({"a": a.round(2), "b": b.round(2), "paid": (a + b).round(2)})

    assert formulas(df) == {"paid": "a + b"}
    assert found(df)[0]["mismatchedRows"] == 0


def test_small_scores_that_really_add_up():
    # A rounding allowance of 0.5 would be too much beside so small a spread.
    # Whole numbers have nothing to round, so none is given and this is found.
    r = rng()
    first, second = r.integers(1, 6, 400), r.integers(1, 6, 400)
    df = pd.DataFrame({"first": first, "second": second, "score": first + second})

    assert formulas(df) == {"score": "first + second"}


def test_whole_numbers_that_add_up():
    r = rng()
    regular = r.integers(20, 40, 300)
    overtime = r.integers(1, 15, 300)
    df = pd.DataFrame({"regular": regular, "overtime": overtime, "hours_total": regular + overtime})

    assert formulas(df) == {"hours_total": "regular + overtime"}


def test_full_precision_values():
    r = rng()
    a, b = r.normal(100, 20, 300), r.normal(5, 1, 300)
    assert formulas(pd.DataFrame({"a": a, "b": b, "c": a * b})) == {"c": "a × b"}


def test_a_calculated_column_is_found_wherever_it_sits():
    df = orders()[["revenue", "units", "unit_price"]]

    assert formulas(df) == {"revenue": "units × unit_price"}


def test_with_nothing_in_the_names_the_rightmost_column_is_taken():
    # File order, however complete the columns are.
    r = rng()
    a, b = r.normal(100, 20, 300), r.normal(5, 1, 300)
    df = pd.DataFrame({"a": a, "b": b, "c": a * b})
    df.loc[df.index[:50], "a"] = np.nan
    df.loc[df.index[50:60], "c"] = np.nan

    assert formulas(df) == {"c": "a × b"}


def test_a_word_inside_another_word_does_not_count():
    # "net" in internet, "rate" in generated.
    r = rng()
    a, b = r.normal(100, 20, 300), r.normal(5, 1, 300)
    df = pd.DataFrame({"internet": a * b, "generated": a, "c": b})

    assert formulas(df) == {"c": "internet ÷ generated"}


def test_rows_that_do_not_add_up_are_counted():
    df = orders()
    df.loc[df.index[:7], "revenue"] += 100

    item = found(df)[0]

    assert item["mismatchedRows"] == 7
    assert item["rows"] > 400


def test_each_equation_is_reported_once():
    assert len(found(orders())) == 1


def test_a_total_with_rows_missing_values():
    df = orders()
    df.loc[df.index[::9], "unit_price"] = np.nan
    df.loc[df.index[::7], "revenue"] = np.nan

    assert formulas(df) == {"revenue": "units × unit_price"}


def test_two_formulas_in_one_file():
    r = rng()
    units = r.integers(1, 40, 400)
    price = r.uniform(5, 50, 400).round(2)
    sales = (units * price).round(2)
    cost = (sales * r.uniform(0.3, 0.9, 400)).round(2)
    df = pd.DataFrame({"units": units, "price": price, "sales": sales, "cost": cost,
                       "profit": (sales - cost).round(2)})

    assert [d["column"] for d in found(df)] == ["sales", "profit"]
    assert formulas(df) == {"sales": "units × price", "profit": "sales − cost"}


def test_at_most_six_are_reported():
    r = rng()
    data = {}
    for i in range(8):
        data[f"a{i}"] = r.normal(100, 20, 300)
        data[f"b{i}"] = r.normal(5, 1, 300)
        data[f"c{i}"] = data[f"a{i}"] * data[f"b{i}"]

    assert len(found(pd.DataFrame(data))) == 6


def test_the_most_complete_columns_are_the_ones_searched():
    r = rng()
    data = {f"noise{i}": r.normal(50, 10, 300) for i in range(45)}
    data["a"], data["b"] = r.normal(100, 20, 300), r.normal(5, 1, 300)
    data["c"] = data["a"] * data["b"]
    df = pd.DataFrame(data)
    df.loc[df.index[:100], [f"noise{i}" for i in range(45)]] = np.nan

    assert formulas(df) == {"c": "a × b"}


def test_a_quantity_that_is_mostly_one_still_counts_on_the_rows_that_show_it():
    r = rng()
    quantity = np.where(r.random(800) < 0.8, 1, r.integers(2, 9, 800))
    price = r.uniform(5, 50, 800).round(2)
    df = pd.DataFrame({"quantity": quantity, "price": price, "line_total": (quantity * price).round(2)})

    item = found(df)[0]

    assert item["formula"] == "quantity × price"
    assert item["rows"] < 300, "rows where quantity is 1 show nothing and are not evidence"


# ── When it must stay quiet ───────────────────────────────────────────────────

@pytest.mark.parametrize("seed", range(10))
def test_unrelated_measures(seed):
    r = rng(seed)
    df = pd.DataFrame({f"m{i}": r.normal(50, 10, 400).round(2) for i in range(8)})

    assert found(df) == []


@pytest.mark.parametrize("seed", range(10))
def test_small_whole_numbers_do_not_add_up_by_chance(seed):
    r = rng(seed)
    df = pd.DataFrame({f"m{i}": r.integers(0, 6, 400) for i in range(8)})

    assert found(df) == []


@pytest.mark.parametrize("seed", range(5))
def test_mostly_zero_columns_prove_nothing(seed):
    # Risk: 0 = 0 × anything, on nearly every row.
    r = rng(seed)
    sparse = lambda: np.where(r.random(1000) < 0.97, 0.0, r.uniform(1, 90, 1000).round(2))
    df = pd.DataFrame({"refunds": sparse(), "returns": sparse(), "credits": sparse(), "price": r.uniform(1, 9, 1000)})

    assert found(df) == []


def test_a_copy_and_a_column_of_ones_are_not_a_formula():
    # x = y × z on 97% of rows, because y is x and z is 1 there. Where z is not
    # 1 the equation fails, and those are the only rows that could show it.
    r = rng()
    x = r.uniform(10, 90, 1000).round(2)
    z = np.where(r.random(1000) < 0.97, 1.0, r.uniform(2, 9, 1000).round(2))
    df = pd.DataFrame({"x": x, "copy": x, "z": z})

    assert found(df) == []


def test_a_few_telling_rows_are_not_enough():
    # Only 20 rows where the quantity is above 1: too few to call it a formula.
    r = rng()
    quantity = np.ones(600, dtype=int)
    quantity[:20] = r.integers(2, 9, 20)
    price = r.uniform(5, 50, 600).round(2)
    df = pd.DataFrame({"quantity": quantity, "price": price, "line_total": (quantity * price).round(2)})

    assert found(df) == []


def test_too_many_rows_breaking_it():
    df = orders()
    wrong = df.sample(frac=0.08, random_state=2).index
    df.loc[wrong, "revenue"] *= 1.5

    assert found(df) == []


def test_a_near_formula_is_not_a_formula():
    # Revenue is about units × price, as with real data where discounts apply.
    df = orders()
    df["revenue"] = (df["revenue"] * rng(3).uniform(0.9, 1.1, len(df))).round(2)

    assert found(df) == []


def test_rounding_cannot_excuse_a_target_that_hardly_varies():
    # c is 1 on nearly every row and a × b is merely near 1, so a whole-number
    # target's allowance of 0.5 covers it. Nothing here is calculated.
    r = rng()
    df = pd.DataFrame({"a": r.uniform(2.45, 2.55, 800).round(3), "b": r.uniform(0.39, 0.41, 800).round(3),
                       "c": np.where(r.random(800) < 0.98, 1, 2)})

    assert found(df) == []


def test_fewer_than_three_measures():
    assert find_derived_columns(orders()[["units", "revenue"]], ["units", "revenue"]) == []


def test_only_the_columns_named_are_considered():
    df = orders()

    assert find_derived_columns(df, ["units", "revenue"]) == []


def test_awkward_columns_do_not_break_it():
    df = orders()
    df["all_missing"] = np.nan
    df["infinite"] = np.inf
    df["huge"] = 1e300
    df["tiny"] = 1e-300

    assert formulas(df) == {"revenue": "units × unit_price"}


def test_a_wide_long_file_stays_fast():
    r = rng()
    df = pd.DataFrame({f"m{i}": r.normal(50, 10, 100_000).round(2) for i in range(40)})
    df["m39"] = (df["m0"] * df["m1"]).round(2)

    started = time.monotonic()
    result = found(df)

    assert time.monotonic() - started < 3
    assert [d["column"] for d in result] == ["m39"]


# ── What the result is used for ───────────────────────────────────────────────

DERIVED = [{"column": "revenue", "formula": "units × unit_price", "parts": ["units", "unit_price"],
            "rows": 500, "mismatchedRows": 0}]


def test_a_calculated_column_is_paired_with_its_parts_and_the_parts_stay_free():
    # Higher prices going with fewer units is a real finding, not arithmetic.
    pairs = arithmetic_pairs(DERIVED)

    assert pairs == {frozenset(("revenue", "units")), frozenset(("revenue", "unit_price"))}
    assert arithmetic_pairs(None) == set()


def test_what_a_model_must_not_be_given():
    assert tied_to("revenue", DERIVED) == {"units", "unit_price"}
    assert tied_to("units", DERIVED) == {"revenue"}
    assert tied_to("region", DERIVED) == set()
    assert tied_to("revenue", None) == set()


# ── How it reaches the report ─────────────────────────────────────────────────

def demand(rows=800, seed=4):
    """Units fall as price rises, a real relationship, and revenue multiplies them."""
    r = rng(seed)
    price = r.uniform(5, 50, rows).round(2)
    units = np.maximum(1, (60 - price + r.normal(0, 6, rows)).round()).astype(int)
    return pd.DataFrame({
        "region": r.choice(["North", "South", "East"], rows),
        "units": units,
        "unit_price": price,
        "visits": r.normal(100, 15, rows).round(1),
        "revenue": (units * price).round(2),
    })


def summarize(df):
    return build_stats_summary(df, SimpleNamespace(warnings=[], errors=[]))


def test_the_digest_states_the_formula_and_hides_the_arithmetic():
    stats = summarize(orders())
    strong = [c for c in stats.spearmanCorrelations + stats.topCorrelations if c.get("arithmetic")]
    assert len(strong) == 4 and all(c["significant"] for c in strong), "the pairs must exist to be hidden"

    digest = build_digest(stats, DOMAIN)

    assert digest["derived_columns"] == [{"column": "revenue", "formula": "units × unit_price"}]
    assert not any("revenue" in (c["a"], c["b"]) for c in digest.get("correlations", []))


def test_the_two_parts_stay_a_finding():
    digest = build_digest(summarize(demand()), DOMAIN)

    pair = next(c for c in digest["correlations"] if {c["a"], c["b"]} == {"units", "unit_price"})
    assert pair["r"] < -0.5


def test_mismatched_rows_reach_the_digest():
    df = demand()
    df.loc[df.index[:4], "revenue"] += 500

    assert build_digest(summarize(df), DOMAIN)["derived_columns"][0]["mismatched_rows"] == 4


def test_a_file_with_no_formula_says_nothing():
    df = demand().drop(columns="revenue")

    assert "derived_columns" not in build_digest(summarize(df), DOMAIN)


def test_arithmetic_rank_last_and_cannot_crowd_out_a_finding():
    df = demand()
    arithmetic = arithmetic_pairs(find_derived_columns(df, ["units", "unit_price", "visits", "revenue"]))

    rows = _correlations(df, ["units", "unit_price", "visits", "revenue"], "pearson", arithmetic=arithmetic)

    flagged = [r.get("arithmetic", False) for r in rows]
    assert flagged == sorted(flagged)
    assert sum(flagged) == 2
    assert not _correlations(df, ["units", "unit_price", "visits", "revenue"], "pearson", top_n=4, arithmetic=arithmetic)[0].get("arithmetic")


def test_arithmetic_is_not_evidence():
    with_flag = [{"col1": "revenue", "col2": "units", "correlation": 0.7, "significant": True, "arithmetic": True}]
    without = [{"col1": "revenue", "col2": "units", "correlation": 0.7, "significant": True}]

    assert count_evidence(stats_with(with_flag)) == count_evidence(stats_with(without)) - 1


def test_the_fallback_report_does_not_headline_arithmetic():
    rows = [{"col1": "revenue", "col2": "units", "correlation": 0.9, "significant": True, "arithmetic": True},
            {"col1": "units", "col2": "unit_price", "correlation": -0.6, "significant": True}]

    report = _build_fallback_report(stats_with(rows), DOMAIN)

    assert "between units and unit_price" in " ".join(i["body"] for i in report.insights)


def test_a_calculated_pair_is_not_checked_for_group_effects():
    rows = [{"col1": "x", "col2": "y", "correlation": 0.8, "significant": True, "arithmetic": True}]
    r = rng()
    frames = []
    for level, centre in zip("ABCD", (0.0, 4.0, 8.0, 12.0)):
        x = r.normal(centre, 2.0, 150)
        frames.append(pd.DataFrame({"x": x, "y": 3 * centre - 0.8 * (x - centre) + r.normal(0, 1, 150), "g": level}))

    assert check_correlations(pd.concat(frames, ignore_index=True), rows, ["g"]) == []


def test_a_driver_model_is_not_given_what_the_target_is_made_of():
    # Risk: units and price predict revenue perfectly, which reads as a strong
    # model and counts as evidence.
    df = demand()
    derived = find_derived_columns(df, ["units", "unit_price", "visits", "revenue"])

    result = key_drivers(df, "revenue", derived=derived)

    assert {d["feature"] for d in result["drivers"]}.isdisjoint({"units", "unit_price"})
    assert {"units", "unit_price"} <= set(result["excludedAsDerived"])
    assert result["model"]["fit"] not in ("moderate", "strong")


def test_without_the_guard_that_model_looks_excellent():
    # Keeps the test above honest: the fit it rules out is real.
    assert key_drivers(demand(), "revenue")["model"]["fit"] in ("moderate", "strong")


def test_the_stats_summary_tells_the_driver_model():
    drivers = summarize(demand()).domainAnalyses["analyses"]["key_drivers"]

    assert drivers["target"] == "revenue"
    assert {"units", "unit_price"} <= set(drivers["excludedAsDerived"])


def test_a_driver_model_of_a_part_is_not_given_the_total():
    df = demand()
    derived = find_derived_columns(df, ["units", "unit_price", "visits", "revenue"])

    result = key_drivers(df, "units", derived=derived)

    assert "revenue" not in {d["feature"] for d in result["drivers"]}
    assert "unit_price" in {d["feature"] for d in result["drivers"]}
