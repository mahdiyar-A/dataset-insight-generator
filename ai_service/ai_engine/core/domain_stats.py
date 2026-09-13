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

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from ai_engine.core.profiler import is_identifier, is_reference_key

# Which analyses a domain cares about most, best first. Unlisted domains get
# GENERAL, and every domain still receives whatever the data structurally
# supports — this list only orders them.
DOMAIN_PRIORITIES: Dict[str, List[str]] = {
    "ecommerce":  ["concentration", "repeat_entity", "trend", "group_effect"],
    "retail":     ["concentration", "repeat_entity", "trend", "group_effect"],
    "sales":      ["concentration", "repeat_entity", "trend", "group_effect"],
    "marketing":  ["concentration", "group_effect", "trend", "repeat_entity"],
    "finance":    ["trend", "concentration", "group_effect", "repeat_entity"],
    "iot":        ["trend", "group_effect", "concentration", "repeat_entity"],
    "healthcare": ["group_effect", "concentration", "trend", "repeat_entity"],
    "education":  ["group_effect", "concentration", "trend", "repeat_entity"],
    "hr":         ["group_effect", "concentration", "repeat_entity", "trend"],
}
GENERAL_PRIORITY = ["concentration", "group_effect", "trend", "repeat_entity"]

# A category with more distinct values than this is an identifier in disguise;
# concentration across 10,000 order ids is not a finding.
_MAX_CATEGORY_CARDINALITY = 50


def _measure_columns(df: pd.DataFrame) -> List[str]:
    """Numeric columns that plausibly measure something, keys excluded."""
    out = []
    for col in df.select_dtypes(include=[np.number]).columns:
        if is_identifier(df[col], str(col)) or is_reference_key(df[col], str(col)):
            continue
        if df[col].dropna().nunique() <= 1:
            continue
        out.append(str(col))
    return out


def _category_columns(df: pd.DataFrame) -> List[str]:
    """Low-cardinality columns worth grouping by."""
    out = []
    for col in df.columns:
        s = df[col].dropna()
        if s.empty or pd.api.types.is_numeric_dtype(s):
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
            repeat_ids = counts[repeat_mask].index
            result["measure"] = measure
            result["repeatValueShare"] = round(
                float(per_entity.loc[per_entity.index.isin(repeat_ids)].sum()) / total, 4)
    return result


# ── Trend ────────────────────────────────────────────────────────────────────

def trend(df: pd.DataFrame, date_col: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Direction and strength of change over time, with a significance test.

    The generic engine detects that a date column exists and infers its
    frequency, then stops — it never asks whether anything is going up or down,
    which for any dated dataset is the first question.
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

    frame = pd.DataFrame({"t": dates, "y": pd.to_numeric(df[measure], errors="coerce")}).dropna()
    if len(frame) < 12:
        return None

    frame = frame.sort_values("t")
    # Days since the first observation: keeps the slope in units a reader
    # understands rather than nanoseconds.
    x = (frame["t"] - frame["t"].iloc[0]).dt.total_seconds().to_numpy() / 86400.0
    y = frame["y"].to_numpy(dtype="float64")
    if np.ptp(x) <= 0:
        return None

    from scipy import stats as scipy_stats
    reg = scipy_stats.linregress(x, y)

    first_half = y[: len(y) // 2].mean()
    second_half = y[len(y) // 2:].mean()

    return {
        "measure":       measure,
        "dateColumn":    str(date_col),
        "spanDays":      round(float(np.ptp(x)), 1),
        "slopePerDay":   round(float(reg.slope), 4),
        "direction":     "rising" if reg.slope > 0 else "falling" if reg.slope < 0 else "flat",
        "pValue":        round(float(reg.pvalue), 5),
        "significant":   bool(reg.pvalue < 0.05),
        "rSquared":      round(float(reg.rvalue ** 2), 4),
        "firstHalfMean": round(float(first_half), 2),
        "secondHalfMean": round(float(second_half), 2),
        "changePct":     round(float((second_half - first_half) / first_half * 100), 2)
                         if first_half else None,
    }


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
) -> Dict[str, Any]:
    """
    Run every analysis the frame structurally supports, ordered by domain.

    Returns {"domain", "priority", "analyses": {name: result}} with absent
    analyses simply missing rather than present-and-empty, so the prompt is not
    padded with nulls the model has to reason about.
    """
    available = {
        "concentration": lambda: concentration(df),
        "repeat_entity": lambda: repeat_entity(df),
        "trend":         lambda: trend(df, date_col),
        "group_effect":  lambda: group_effect(df),
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
