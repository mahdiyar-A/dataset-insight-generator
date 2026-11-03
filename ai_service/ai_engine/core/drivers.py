"""
What moves the number that matters — key drivers and stand-out segments.

The descriptive engine answers "what does each column look like" and "which
pairs move together". A reader's first real question is different: *what is
associated with the outcome I care about, and which groups stand out?* That is
what this module computes, locally, from the full set of columns:

  * **Target.** An explicit outcome column if there is one (churn, default,
    converted, ... with two values), otherwise the headline measure — the
    money-like column the concentration and trend analyses already lead with.

  * **Drivers.** Every other column is scored against the target on its own
    (rank correlation for numbers, variance explained for categories), then
    together in one gradient-boosted model whose permutation importance says
    how much each column adds once the others are known. The model's fit on
    held-out rows is reported too: if the columns explain 4% of the
    variation, the honest finding is that they do not explain it, and the
    drivers are labelled accordingly.

  * **Segments.** The single categories, and pairs of categories, whose
    average or rate differs most from everyone else's, each with a test
    against the rest of the data and a false-discovery-rate correction across
    all segments tried.

Two guards keep the findings honest. Columns that are near-copies of the
target (revenue_usd beside revenue, or a total that is a sum of the target)
are excluded and listed, since "revenue predicts revenue" is arithmetic, not a
driver. And everything is associational: the output says "associated with",
never "causes", and the prompt is told the same.
"""

from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from ai_engine.core.profiler import is_identifier, key_columns
from ai_engine.core.stat_tests import (
    bh_adjust,
    correlation_p_value,
    correlation_strength,
    eta_squared,
    fmt_p,
    numeric_columns,
    text_columns,
    variance_explained_strength,
)

# Rows the model is fitted on. Driver rankings are stable well below this, and
# the fit has to stay inside the analysis's time budget on a small server.
MODEL_ROWS = 4000
# A segment must hold at least this many rows, and this share of the data, to
# be reported: a "segment" of four customers is an anecdote.
MIN_SEGMENT_ROWS = 30
MIN_SEGMENT_SHARE = 0.02
# Above this rank correlation (or share of variance) a feature is treated as a
# restatement of the target rather than something that drives it.
DERIVED_THRESHOLD = 0.98
MAX_CATEGORY_LEVELS = 30
# Segment search runs on at most this many rows, and pairs of categories only
# combine each category's most common levels: the search is a screen for the
# report, not an exhaustive scan, and has to stay well under a second.
SEGMENT_ROWS = 50_000
PAIR_LEVELS = 8

_OUTCOME_NAME = re.compile(
    r"(churn|attrition|default|convert|conversion|survived|fraud|outcome|target|label|"
    r"exited|cancel|returned|clicked|purchased|approved|success|failed|failure|"
    r"responded|response|subscribed|retained|readmit|won|lost|left)",
    re.IGNORECASE,
)
_POSITIVE_WORDS = {"yes", "y", "true", "t", "1", "1.0"}


def _feature_pools(df: pd.DataFrame, target: str) -> Tuple[List[str], List[str]]:
    """Numeric and categorical candidate drivers, keys and the target excluded."""
    nums, cats = [], []
    keys = key_columns(df)
    for col in numeric_columns(df):
        if col == target or str(col) in keys:
            continue
        if df[col].dropna().nunique() <= 1:
            continue
        nums.append(col)
    for col in text_columns(df):
        if col == target or str(col) in keys:
            continue
        s = df[col].dropna()
        if s.empty:
            continue
        n = s.nunique()
        if 2 <= n <= MAX_CATEGORY_LEVELS:
            cats.append(col)
    return nums, cats


def _binary_positive(series: pd.Series) -> Optional[Tuple[pd.Series, str]]:
    """0/1 version of a two-valued column, and the label counted as positive."""
    s = series.dropna()
    values = list(pd.unique(s))
    if len(values) != 2:
        return None
    labels = [str(v).strip().lower() for v in values]
    positive = None
    for v, lab in zip(values, labels):
        if lab in _POSITIVE_WORDS:
            positive = v
    if positive is None:
        # No yes/no vocabulary: count the rarer value, which is how outcomes
        # such as "Exited" or "Default" are usually coded.
        counts = s.value_counts()
        positive = counts.index[-1]
    mapped = (series == positive).astype("float64").where(series.notna())
    return mapped, str(positive)


