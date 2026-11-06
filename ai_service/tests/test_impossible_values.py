"""
Numbers a column's own name rules out.

A sales file had -1 units and nothing said so. These are reported and never
changed, because a negative quantity is often a return.
"""

import numpy as np
import pandas as pd
import pytest

from ai_engine.core.cleaner import clean_dataset
from ai_engine.quality.quality_checker import check_data_quality, impossible_values


def table(name, values, rows=100):
    filled = [5.0] * (rows - len(values))
    return pd.DataFrame({name: [*values, *filled], "group": ["a", "b"] * (rows // 2)})


@pytest.mark.parametrize("name, values, phrase", [
    ("units", [-1.0], "1 value below zero"),
    ("Units Sold", [-1.0, -3.0], "2 values below zero"),
    ("unitPrice", [-9.99], "below zero"),
    ("order_qty", [-2.0], "below zero"),
    ("age", [300.0], "outside 0 to 120"),
    ("age", [-4.0], "outside 0 to 120"),
    ("discount_pct", [140.0], "outside 0 to 100"),
    ("Completion %", [-5.0], "outside 0 to 100"),
])
def test_a_value_the_name_rules_out_is_reported(name, values, phrase):
    found = impossible_values(table(name, values))
    assert len(found) == 1 and name in found[0] and phrase in found[0]


@pytest.mark.parametrize("name, values", [
    ("units", [0.0, 12.0]),               # zero is fine
    ("net_units", [-1.0]),                # a change can go either way
    ("price_change", [-3.0]),
    ("growth_pct", [240.0, -10.0]),
    ("balance", [-500.0]),
    ("revenue", [-40.0]),                 # refunds are normal
    ("temperature", [-12.0]),
    ("discount", [-1.0]),                 # "count" inside another word
    ("page", [900.0]),                    # "age" inside another word
    ("age_days", [4000.0]),
])
def test_a_value_that_can_be_true_is_left_alone(name, values):
    assert impossible_values(table(name, values)) == []


def test_a_column_that_is_mostly_odd_is_a_convention_not_an_error():
    assert impossible_values(table("units", [-1.0] * 60)) == []


def test_text_and_gaps_are_ignored():
    df = pd.DataFrame({"units": [None] * 50 + [1.0] * 50, "age": ["n/a"] * 100})
    assert impossible_values(df) == []


def test_identifiers_are_ignored():
    df = pd.DataFrame({"order_count_id": np.arange(-5, 95), "group": ["a", "b"] * 50})
    assert impossible_values(df) == []


def everyday_sales():
    rng = np.random.default_rng(5)
    units = [-1.0, *[float(i % 20 + 1) for i in range(99)]]
    return pd.DataFrame({"units": units, "score": rng.normal(50, 10, 100)})


def test_it_leads_the_warnings_without_asking_for_cleaning():
    df = everyday_sales()
    quality = check_data_quality(df)
    assert "below zero" in quality.warnings[0]
    assert quality.needsCleaning is False


def test_cleaning_leaves_the_value_alone():
    df = everyday_sales()
    df.loc[df.index[10], "score"] = None
    out = clean_dataset(df, check_data_quality(df))
    assert out["units"].min() == -1.0
