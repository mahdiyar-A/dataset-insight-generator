"""
The chat's data queries: correct answers, forgiving column names, and every
part of a query checked so a model cannot make the server run anything.
"""

import numpy as np
import pandas as pd
import pytest

from ai_engine.llm.query_tools import (
    MAX_QUERIES,
    MAX_RESULT_ROWS,
    QueryError,
    describe_menu,
    resolve_column,
    run_queries,
    run_query,
)


@pytest.fixture(scope="module")
def df() -> pd.DataFrame:
    rng = np.random.default_rng(3)
    n = 400
    region = rng.choice(["North", "South", "East", "West"], n)
    units = rng.integers(1, 30, n)
    price = rng.uniform(5, 50, n).round(2)
    return pd.DataFrame({
        "order_date": pd.date_range("2023-01-01", periods=n, freq="D"),
        "region": region,
        "Unit Price": price,
        "units": units,
        "revenue": (units * price).round(2),
        "churned": rng.uniform(size=n) < 0.2,
        "note": np.where(rng.uniform(size=n) < 0.1, None, "ok"),
    })


def test_sum_by_group_matches_pandas(df):
    r = run_query(df, {"op": "aggregate", "measure": "revenue", "agg": "sum", "by": ["region"]})
    expected = df.groupby("region")["revenue"].sum().sort_values(ascending=False)
    assert [row["region"] for row in r["rows"]] == list(expected.index)
    assert r["rows"][0]["sum_revenue"] == pytest.approx(expected.iloc[0], abs=0.01)
    assert sum(row["rows"] for row in r["rows"]) == len(df)


def test_text_filters_ignore_case(df):
    r = run_query(df, {"op": "aggregate", "measure": "revenue", "agg": "mean",
                       "where": [{"column": "region", "op": "==", "value": "north"}]})
    assert r["value"] == pytest.approx(df.loc[df.region == "North", "revenue"].mean(), abs=0.01)
    assert r["rows_matching_filters"] == int((df.region == "North").sum())


def test_column_names_are_forgiving_but_not_guessed(df):
    assert resolve_column(df, "unit_price") == "Unit Price"
    assert resolve_column(df, "UNITS") == "units"
    with pytest.raises(QueryError, match="Closest columns: revenue"):
        resolve_column(df, "revenu")
    with pytest.raises(QueryError):
        resolve_column(df, "salary")


def test_dates_compare_and_trend_by_month(df):
    r = run_query(df, {"op": "count", "where": [
        {"column": "order_date", "op": "between", "value": ["2023-03-01", "2023-03-31"]}]})
    assert r["rows"] == 31
    t = run_query(df, {"op": "trend", "measure": "revenue", "period": "M", "agg": "sum"})
    assert t["date_column"] == "order_date" and t["periods"] == 14
    assert len(t["rows"]) <= MAX_RESULT_ROWS and t["rows"][-1]["period"] == "2024-02"
    jan = df[df.order_date.dt.month.eq(1) & df.order_date.dt.year.eq(2023)]["revenue"].sum()
    first = run_query(df, {"op": "trend", "measure": "revenue", "period": "M"})["rows"][0]
    assert first == {"period": "2023-01", "value": pytest.approx(jan, abs=0.01)}


def test_describe_top_values_count_and_correlation(df):
    d = run_query(df, {"op": "describe", "column": "revenue"})
    assert d["kind"] == "number" and d["max"] == pytest.approx(df.revenue.max(), abs=0.01)
    assert run_query(df, {"op": "describe", "column": "region"})["distinct"] == 4
    assert run_query(df, {"op": "describe", "column": "order_date"})["first"] == "2023-01-01"
    top = run_query(df, {"op": "top_values", "column": "region", "limit": 2})
    assert len(top["rows"]) == 2 and top["truncated"]
    assert sum(r["share_pct"] for r in run_query(df, {"op": "top_values", "column": "region"})["rows"]) \
        == pytest.approx(100, abs=0.5)
    c = run_query(df, {"op": "correlation", "a": "units", "b": "revenue"})
    assert c["pearson"] == pytest.approx(df.units.corr(df.revenue), abs=1e-3) and c["n"] == len(df)
    assert run_query(df, {"op": "count", "by": "churned"})["groups"] == 2


def test_missing_value_filters(df):
    r = run_query(df, {"op": "count", "where": [{"column": "note", "op": "is_missing"}]})
    assert r["rows"] == int(df.note.isna().sum())


@pytest.mark.parametrize("query,message", [
    ({"op": "__import__('os').system('id')"}, "Unknown operation"),
    ({"op": "aggregate", "measure": "revenue", "agg": "eval"}, "not allowed"),
    ({"op": "count", "where": [{"column": "region", "op": "matches", "value": ".*"}]}, "not allowed"),
    ({"op": "aggregate", "measure": "region", "agg": "sum"}, "not a numeric column"),
    ({"op": "count", "where": [{"column": "region", "op": ">", "value": "M"}]}, "is text"),
    ({"op": "count", "where": [{"column": "units", "op": "contains", "value": "1"}]}, "text columns"),
    ({"op": "count", "where": [{"column": "region", "op": "in", "value": list(range(31))}]}, "At most"),
    ({"op": "aggregate", "measure": "revenue", "by": ["region", "units", "churned"]}, "at most"),
    ("DROP TABLE orders", "JSON object"),
])
def test_bad_queries_come_back_as_errors_not_exceptions(df, query, message):
    result = run_query(df, query)
    assert message in result["error"]


def test_at_most_three_queries_run(df):
    queries = [{"op": "count"}] * (MAX_QUERIES + 2)
    assert len(run_queries(df, queries)) == MAX_QUERIES
    assert run_queries(df, "not a list")[0]["error"]


def test_results_are_plain_json(df):
    import json
    for q in ({"op": "describe", "column": "order_date"},
              {"op": "aggregate", "measure": "revenue", "agg": "median", "by": "region"},
              {"op": "trend", "agg": "count", "period": "W"}):
        json.dumps(run_query(df, q))


def test_the_menu_is_in_the_docstring():
    menu = describe_menu()
    assert "aggregate" in menu and "trend" in menu and "Text comparisons ignore case" in menu