def pick_target(df: pd.DataFrame, headline: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    The column the drivers are computed for.

    An outcome column wins over the headline measure when the name says it is
    an outcome and it has exactly two values — "what predicts churn" is the
    question such a file is for. Otherwise the headline measure.
    """
    for col in df.columns:
        if not _OUTCOME_NAME.search(str(col)):
            continue
        if is_identifier(df[col], str(col)):
            continue
        b = _binary_positive(df[col])
        if b is None:
            continue
        rate = float(b[0].mean())
        if 0.01 <= rate <= 0.99:
            return {"column": str(col), "kind": "binary", "positive": b[1]}
    if headline and headline in df.columns:
        return {"column": headline, "kind": "numeric"}
    return None


def _target_values(df: pd.DataFrame, target: Dict[str, Any]) -> pd.Series:
    if target["kind"] == "binary":
        return _binary_positive(df[target["column"]])[0]
    return pd.to_numeric(df[target["column"]], errors="coerce").astype("float64")


# ── Univariate screening ─────────────────────────────────────────────────────

def _univariate(df: pd.DataFrame, y: pd.Series, nums: List[str], cats: List[str]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for col in nums:
        pair = pd.DataFrame({"x": df[col], "y": y}).dropna()
        if len(pair) < 20 or pair["x"].nunique() < 2 or pair["y"].nunique() < 2:
            continue
        rho = float(pair["x"].rank().corr(pair["y"].rank()))
        if not np.isfinite(rho):
            continue
        rows.append({
            "feature": str(col), "type": "numeric", "effect": abs(rho),
            "rho": round(rho, 3), "direction": "higher" if rho > 0 else "lower",
            "p": correlation_p_value(rho, len(pair)), "n": int(len(pair)),
            "strength": correlation_strength(rho),
        })
    for col in cats:
        pair = pd.DataFrame({"x": df[col], "y": y}).dropna()
        if len(pair) < 20:
            continue
        grouped = [g.to_numpy() for _, g in pair.groupby("x", observed=True)["y"] if len(g) >= 3]
        if len(grouped) < 2:
            continue
        eta = eta_squared(grouped)
        if eta is None:
            continue
        k, n = len(grouped), sum(len(g) for g in grouped)
        p = None
        if eta < 1 and n > k:
            f = (eta / (k - 1)) / ((1 - eta) / (n - k))
            p = float(scipy_stats.f.sf(f, k - 1, n - k))
        means = pair.groupby("x", observed=True)["y"].agg(["mean", "count"])
        means = means[means["count"] >= 3].sort_values("mean", ascending=False)
        rows.append({
            "feature": str(col), "type": "categorical", "effect": float(np.sqrt(eta)),
            "etaSquared": round(eta, 4), "p": p, "n": int(n),
            "strength": variance_explained_strength(eta),
            "highest": str(means.index[0]), "lowest": str(means.index[-1]),
        })
    q = bh_adjust([r["p"] for r in rows])
    for r, qv in zip(rows, q):
        r["q"] = qv
        r["significant"] = bool(qv is not None and qv < 0.05)
    return rows


# ── Multivariate model ───────────────────────────────────────────────────────

def _model_importance(
    df: pd.DataFrame, y: pd.Series, nums: List[str], cats: List[str], binary: bool,
    seed: int = 0,
) -> Optional[Dict[str, Any]]:
    """
    Held-out fit and permutation importance of all features together.

    One 70/30 split rather than k-fold cross-validation: the score only has to
    say whether the columns explain a lot, a little or nothing, and three
    extra fits cost more time than that distinction is worth on a small
    server. Scored on rows the model never saw, so an overfit model reads as
    weak rather than strong.
    """
    try:
        from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
        from sklearn.inspection import permutation_importance
        from sklearn.metrics import r2_score, roc_auc_score
        from sklearn.model_selection import train_test_split
    except Exception:
        return None

    features = nums + cats
    if not features:
        return None
    frame = df[features].copy()
    frame["__y"] = y
    frame = frame[frame["__y"].notna()]
    if len(frame) < 80:
        return None
    if len(frame) > MODEL_ROWS:
        frame = frame.sample(MODEL_ROWS, random_state=seed)
    target = frame.pop("__y").to_numpy()
    if binary and (target.sum() < 10 or (1 - target).sum() < 10):
        return None

    X = pd.DataFrame(index=frame.index)
    for col in nums:
        X[col] = pd.to_numeric(frame[col], errors="coerce").astype("float64")
    for col in cats:
        codes, _ = pd.factorize(frame[col], sort=True)
        X[col] = np.where(codes < 0, np.nan, codes).astype("float64")
    cat_mask = [c in cats for c in X.columns]

    params = dict(max_iter=60, learning_rate=0.1, max_leaf_nodes=15,
                  categorical_features=cat_mask, random_state=seed)
    model = (HistGradientBoostingClassifier(**params) if binary
             else HistGradientBoostingRegressor(**params))
    scoring = "roc_auc" if binary else "r2"
    try:
        X_tr, X_te, y_tr, y_te = train_test_split(
            X, target, test_size=0.3, random_state=seed,
            stratify=target if binary else None,
        )
        model.fit(X_tr, y_tr)
        if binary:
            fit = float(roc_auc_score(y_te, model.predict_proba(X_te)[:, 1]))
        else:
            fit = float(r2_score(y_te, model.predict(X_te)))
        perm = permutation_importance(model, X_te, y_te, scoring=scoring,
                                      n_repeats=8, random_state=seed)
    except Exception as exc:
        print(f"[Drivers] model failed: {exc}", flush=True)
        return None
    imp = np.clip(perm.importances_mean, 0, None)
    total = float(imp.sum())
    shares = {c: (float(v) / total if total > 0 else 0.0) for c, v in zip(X.columns, imp)}
    return {
        "metric": scoring,
        "score": round(fit, 3),
        "rowsUsed": int(len(X)),
        "importance": shares,
    }


def _fit_label(metric: str, score: float) -> str:
    """Plain words for how well the columns, together, account for the target."""
    if metric == "r2":
        if score >= 0.5:
            return "strong"
        if score >= 0.25:
            return "moderate"
        if score >= 0.1:
            return "weak"
        return "very weak"
    if score >= 0.8:
        return "strong"
    if score >= 0.7:
        return "moderate"
    if score >= 0.6:
        return "weak"
    return "very weak"


def key_drivers(df: pd.DataFrame, headline: Optional[str], time_budget_s: float = 6.0) -> Optional[Dict[str, Any]]:
    """
    Rank what is associated with the target, alone and together.

    Returns None when there is no target or nothing to rank it against.
    """
    started = time.monotonic()
    target = pick_target(df, headline)
    if not target:
        return None
    y = _target_values(df, target)
    if y.notna().sum() < 30 or y.dropna().nunique() < 2:
        return None

    nums, cats = _feature_pools(df, target["column"])
    if not nums and not cats:
        return None

    screened = _univariate(df, y, nums, cats)
    derived = [r["feature"] for r in screened
               if (r["type"] == "numeric" and abs(r.get("rho", 0)) >= DERIVED_THRESHOLD)
               or (r["type"] == "categorical" and r.get("etaSquared", 0) >= DERIVED_THRESHOLD)]
    screened = [r for r in screened if r["feature"] not in derived]
    nums = [c for c in nums if c not in derived]
    cats = [c for c in cats if c not in derived]

    model = None
    if time.monotonic() - started < time_budget_s and (nums or cats):
        model = _model_importance(df, y, nums, cats, binary=target["kind"] == "binary")

    importance = (model or {}).get("importance", {})
    for r in screened:
        r["modelShare"] = round(importance.get(r["feature"], 0.0), 3) if model else None

    # Rank by model share when the model explains something; otherwise by
    # the univariate effect, since a model that fits noise ranks noise.
    # Significant columns come first either way: permutation importance on a
    # few hundred held-out rows is noisy, and a column with no detectable
    # association must not outrank one the test is sure of.
    usable_model = model is not None and _fit_label(model["metric"], model["score"]) != "very weak"
    if usable_model:
        screened.sort(key=lambda r: (r["significant"], r["modelShare"] or 0.0, r["effect"]), reverse=True)
    else:
        screened.sort(key=lambda r: (r["significant"], r["effect"]), reverse=True)

    top = []
    for r in screened[:6]:
        item = {k: v for k, v in r.items() if k not in ("effect", "p", "q")}
        item["p"] = fmt_p(r["p"])
        item["q"] = fmt_p(r["q"])
        top.append(item)

    result: Dict[str, Any] = {
        "target": target["column"],
        "targetKind": target["kind"],
        "drivers": top,
        "excludedAsDerived": derived,
        "note": "Associations, not causes: a driver moves with the target in this data.",
    }
    if target["kind"] == "binary":
        result["positiveLabel"] = target["positive"]
        result["overallRate"] = round(float(y.mean()), 4)
    if model:
        result["model"] = {
            "metric": model["metric"],
            "score": model["score"],
            "fit": _fit_label(model["metric"], model["score"]),
            "rowsUsed": model["rowsUsed"],
        }
    return result


# ── Segments ─────────────────────────────────────────────────────────────────

def _segment_test(seg: np.ndarray, rest: np.ndarray, binary: bool) -> Optional[float]:
    if len(seg) < 2 or len(rest) < 2:
        return None
    if binary:
        p1, p2 = seg.mean(), rest.mean()
        pooled = (seg.sum() + rest.sum()) / (len(seg) + len(rest))
        se = np.sqrt(pooled * (1 - pooled) * (1 / len(seg) + 1 / len(rest)))
        if se <= 0:
            return None
        z = (p1 - p2) / se
        return float(2 * scipy_stats.norm.sf(abs(z)))
    if np.var(seg) == 0 and np.var(rest) == 0:
        return None
    t = scipy_stats.ttest_ind(seg, rest, equal_var=False)
    return float(t.pvalue) if np.isfinite(t.pvalue) else None


def segments(df: pd.DataFrame, headline: Optional[str], max_pairs_from: int = 3) -> Optional[Dict[str, Any]]:
    """
    Categories (and pairs of categories) whose target differs most from the rest.

    Ranked by an impact score — the gap to everyone else, weighted by the
    square root of the segment's size — so a large segment with a moderate gap
    outranks a tiny one with an extreme gap, which is usually noise.
    """
    target = pick_target(df, headline)
    if not target:
        return None
    y = _target_values(df, target)
    valid = y.notna()
    if valid.sum() < 60:
        return None
    binary = target["kind"] == "binary"
    _, cats = _feature_pools(df, target["column"])
    if not cats:
        return None

    sub = df.loc[valid, cats[:15]]
    yser = y[valid]
    if len(sub) > SEGMENT_ROWS:
        sub = sub.sample(SEGMENT_ROWS, random_state=0)
        yser = yser.loc[sub.index]
    cats = list(sub.columns)
    yv = yser.to_numpy()
    n = len(yv)
    overall = float(yv.mean())
    min_rows = max(MIN_SEGMENT_ROWS, int(np.ceil(MIN_SEGMENT_SHARE * n)))

    candidates: List[Dict[str, Any]] = []

    def consider(mask: np.ndarray, label: Dict[str, str]):
        k = int(mask.sum())
        if k < min_rows or n - k < min_rows:
            return
        seg, rest = yv[mask], yv[~mask]
        p = _segment_test(seg, rest, binary)
        if p is None:
            return
        m = float(seg.mean())
        candidates.append({
            "segment": label, "rows": k, "share": round(k / n, 4),
            "value": m, "rest": float(rest.mean()), "p": p,
            "impact": abs(m - float(rest.mean())) * np.sqrt(k),
        })

    # Single categories.
    level_effects = []
    for col in cats:
        col_values = sub[col].astype("object").to_numpy()
        for level in pd.unique(sub[col].dropna()):
            consider(col_values == level, {str(col): str(level)})
        grouped = [yv[col_values == lv] for lv in pd.unique(sub[col].dropna())]
        grouped = [g for g in grouped if len(g) >= 3]
        eta = eta_squared(grouped) if len(grouped) >= 2 else None
        level_effects.append((eta or 0.0, col))

    # Pairs, among the categories that matter most on their own.
    strongest = [c for _, c in sorted(level_effects, reverse=True)[:max_pairs_from]]
    for i in range(len(strongest)):
        for j in range(i + 1, len(strongest)):
            a, b = strongest[i], strongest[j]
            va = sub[a].astype("object").to_numpy()
            vb = sub[b].astype("object").to_numpy()
            top_a = [v for v, c in sub[a].value_counts().head(PAIR_LEVELS).items() if c >= min_rows]
            top_b = [v for v, c in sub[b].value_counts().head(PAIR_LEVELS).items() if c >= min_rows]
            for la in top_a:
                ma = va == la
                for lb in top_b:
                    consider(ma & (vb == lb), {str(a): str(la), str(b): str(lb)})

    if not candidates:
        return None
    q = bh_adjust([c["p"] for c in candidates])
    kept = []
    for c, qv in zip(candidates, q):
        if qv is not None and qv < 0.05:
            c["q"] = qv
            kept.append(c)
    if not kept:
        return {"target": target["column"], "targetKind": target["kind"],
                "overall": round(overall, 4), "segmentsTested": len(candidates),
                "high": [], "low": []}

    def render(c):
        out = {
            "segment": c["segment"], "rows": c["rows"], "share": c["share"],
            "value": round(c["value"], 4), "rest": round(c["rest"], 4),
            "q": fmt_p(c["q"]),
        }
        if overall:
            out["lift"] = round(c["value"] / overall, 3)
        return out

    high = sorted([c for c in kept if c["value"] > c["rest"]], key=lambda c: c["impact"], reverse=True)
    low = sorted([c for c in kept if c["value"] < c["rest"]], key=lambda c: c["impact"], reverse=True)
    result = {
        "target": target["column"],
        "targetKind": target["kind"],
        "overall": round(overall, 4),
        "segmentsTested": len(candidates),
        "high": [render(c) for c in high[:3]],
        "low": [render(c) for c in low[:2]],
    }
    if binary:
        result["positiveLabel"] = target["positive"]
    return result
