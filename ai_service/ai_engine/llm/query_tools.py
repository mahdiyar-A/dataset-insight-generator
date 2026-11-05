"""
Questions the chat can ask of the data itself, from a fixed menu.

The report's digest answers most follow-up questions ("which region was
highest?"), but not ones it never computed ("what was revenue in March for the
North region?"). For those the chat model may request a query, and this module
runs it on the uploaded table.

The model never writes code. It returns a small JSON object naming one of the
operations below, and every part of it is checked here: the operation must be
on the menu, every column must exist in the table, every filter operator and
aggregation must be on a whitelist, and results are cut to MAX_RESULT_ROWS.
There is no eval, no DataFrame.query string and no regex from the model, so a
crafted question cannot make the server run anything.

Operations:
  aggregate    {"op": "aggregate", "measure": col, "agg": "sum|mean|median|min|max|count|nunique|std",
                "by": [col, col?], "where": [...], "order": "desc|asc", "limit": n}
  describe     {"op": "describe", "column": col, "where": [...]}
  top_values   {"op": "top_values", "column": col, "where": [...], "limit": n}
  count        {"op": "count", "by": [col?], "where": [...]}
  correlation  {"op": "correlation", "a": col, "b": col, "where": [...]}
  trend        {"op": "trend", "measure": col, "date": col?, "period": "D|W|M|Q|Y", "agg": "sum|mean|count"}
               The result has a "change" entry if the series moved or turned at a moment.

A filter is {"column": col, "op": "==|!=|>|>=|<|<=|in|not_in|contains|between|is_missing|not_missing",
"value": v}. Text comparisons ignore case, since a person typing "north" means "North".
"""

from __future__ import annotations

import difflib
import math
import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from ai_engine.core.changepoint import labelled_shift

MAX_QUERIES = 3
MAX_RESULT_ROWS = 15
MAX_FILTERS = 6
MAX_GROUP_COLUMNS = 2
MAX_IN_VALUES = 30

OPERATIONS = ("aggregate", "describe", "top_values", "count", "correlation", "trend")
AGGREGATIONS = ("sum", "mean", "median", "min", "max", "count", "nunique", "std")
FILTER_OPS = ("==", "!=", ">", ">=", "<", "<=", "in", "not_in", "contains", "between",
              "is_missing", "not_missing")
PERIODS = {"D": "D", "W": "W", "M": "M", "Q": "Q", "Y": "Y"}


class QueryError(ValueError):
    """A query that cannot run. The message goes back to the model to correct."""


def describe_menu() -> str:
    """The operation menu, for the system prompt."""
    return __doc__.split("Operations:", 1)[1].strip()


# ─────────────────────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────────────────────

def _norm(name: str) -> str:
    return re.sub(r"[\s_\-.]+", "", str(name).lower())


def resolve_column(df: pd.DataFrame, name: Any) -> str:
    """The table's column for `name`, forgiving case, spaces and underscores."""
    if not isinstance(name, str) or not name.strip():
        raise QueryError("A column name is missing.")
    if name in df.columns:
        return name
    wanted = _norm(name)
    matches = [c for c in df.columns if _norm(c) == wanted]
    if len(matches) == 1:
        return matches[0]
    close = difflib.get_close_matches(name, [str(c) for c in df.columns], n=3, cutoff=0.6)
    hint = f" Closest columns: {', '.join(close)}." if close else ""
    raise QueryError(f"There is no column called {name!r}.{hint}")


def _limit(value: Any, default: int = 10) -> int:
    try:
        return max(1, min(MAX_RESULT_ROWS, int(value)))
    except (TypeError, ValueError):
        return default


