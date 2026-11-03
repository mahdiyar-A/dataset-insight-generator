"""
Domain-aware analyses — the questions a generic summary never asks.

The existing statistical engine is domain-agnostic by construction: it describes
distributions, correlations, group means and anomalies, and it does so
identically whether the rows are sales orders, patient visits or sensor
readings. Useful, but it never answers the question the dataset exists to
answer. "Revenue is roughly log-normal with a Spearman correlation of 0.31
against units" is true of a sales extract and tells the owner nothing; "the top
two regions carry 71% of revenue" is the finding.

Two principles keep this honest:

  1. **Selection is structural, not nominal.** Nothing here fires because a
     model called the dataset "retail". It fires because the frame contains the
     shape an analysis needs — a category beside a measure, a timestamp, a
     repeating entity key. A dataset mislabelled by the domain pass therefore
     degrades to fewer analyses rather than to wrong ones.

  2. **The domain only prioritises.** It decides what leads the report, never
     what is computed. That keeps a wrong domain guess cosmetic.

Everything is computed locally. No model call, no extra cost.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from ai_engine.core.profiler import is_reference_key, key_columns
from ai_engine.core.stat_tests import fmt_p, gini, mann_kendall, pareto_share, text_columns

# Which analyses a domain cares about most, best first. Unlisted domains get
# GENERAL, and every domain still receives whatever the data structurally
# supports — this list only orders them.
DOMAIN_PRIORITIES: Dict[str, List[str]] = {
    "ecommerce":  ["concentration", "repeat_entity", "trend", "segments", "key_drivers", "group_effect"],
    "retail":     ["concentration", "repeat_entity", "trend", "segments", "key_drivers", "group_effect"],
    "sales":      ["concentration", "repeat_entity", "trend", "segments", "key_drivers", "group_effect"],
    "marketing":  ["segments", "concentration", "key_drivers", "group_effect", "trend", "repeat_entity"],
    "finance":    ["trend", "concentration", "key_drivers", "group_effect", "segments", "repeat_entity"],
    "iot":        ["trend", "key_drivers", "group_effect", "segments", "concentration", "repeat_entity"],
    "healthcare": ["key_drivers", "segments", "group_effect", "concentration", "trend", "repeat_entity"],
    "education":  ["key_drivers", "group_effect", "segments", "concentration", "trend", "repeat_entity"],
    "academic":   ["key_drivers", "group_effect", "segments", "concentration", "trend", "repeat_entity"],
    "hr":         ["key_drivers", "segments", "group_effect", "concentration", "repeat_entity", "trend"],
    "logistics":  ["trend", "concentration", "segments", "key_drivers", "group_effect", "repeat_entity"],
    "manufacturing": ["key_drivers", "trend", "group_effect", "segments", "concentration", "repeat_entity"],
    "real_estate": ["key_drivers", "segments", "group_effect", "concentration", "trend", "repeat_entity"],
}
GENERAL_PRIORITY = ["concentration", "key_drivers", "segments", "group_effect", "trend", "repeat_entity"]

# A category with more distinct values than this is an identifier in disguise;
# concentration across 10,000 order ids is not a finding.
_MAX_CATEGORY_CARDINALITY = 50


def _measure_columns(df: pd.DataFrame) -> List[str]:
    """Numeric columns that plausibly measure something, keys excluded."""
    out = []
    keys = key_columns(df)
    for col in df.select_dtypes(include=[np.number]).columns:
        if str(col) in keys:
            continue
        if df[col].dropna().nunique() <= 1:
            continue
        out.append(str(col))
    return out


def _category_columns(df: pd.DataFrame) -> List[str]:
    """Low-cardinality columns worth grouping by."""
    out = []
    keys = key_columns(df)
    for col in text_columns(df):
        s = df[col].dropna()
        if s.empty or str(col) in keys:
            continue
        n = s.nunique()
        if 2 <= n <= _MAX_CATEGORY_CARDINALITY:
            out.append(str(col))
    return out


def _pick_headline_measure(df: pd.DataFrame, measures: List[str]) -> Optional[str]:
    """
    The measure most likely to be the one that matters.

    Prefers a money-ish name, then the widest spread — a near-constant column
    makes for a pointless concentration statistic.
    """
    if not measures:
        return None
    money = [c for c in measures
             if any(w in c.lower() for w in
                    ("revenue", "sales", "amount", "price", "cost", "total",
                     "value", "spend", "profit", "margin", "income"))]
    pool = money or measures
    return max(pool, key=lambda c: float(df[c].dropna().std() or 0.0))


# ── Concentration ────────────────────────────────────────────────────────────

def concentration(df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    How much of the total sits in the largest few categories.

    The generic engine reports group means, which hides this completely: two
    regions can have unremarkable averages and still account for most of the
    money because they hold most of the rows.
    """
    measures = _measure_columns(df)
    measure = _pick_headline_measure(df, measures)
    cats = _category_columns(df)
    if not measure or not cats:
        return None

    best = None
    best_excess = 0.0
    for cat in cats:
        grouped = df.groupby(cat, dropna=True)[measure].sum().sort_values(ascending=False)
        total = float(grouped.sum())
        # Fewer than three groups cannot be concentrated in any meaningful
        # sense: "the top 2 of 2 channels account for 100%" is arithmetic, not
        # a finding, and ranking on raw share picked exactly that every time.
        if total <= 0 or len(grouped) < 3:
            continue
        top2 = float(grouped.head(2).sum()) / total
        # Rank by how far concentration exceeds an even split, so a grouping is
        # only interesting when two of its many categories carry
        # disproportionate weight.
        excess = top2 - (2.0 / len(grouped))
        if best is None or excess > best_excess:
            best_excess = excess
            shares = (grouped / total).round(4)
            best = {
                "measure":      measure,
                "groupedBy":    cat,
                "groupCount":   int(len(grouped)),
                "top1":         str(grouped.index[0]),
                "top1Share":    round(float(shares.iloc[0]), 4),
                "top2Share":    round(top2, 4),
                "topHalfShare": round(float(shares.head(max(1, len(shares) // 2)).sum()), 4),
                "shares":       {str(k): float(v) for k, v in shares.head(8).items()},
                "total":        round(total, 2),
            }
            g = gini(grouped.clip(lower=0).to_numpy())
            if g is not None:
                best["gini"] = round(g, 4)
            pareto = pareto_share(grouped.to_numpy())
            if pareto:
                best["groupsFor80Pct"] = pareto["holdersFor80Pct"]
    return best


# ── Repeat entities ──────────────────────────────────────────────────────────

def repeat_entity(df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    Whether a few entities account for most of the activity.

    Needs a reference key — a column naming something that recurs, like
    customer_id. Row identifiers are useless here by definition: they never
    repeat.
    """
    keys = [str(c) for c in df.columns if is_reference_key(df[c], str(c))]
    if not keys:
        return None

    key = min(keys, key=lambda c: df[c].dropna().nunique())
    counts = df[key].dropna().value_counts()
    if len(counts) < 2:
        return None

    repeat_mask = counts > 1
    if not repeat_mask.any():
        return None  # nothing recurs; "0% of entities repeat" is not a finding

    result: Dict[str, Any] = {
        "entity":            key,
        "distinctEntities":  int(len(counts)),
        "repeatEntities":    int(repeat_mask.sum()),
        "repeatShare":       round(float(repeat_mask.mean()), 4),
        "meanPerEntity":     round(float(counts.mean()), 2),
        "maxPerEntity":      int(counts.max()),
    }

    # The asymmetry that matters: do repeat entities carry disproportionate value?
    measure = _pick_headline_measure(df, _measure_columns(df))
    if measure:
        per_entity = df.groupby(key)[measure].sum()
        total = float(per_entity.sum())
        if total > 0:
            # Aligned by reindex rather than Index.isin: on 30,000 text keys
            # isin took over a second, reindex is a hash join.
            repeats = counts.reindex(per_entity.index).to_numpy() > 1
            result["measure"] = measure
            result["repeatValueShare"] = round(float(per_entity[repeats].sum()) / total, 4)
            # The figure behind "20% of customers bring 70% of revenue".
            pareto = pareto_share(per_entity.to_numpy(), top_fraction=0.2)
            if pareto:
                result["top20PctEntitiesShare"] = round(pareto["topShare"], 4)
                result["entitiesFor80PctShare"] = round(pareto["fractionFor80Pct"], 4)
            g = gini(per_entity.clip(lower=0).to_numpy())
            if g is not None:
                result["gini"] = round(g, 4)
    return result


# ── Trend ────────────────────────────────────────────────────────────────────

# Measures where adding rows up means nothing — a monthly total of prices or
# temperatures is not a quantity anyone has — are averaged per period instead.
_LEVEL_WORDS = ("rate", "ratio", "pct", "percent", "avg", "average", "mean", "price",
                "temp", "score", "index", "age", "margin", "share", "level", "balance",
                "rating", "speed", "pressure", "humidity", "probability", "yield", "per_")

# Period length in days, finest first. The trend is tested on per-period
# values, not raw rows: 30,000 orders give a regression thousands of
# "observations" that are really 24 months, and a p-value of 1e-40 for a
# wobble a reader would never call a trend.
_PERIODS = [("D", "day", 1.0), ("W", "week", 7.0), ("M", "month", 30.44),
            ("Q", "quarter", 91.31), ("Y", "year", 365.25)]
_PERIOD_ADJECTIVE = {"day": "daily", "week": "weekly", "month": "monthly",
                     "quarter": "quarterly", "year": "yearly"}
_MIN_PERIODS = 6
_MAX_PERIODS = 60


def _aggregation_for(measure: str, rows_per_period: float) -> str:
    name = measure.lower()
    if any(w in name for w in _LEVEL_WORDS):
        return "mean"
    # One row per period already is a series of values, not of transactions.
    if rows_per_period <= 1.5:
        return "mean"
    return "sum"


def _choose_period(dates: pd.Series) -> Optional[Tuple[str, str, float]]:
    """The finest period at least as long as the data's own spacing, giving 6-60 periods."""
    span = (dates.max() - dates.min()).total_seconds() / 86400.0
    distinct = np.sort(dates.dt.normalize().unique())
    native = 1.0
    if len(distinct) > 2:
        native = float(np.median(np.diff(distinct)) / np.timedelta64(1, "D"))
    for code, name, days in _PERIODS:
        if days < native * 0.9:
            continue
        periods = span / days + 1
        if periods <= _MAX_PERIODS:
            return (code, name, days) if periods >= _MIN_PERIODS else None
    return None


def _seasonality(values: pd.Series, period_name: str, slope: float) -> Optional[Dict[str, Any]]:
    """
    Month-of-year (monthly series, 2+ years) or weekday (daily series, 4+
    weeks) profile, measured on detrended values so that a rising trend is not
    mistaken for "later months are higher".
    """
    if period_name == "month" and len(values) >= 24:
        keys = values.index.month
        kind = "month_of_year"

        def label(k):
            return pd.Timestamp(2000, int(k), 1).strftime("%B")
    elif period_name == "day" and len(values) >= 28:
        keys = values.index.dayofweek
        kind = "day_of_week"

        def label(k):
            return pd.Timestamp(2024, 1, 1 + int(k)).strftime("%A")
    else:
        return None

    from scipy import stats as scipy_stats

    detrended = values.to_numpy(dtype="float64") - slope * np.arange(len(values))
    frame = pd.DataFrame({"k": np.asarray(keys), "v": detrended})
    groups = [g.to_numpy() for _, g in frame.groupby("k")["v"]]
    if len(groups) < 2:
        return None
    allv = frame["v"].to_numpy()
    ss_t = float(((allv - allv.mean()) ** 2).sum())
    if ss_t <= 0:
        return None
    means = frame.groupby("k")["v"].mean()
    ss_b = float(sum(len(g) * (g.mean() - allv.mean()) ** 2 for g in groups))
    eta = ss_b / ss_t
    k, n = len(groups), len(allv)
    p = None
    if eta < 1 and n > k:
        f = (eta / (k - 1)) / ((1 - eta) / (n - k))
        p = float(scipy_stats.f.sf(f, k - 1, n - k))
    overall = float(np.mean(np.abs(values.to_numpy(dtype="float64")))) or 1.0
    return {
        "kind": kind,
        "peak": label(means.idxmax()),
        "trough": label(means.idxmin()),
        "peakVsTroughPctOfMean": round(float((means.max() - means.min()) / overall * 100), 1),
        "etaSquared": round(eta, 4),
        "pValue": fmt_p(p),
        "significant": bool(p is not None and p < 0.05 and eta >= 0.2),
        # Per-key offsets from the mean, used to deseasonalise the trend test;
        # removed before the result leaves this module.
        "_offsets": {int(k): float(v - allv.mean()) for k, v in means.items()},
        "_keys": np.asarray(keys),
    }


def trend(df: pd.DataFrame, date_col: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Direction and strength of change over time, tested on per-period values.

    Rows are aggregated to days, weeks, months, quarters or years — whichever
    gives 6 to 60 periods — summed for quantities and averaged for levels.
    The test is Mann-Kendall with Sen's slope, which a single spike cannot
    fake. A partial first or last period is dropped for summed measures,
    because a month holding three days of data is not a 90% collapse in sales.
    """
    if not date_col or date_col not in df.columns:
        return None
    measures = _measure_columns(df)
    measure = _pick_headline_measure(df, measures)
    if not measure:
        return None

    try:
        dates = pd.to_datetime(df[date_col], errors="coerce", format="mixed")
    except (ValueError, TypeError):
        dates = pd.to_datetime(df[date_col], errors="coerce")
    if getattr(dates.dt, "tz", None) is not None:
        dates = dates.dt.tz_localize(None)

    frame = pd.DataFrame({"t": dates, "y": pd.to_numeric(df[measure], errors="coerce")}).dropna()
    if len(frame) < 12:
        return None
    chosen = _choose_period(frame["t"])
    if not chosen:
        return None
    code, period_name, period_days = chosen

    periods = frame["t"].dt.to_period(code)
    counts = frame.groupby(periods)["y"].count()
    aggregation = _aggregation_for(measure, float(counts.median()))
    series = frame.groupby(periods)["y"].agg(aggregation)

    full_index = pd.period_range(series.index.min(), series.index.max(), freq=series.index.freq)
    empty_periods = int(len(full_index) - len(series))

    dropped = []
    if aggregation == "sum" and len(series) > _MIN_PERIODS:
        first_p, last_p = series.index[0], series.index[-1]
        t_min, t_max = frame["t"].min(), frame["t"].max()
        first_cover = (first_p.end_time - t_min).total_seconds() / 86400.0 / period_days
        last_cover = (t_max - last_p.start_time).total_seconds() / 86400.0 / period_days
        if last_cover < 0.8:
            series = series.iloc[:-1]
            dropped.append("last")
        if first_cover < 0.8 and len(series) > _MIN_PERIODS:
            series = series.iloc[1:]
            dropped.append("first")
    if len(series) < _MIN_PERIODS:
        return None

    values = series.to_numpy(dtype="float64")
    mk = mann_kendall(values)
    if mk is None:
        return None

    from scipy import stats as scipy_stats

    reg = scipy_stats.linregress(np.arange(len(values)), values)
    half = len(values) // 2
    first_half, second_half = float(values[:half].mean()), float(values[half:].mean())
    ts_index = series.index.to_timestamp()
    adjective = _PERIOD_ADJECTIVE[period_name]

    result: Dict[str, Any] = {
        "measure":        measure,
        "dateColumn":     str(date_col),
        "period":         period_name,
        "aggregation":    aggregation,
        "periods":        int(len(values)),
        "emptyPeriods":   empty_periods,
        "spanDays":       round(float((frame["t"].max() - frame["t"].min()).total_seconds() / 86400.0), 1),
        "method":         f"Mann-Kendall test on {adjective} {'totals' if aggregation == 'sum' else 'averages'}",
        "direction":      "rising" if mk["senSlope"] > 0 else "falling" if mk["senSlope"] < 0 else "flat",
        "kendallTau":     round(mk["tau"], 3),
        "pValue":         fmt_p(mk["p"]),
        "significant":    bool(mk["p"] < 0.05),
        "senSlopePerPeriod": round(mk["senSlope"], 4),
        "slopePerDay":    round(mk["senSlope"] / period_days, 4),
        "rSquared":       round(float(reg.rvalue ** 2), 4),
        "firstHalfMean":  round(first_half, 2),
        "secondHalfMean": round(second_half, 2),
        "changePct":      round((second_half - first_half) / abs(first_half) * 100, 2) if first_half else None,
        "peakPeriod":     str(series.idxmax()),
        "peakValue":      round(float(series.max()), 2),
        "troughPeriod":   str(series.idxmin()),
        "troughValue":    round(float(series.min()), 2),
        "lastPeriod":     str(series.index[-1]),
        "lastValue":      round(float(values[-1]), 2),
        "series":         [{"period": str(p), "value": round(float(v), 2)}
                           for p, v in list(series.items())[-36:]],
    }
    if dropped:
        result["partialPeriodsDropped"] = dropped
    if len(values) >= 2 and values[-2]:
        result["lastChangePct"] = round(float((values[-1] - values[-2]) / abs(values[-2]) * 100), 2)

    # Year over year: the latest full year against the one before, which
    # compares like seasons with like.
    per_year = {"month": 12, "quarter": 4, "week": 52}.get(period_name)
    if per_year and len(values) >= 2 * per_year:
        recent, prior = values[-per_year:], values[-2 * per_year:-per_year]
        agg = np.sum if aggregation == "sum" else np.mean
        if agg(prior):
            result["yearOverYearPct"] = round(float((agg(recent) - agg(prior)) / abs(agg(prior)) * 100), 2)

    season = _seasonality(pd.Series(values, index=ts_index), period_name, mk["senSlope"])
    if season:
        offsets, keys = season.pop("_offsets"), season.pop("_keys")
        result["seasonality"] = season
        # A strong seasonal swing hides a trend from a rank test: summer
        # peaks and winter troughs outweigh steady growth across two years.
        # With the month-of-year pattern removed, the test sees the growth.
        if season["significant"]:
            adjusted = values - np.array([offsets[int(k)] for k in keys])
            mk_adj = mann_kendall(adjusted)
            if mk_adj:
                result.update({
                    "method": result["method"] + ", after removing the seasonal pattern",
                    "unadjustedPValue": result["pValue"],
                    "direction": ("rising" if mk_adj["senSlope"] > 0 else
                                  "falling" if mk_adj["senSlope"] < 0 else "flat"),
                    "kendallTau": round(mk_adj["tau"], 3),
                    "pValue": fmt_p(mk_adj["p"]),
                    "rSquared": round(float(scipy_stats.linregress(np.arange(len(adjusted)), adjusted).rvalue ** 2), 4),
                    "significant": bool(mk_adj["p"] < 0.05),
                    "senSlopePerPeriod": round(mk_adj["senSlope"], 4),
                    "slopePerDay": round(mk_adj["senSlope"] / period_days, 4),
                    "deseasonalized": True,
                })

    # Volume: is the number of rows per period changing too? A rising total
    # can be more orders or bigger ones, and the report should say which.
    if aggregation == "sum":
        vol = counts.loc[series.index].to_numpy(dtype="float64")
        vmk = mann_kendall(vol)
        if vmk:
            result["volumeDirection"] = ("rising" if vmk["senSlope"] > 0 else
                                         "falling" if vmk["senSlope"] < 0 else "flat")
            result["volumeSignificant"] = bool(vmk["p"] < 0.05)
    return result


# ── Group effect size ────────────────────────────────────────────────────────

def group_effect(df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    How much of a measure's variation a grouping actually explains.

    The generic engine runs an ANOVA F-test and reports its p-value. On a few
    thousand rows almost any grouping is "significant", so a p-value alone
    invites the report to call a trivial difference meaningful. Eta-squared is
    the share of variance explained, which is the part a reader should act on.
    """
    measures = _measure_columns(df)
    measure = _pick_headline_measure(df, measures)
    cats = _category_columns(df)
    if not measure or not cats:
        return None

    best = None
    for cat in cats:
        groups = [g[measure].dropna().to_numpy()
                  for _, g in df.groupby(cat, dropna=True) if len(g) >= 3]
        if len(groups) < 2:
            continue
        all_values = np.concatenate(groups)
        grand_mean = all_values.mean()
        ss_total = float(((all_values - grand_mean) ** 2).sum())
        if ss_total <= 0:
            continue
        ss_between = float(sum(len(g) * (g.mean() - grand_mean) ** 2 for g in groups))
        eta_sq = ss_between / ss_total

        if best is None or eta_sq > best["etaSquared"]:
            means = {str(k): round(float(v), 2)
                     for k, v in df.groupby(cat)[measure].mean().sort_values(ascending=False).head(8).items()}
            best = {
                "measure":      measure,
                "groupedBy":    cat,
                "groupCount":   len(groups),
                "etaSquared":   round(eta_sq, 4),
                # Cohen's conventions for variance explained.
                "strength":     ("large" if eta_sq >= 0.14 else
                                 "medium" if eta_sq >= 0.06 else
                                 "small" if eta_sq >= 0.01 else "negligible"),
                "groupMeans":   means,
            }
    return best


# ── Entry point ──────────────────────────────────────────────────────────────

def build_domain_analyses(
    df: pd.DataFrame,
    domain: str = "general",
    date_col: Optional[str] = None,
    full_frame: Optional[pd.DataFrame] = None,
) -> Dict[str, Any]:
    """
    Run every analysis the frame structurally supports, ordered by domain.

    `df` may be a sample of a large file; `full_frame`, when given, is the
    whole file, and the analyses that report totals (concentration, repeat
    entities, trend) use it so that a total is never a sample's total.

    Returns {"domain", "priority", "analyses": {name: result}} with absent
    analyses simply missing rather than present-and-empty, so the prompt is not
    padded with nulls the model has to reason about.
    """
    from ai_engine.core.drivers import key_drivers, segments

    whole = full_frame if full_frame is not None else df
    headline = _pick_headline_measure(df, _measure_columns(df))
    available = {
        "concentration": lambda: concentration(whole),
        "repeat_entity": lambda: repeat_entity(whole),
        "trend":         lambda: trend(whole, date_col),
        "group_effect":  lambda: group_effect(df),
        "key_drivers":   lambda: key_drivers(df, headline),
        "segments":      lambda: segments(df, headline),
    }

    order = DOMAIN_PRIORITIES.get((domain or "general").strip().lower(), GENERAL_PRIORITY)
    order = order + [name for name in available if name not in order]

    analyses: Dict[str, Any] = {}
    for name in order:
        try:
            result = available[name]()
        except Exception as exc:  # one failed analysis must not lose the others
            print(f"[DomainStats] {name} failed: {exc}", flush=True)
            continue
        if result:
            analyses[name] = result

    return {"domain": domain or "general", "priority": order, "analyses": analyses}