def _scalar(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    raise QueryError("Filter values must be text, numbers or true/false.")


# ─────────────────────────────────────────────────────────────────────────────
# Filters
# ─────────────────────────────────────────────────────────────────────────────

def _as_number(value: Any) -> float:
    try:
        number = float(str(value).replace(",", "").strip().rstrip("%"))
    except (TypeError, ValueError):
        raise QueryError(f"{value!r} is not a number.")
    if not math.isfinite(number):
        raise QueryError(f"{value!r} is not a number.")
    return number


def _as_date(value: Any) -> pd.Timestamp:
    stamp = pd.to_datetime(str(value), errors="coerce")
    if pd.isna(stamp):
        raise QueryError(f"{value!r} is not a date.")
    return stamp


def _column_kind(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "bool"
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    return "text"


def _mask(df: pd.DataFrame, flt: Dict[str, Any]) -> pd.Series:
    if not isinstance(flt, dict):
        raise QueryError("Each filter must be an object with column, op and value.")
    col = resolve_column(df, flt.get("column"))
    op = flt.get("op", "==")
    if op not in FILTER_OPS:
        raise QueryError(f"Filter operator {op!r} is not allowed. Use one of: {', '.join(FILTER_OPS)}.")
    s = df[col]
    if op == "is_missing":
        return s.isna()
    if op == "not_missing":
        return s.notna()

    kind = _column_kind(s)
    value = flt.get("value")
    if op in ("in", "not_in", "between"):
        if not isinstance(value, list) or not value:
            raise QueryError(f"Filter {op!r} needs a list of values.")
        if len(value) > MAX_IN_VALUES:
            raise QueryError(f"At most {MAX_IN_VALUES} values in one filter.")
        values = [_scalar(v) for v in value]
        if op == "between" and len(values) != 2:
            raise QueryError("Filter 'between' needs exactly two values: [low, high].")
    else:
        values = [_scalar(value)]

    if kind == "number":
        nums = [_as_number(v) for v in values]
        target = s
    elif kind == "date":
        nums = [_as_date(v) for v in values]
        target = s
    elif kind == "bool":
        nums = [str(v).strip().lower() in ("true", "1", "yes") for v in values]
        target = s
    else:
        nums = [str(v).strip().lower() for v in values]
        target = s.astype("string").str.strip().str.lower()

    if op == "contains":
        if kind != "text":
            raise QueryError(f"'contains' works on text columns; {col!r} is not text.")
        return target.str.contains(nums[0], regex=False, na=False)
    if op == "in":
        return target.isin(nums).fillna(False).astype(bool)
    if op == "not_in":
        return (~target.isin(nums)).fillna(False).astype(bool) & s.notna()
    if op == "between":
        if kind not in ("number", "date"):
            raise QueryError(f"'between' compares numbers or dates; {col!r} is not one.")
        low, high = sorted(nums)
        return ((target >= low) & (target <= high)).fillna(False).astype(bool)
    if kind == "text" and op in (">", ">=", "<", "<="):
        raise QueryError(f"{op!r} compares numbers or dates; {col!r} is text.")
    v = nums[0]
    result = {
        "==": target == v, "!=": target != v, ">": target > v,
        ">=": target >= v, "<": target < v, "<=": target <= v,
    }[op]
    return result.fillna(False).astype(bool)


def apply_filters(df: pd.DataFrame, where: Any) -> Tuple[pd.DataFrame, List[str]]:
    if where in (None, [], {}):
        return df, []
    if isinstance(where, dict):
        where = [where]
    if not isinstance(where, list):
        raise QueryError("'where' must be a list of filters.")
    if len(where) > MAX_FILTERS:
        raise QueryError(f"At most {MAX_FILTERS} filters in one query.")
    mask = pd.Series(True, index=df.index)
    described = []
    for flt in where:
        mask &= _mask(df, flt)
        described.append(f"{flt.get('column')} {flt.get('op', '==')} {flt.get('value', '')}".strip())
    return df[mask], described


# ─────────────────────────────────────────────────────────────────────────────
# Results
# ─────────────────────────────────────────────────────────────────────────────

def _clean(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (bool, np.bool_)):
        return bool(v)
    # Plain ints too: to_dict returns them for integer columns, and they
    # used to fall through to the text case below.
    if isinstance(v, (int, np.integer)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        f = float(v)
        if not math.isfinite(f):
            return None
        if f.is_integer() and abs(f) < 1e15:
            return int(f)
        return round(f, 4) if abs(f) < 1 else round(f, 2)
    if isinstance(v, (pd.Timestamp, np.datetime64)):
        return str(pd.Timestamp(v).date()) if pd.Timestamp(v).normalize() == pd.Timestamp(v) else str(v)
    if isinstance(v, pd.Period):
        return str(v)
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return str(v)[:120]


def _rows(frame: pd.DataFrame) -> List[Dict[str, Any]]:
    return [{str(k): _clean(v) for k, v in row.items()} for row in frame.to_dict(orient="records")]


def _numeric(df: pd.DataFrame, col: str) -> pd.Series:
    s = df[col]
    if _column_kind(s) == "bool":
        return s.astype("float64")
    if _column_kind(s) != "number":
        raise QueryError(f"{col!r} is not a numeric column, so it cannot be summed or averaged.")
    return s


def _aggregate(df: pd.DataFrame, q: Dict[str, Any]) -> Dict[str, Any]:
    agg = q.get("agg", "sum")
    if agg not in AGGREGATIONS:
        raise QueryError(f"Aggregation {agg!r} is not allowed. Use one of: {', '.join(AGGREGATIONS)}.")
    measure = resolve_column(df, q.get("measure"))
    by = q.get("by") or []
    if isinstance(by, str):
        by = [by]
    if len(by) > MAX_GROUP_COLUMNS:
        raise QueryError(f"Group by at most {MAX_GROUP_COLUMNS} columns.")
    by = [resolve_column(df, b) for b in by]
    if agg not in ("count", "nunique"):
        values = _numeric(df, measure)
    else:
        values = df[measure]
    if not by:
        result = getattr(values, agg)()
        return {"value": _clean(result), "rows_used": int(values.notna().sum())}
    frame = df[by].copy()
    frame["_v"] = values
    grouped = frame.groupby(by, dropna=True, observed=True)["_v"]
    table = getattr(grouped, agg)().rename(f"{agg}_{measure}")
    counts = grouped.count().rename("rows")
    out = pd.concat([table, counts], axis=1).reset_index()
    ascending = q.get("order") == "asc"
    out = out.sort_values(f"{agg}_{measure}", ascending=ascending, na_position="last")
    limit = _limit(q.get("limit"))
    return {"groups": len(out), "rows": _rows(out.head(limit)), "truncated": len(out) > limit}


def _describe(df: pd.DataFrame, q: Dict[str, Any]) -> Dict[str, Any]:
    col = resolve_column(df, q.get("column"))
    s = df[col]
    kind = _column_kind(s)
    if kind == "number":
        d = s.describe(percentiles=[0.25, 0.5, 0.75])
        return {"column": col, "kind": "number", **{k: _clean(v) for k, v in d.items()},
                "sum": _clean(s.sum()), "missing": int(s.isna().sum())}
    if kind == "date":
        return {"column": col, "kind": "date", "first": _clean(s.min()), "last": _clean(s.max()),
                "count": int(s.notna().sum()), "missing": int(s.isna().sum())}
    counts = s.value_counts(dropna=True)
    return {"column": col, "kind": "text", "count": int(s.notna().sum()), "distinct": int(counts.size),
            "most_common": _clean(counts.index[0]) if counts.size else None,
            "most_common_count": int(counts.iloc[0]) if counts.size else 0,
            "missing": int(s.isna().sum())}


def _top_values(df: pd.DataFrame, q: Dict[str, Any]) -> Dict[str, Any]:
    col = resolve_column(df, q.get("column"))
    counts = df[col].value_counts(dropna=True)
    limit = _limit(q.get("limit"))
    total = int(counts.sum())
    rows = [{"value": _clean(k), "rows": int(v), "share_pct": round(100 * v / total, 1) if total else 0}
            for k, v in counts.head(limit).items()]
    return {"column": col, "distinct": int(counts.size), "rows": rows, "truncated": counts.size > limit}


def _count(df: pd.DataFrame, q: Dict[str, Any]) -> Dict[str, Any]:
    by = q.get("by") or []
    if isinstance(by, str):
        by = [by]
    if len(by) > MAX_GROUP_COLUMNS:
        raise QueryError(f"Group by at most {MAX_GROUP_COLUMNS} columns.")
    by = [resolve_column(df, b) for b in by]
    if not by:
        return {"rows": int(len(df))}
    out = df.groupby(by, dropna=True, observed=True).size().rename("rows").reset_index()
    out = out.sort_values("rows", ascending=q.get("order") == "asc")
    limit = _limit(q.get("limit"))
    return {"groups": len(out), "rows": _rows(out.head(limit)), "truncated": len(out) > limit}


def _correlation(df: pd.DataFrame, q: Dict[str, Any]) -> Dict[str, Any]:
    a = resolve_column(df, q.get("a"))
    b = resolve_column(df, q.get("b"))
    pair = pd.concat([_numeric(df, a), _numeric(df, b)], axis=1).dropna()
    if len(pair) < 3:
        return {"a": a, "b": b, "n": int(len(pair)), "pearson": None, "spearman": None}
    return {"a": a, "b": b, "n": int(len(pair)),
            "pearson": _clean(pair.iloc[:, 0].corr(pair.iloc[:, 1])),
            "spearman": _clean(pair.iloc[:, 0].corr(pair.iloc[:, 1], method="spearman"))}


def _date_column(df: pd.DataFrame, requested: Any) -> str:
    if requested:
        return resolve_column(df, requested)
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            return col
    for col in df.columns:
        if _column_kind(df[col]) == "text":
            sample = df[col].dropna().head(200)
            if len(sample) and pd.to_datetime(sample, errors="coerce", format="mixed").notna().mean() > 0.9:
                return col
    raise QueryError("No date column was found; name one with \"date\".")


def _trend(df: pd.DataFrame, q: Dict[str, Any]) -> Dict[str, Any]:
    agg = q.get("agg", "sum")
    if agg not in ("sum", "mean", "count"):
        raise QueryError("Trend aggregation must be sum, mean or count.")
    period = PERIODS.get(str(q.get("period", "M")).upper()[:1])
    if period is None:
        raise QueryError("Period must be D, W, M, Q or Y.")
    date_col = _date_column(df, q.get("date"))
    dates = df[date_col]
    if not pd.api.types.is_datetime64_any_dtype(dates):
        dates = pd.to_datetime(dates, errors="coerce", format="mixed")
    if getattr(dates.dt, "tz", None) is not None:
        dates = dates.dt.tz_localize(None)
    frame = pd.DataFrame({"period": dates.dt.to_period(period)})
    if agg == "count":
        frame["_v"] = 1
        measure = "rows"
    else:
        measure = resolve_column(df, q.get("measure"))
        frame["_v"] = _numeric(df, measure)
    frame = frame.dropna(subset=["period"])
    series = getattr(frame.groupby("period")["_v"], agg)().sort_index()
    rows = [{"period": str(k), "value": _clean(v)} for k, v in series.items()]
    # The most recent periods matter most in a conversation; keep those.
    result = {"date_column": date_col, "measure": measure, "agg": agg, "period": period,
              "periods": len(rows), "rows": rows[-MAX_RESULT_ROWS:], "truncated": len(rows) > MAX_RESULT_ROWS}
    known = series.dropna()
    change = labelled_shift(known.to_numpy(dtype="float64"), known.index)
    if change:
        result["change"] = change
    return result


_HANDLERS = {
    "aggregate": _aggregate, "describe": _describe, "top_values": _top_values,
    "count": _count, "correlation": _correlation, "trend": _trend,
}


def run_query(df: pd.DataFrame, query: Any) -> Dict[str, Any]:
    """Run one query. Never raises: a bad query comes back as {"error": ...}."""
    if not isinstance(query, dict):
        return {"error": "A query must be a JSON object."}
    op = query.get("op")
    if op not in _HANDLERS:
        return {"op": op, "error": f"Unknown operation {op!r}. Use one of: {', '.join(OPERATIONS)}."}
    try:
        subset, filters = apply_filters(df, query.get("where"))
        result = _HANDLERS[op](subset, query)
        result = {"op": op, **result}
        if filters:
            result["filters"] = filters
            result["rows_matching_filters"] = int(len(subset))
        return result
    except QueryError as exc:
        return {"op": op, "error": str(exc)}
    except Exception as exc:  # pandas edge cases; the model can rephrase
        return {"op": op, "error": f"The query failed ({type(exc).__name__})."}


def run_queries(df: pd.DataFrame, queries: Any) -> List[Dict[str, Any]]:
    if isinstance(queries, dict):
        queries = [queries]
    if not isinstance(queries, list):
        return [{"error": "'queries' must be a list."}]
    return [run_query(df, q) for q in queries[:MAX_QUERIES]]
