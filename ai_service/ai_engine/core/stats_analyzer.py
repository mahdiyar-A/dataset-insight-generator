"""
Statistical analysis engine — Phase 4.

Produces the StatsSummary every later phase works from: the report writer
quotes it, the confidence score is computed from it, the charts are checked
against it. A wrong number here is not a crash; it is a confident, plausible,
false sentence in a document someone hands to their board. So:

  * **Correlations keep their sign and carry their evidence.** Each pair has
    r, a p-value, the number of rows it rests on, a 95% interval (Pearson),
    and a Benjamini-Hochberg q-value across every pair tested. The first
    version reported |r|, so "price falls as discount rises" read as "price
    rises with discount", and ranked noise pairs alongside real ones.

  * **Group differences are ranked by effect size.** Every category is paired
    with the measure it separates most (not one measure for all), tested with
    both one-way ANOVA and the rank-based Kruskal-Wallis test, and reported
    with eta-squared so a trivial but "significant" gap is labelled trivial.

  * **Anomalies are measured, not asserted.** The Isolation Forest used to run
    with a fixed 5% contamination and report "5% anomalies" for every column
    of every file — the setting, echoed back. It now uses the data-dependent
    threshold, reports one figure for the rows, and names the measures that
    make those rows unusual.

  * **Large files are sampled for the expensive parts, and say so.** Counts,
    means and missing shares always use every row; correlations, group tests
    and models use a fixed random sample above SAMPLE_ROWS, recorded in
    `sampledRows`.

Everything runs locally. No model call.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Set

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from ai_engine.core.domain_stats import build_domain_analyses
from ai_engine.core.confounding import check_correlations
from ai_engine.core.identities import arithmetic_pairs, find_derived_columns
from ai_engine.core.profiler import adjusted_fences, key_columns
from ai_engine.core.stat_tests import (
    association_strength,
    bh_adjust,
    cohens_d,
    correlation_p_value,
    correlation_strength,
    cramers_v,
    d_strength,
    distribution_shape,
    epsilon_squared,
    fisher_ci,
    fmt_p,
    numeric_columns,
    robust_outliers,
    text_columns,
    variance_explained_strength,
)
from ai_engine.models.models import DataQualityResult, StatsSummary

# Above this many rows the pairwise analyses run on a fixed random sample.
SAMPLE_ROWS = 100_000
# Most numeric columns considered for correlation. Beyond this the matrix is
# mostly noise pairs and the prompt cannot carry them anyway.
MAX_CORRELATION_COLUMNS = 40
# Categories with more levels than this are not grouped by: 300 "groups" of a
# free-text field is not a comparison.
MAX_GROUP_LEVELS = 20
MAX_ASSOCIATION_LEVELS = 30
# A correlation this close to ±1 means two columns record the same thing
# (price in two currencies, a total and its only component).
NEAR_DUPLICATE_R = 0.98


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _num(x: Any) -> Optional[float]:
    """Round for the report: enough digits to quote, not so many they mislead."""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(v):
        return None
    a = abs(v)
    if a >= 1000:
        return round(v, 1)
    if a >= 1:
        return round(v, 3)
    return round(v, 4)


def _key_columns(df: pd.DataFrame) -> Set[str]:
    """Identifiers and reference keys: never measures, never groupings."""
    return {c for c in df.columns if str(c) in key_columns(df)}


def _measures(df: pd.DataFrame, keys: Set[str]) -> List[str]:
    return [c for c in numeric_columns(df)
            if c not in keys and df[c].dropna().nunique() > 1]


def _categories(df: pd.DataFrame, keys: Set[str], max_levels: int) -> List[str]:
    out = []
    for c in text_columns(df):
        if c in keys:
            continue
        n = df[c].dropna().nunique()
        if 2 <= n <= max_levels:
            out.append(c)
    return out


def _try_parse_dates(df: pd.DataFrame) -> Optional[str]:
    """
    Return the name of the first column that looks like a datetime.
    Tries dtype first, then attempted coercion.
    """
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            return col

    # Both dtypes are checked: pandas 3 gives string columns a dedicated `str`
    # dtype, so scanning only `object` found nothing and temporal detection
    # silently reported {"detected": false} for every dataset — taking the
    # trend analysis with it. infer_datetime_format is gone in pandas 3 as
    # well; format="mixed" is the replacement.
    for col in df.columns:
        s = df[col]
        if pd.api.types.is_numeric_dtype(s):
            continue
        if not (pd.api.types.is_object_dtype(s) or pd.api.types.is_string_dtype(s)):
            continue
        sample = s.dropna().head(50)
        if sample.empty:
            continue
        # Short codes like "A1" or "12" parse as dates under format="mixed";
        # a real date has at least a separator or a month name.
        if sample.astype(str).str.len().median() < 6:
            continue
        try:
            converted = pd.to_datetime(sample, errors="coerce", format="mixed")
        except (ValueError, TypeError):
            try:
                converted = pd.to_datetime(sample, errors="coerce")
            except Exception:
                continue
        if converted.notna().mean() > 0.8:
            return col
    return None


def _parse_dates(series: pd.Series) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    try:
        return pd.to_datetime(series, errors="coerce", format="mixed")
    except (ValueError, TypeError):
        return pd.to_datetime(series, errors="coerce")


def _infer_frequency(series: pd.Series) -> str:
    """Infer temporal frequency from a parsed datetime series."""
    try:
        parsed = _parse_dates(series).dropna().drop_duplicates().sort_values()
        if len(parsed) < 3:
            return "irregular"
        days = parsed.diff().dropna().median().days
        if days <= 1:
            return "daily"
        elif days <= 8:
            return "weekly"
        elif days <= 35:
            return "monthly"
        elif days <= 100:
            return "quarterly"
        elif days <= 400:
            return "yearly"
        else:
            return "multi-year"
    except Exception:
        return "irregular"


# ─────────────────────────────────────────────────────────────────────────────
# Per-column description
# ─────────────────────────────────────────────────────────────────────────────

def _fences(df: pd.DataFrame, cols: List[str]) -> Dict[str, tuple]:
    """Skew-adjusted fences per column, computed once: the medcouple is O(n^2)."""
    out = {}
    for col in cols:
        s = df[col].dropna()
        out[str(col)] = adjusted_fences(s) if len(s) >= 10 else (-np.inf, np.inf)
    return out


def _numeric_stats(df: pd.DataFrame, cols: List[str], fences: Dict[str, tuple]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for col in cols:
        s = df[col].dropna()
        if s.empty:
            continue
        v = s.to_numpy(dtype="float64")
        q1, q3 = np.quantile(v, [0.25, 0.75])
        lower, upper = fences.get(str(col), (-np.inf, np.inf))
        fence_pct = float(((v < lower) | (v > upper)).mean() * 100) if np.isfinite(lower) else 0.0
        robust = robust_outliers(v)
        entry = {
            "mean":        _num(v.mean()),
            "median":      _num(np.median(v)),
            "std":         _num(v.std(ddof=1)) if len(v) > 1 else 0.0,
            "min":         _num(v.min()),
            "max":         _num(v.max()),
            "q1":          _num(q1),
            "q3":          _num(q3),
            "sum":         _num(v.sum()),
            "skew":        round(float(scipy_stats.skew(v)), 3) if len(v) > 2 and np.ptp(v) > 0 else 0.0,
            "kurtosis":    round(float(scipy_stats.kurtosis(v)), 3) if len(v) > 3 and np.ptp(v) > 0 else 0.0,
            "outlier_pct": round(fence_pct, 1),
            "zeros_pct":   round(float((v == 0).mean() * 100), 1),
            "negative_pct": round(float((v < 0).mean() * 100), 1),
            "count":       int(len(v)),
        }
        shape = distribution_shape(v)
        if shape:
            entry["shape"] = shape
        if robust:
            entry["robust_outlier_pct"] = round(robust["pct"], 2)
        out[str(col)] = entry
    return out


def _categorical_summaries(df: pd.DataFrame, cols: List[str]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    n = max(len(df), 1)
    for col in cols:
        s = df[col]
        vc = s.value_counts()
        top = vc.head(5)
        entry = {
            "unique_count": int(s.nunique()),
            "top_values":   {str(k): int(v) for k, v in top.items()},
            "missing_pct":  round(float(s.isnull().mean() * 100), 1),
        }
        if len(vc):
            entry["top_share"] = round(float(vc.iloc[0] / max(vc.sum(), 1)), 4)
            # Share of rows covered by the five most common values: tells the
            # writer whether "top values" describe the column or a sliver of it.
            entry["top5_share"] = round(float(top.sum() / max(vc.sum(), 1)), 4)
        out[str(col)] = entry
    return out


def _outlier_summary(df: pd.DataFrame, cols: List[str], fences: Dict[str, tuple]) -> Dict[str, float]:
    """
    Share of extreme values per measure, by the same skew-adjusted fences the
    quality checker uses, so the report and the cleaning prompt agree.
    """
    out = {}
    for col in cols:
        s = df[col].dropna()
        if len(s) < 10:
            continue
        lower, upper = fences[str(col)]
        if not np.isfinite(lower) or not np.isfinite(upper):
            continue
        ratio = float(((s < lower) | (s > upper)).mean())
        if ratio > 0:
            out[str(col)] = round(ratio * 100, 2)
    return out


def _normality_tests(df: pd.DataFrame, cols: List[str]) -> List[Dict[str, Any]]:
    results = []
    for col in cols[:15]:
        s = df[col].dropna()
        if len(s) < 8 or s.nunique() < 3:
            continue
        try:
            if len(s) < 5000:
                stat, p = scipy_stats.shapiro(s.sample(min(len(s), 2000), random_state=42))
                test_name = "shapiro"
            else:
                normalized = (s - s.mean()) / s.std()
                stat, p = scipy_stats.kstest(normalized, "norm", method="asymp")
                test_name = "ks"
            results.append({
                "column":    str(col),
                "test_used": test_name,
                "statistic": round(float(stat), 4),
                "p_value":   fmt_p(p),
                "is_normal": bool(p > 0.05),
            })
        except Exception:
            continue
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Relationships
# ─────────────────────────────────────────────────────────────────────────────

def _correlations(
    df: pd.DataFrame, cols: List[str], method: str, top_n: int = 8, arithmetic: Set[frozenset] = frozenset(),
) -> List[Dict[str, Any]]:
    """
    Signed pairwise correlations with p, n, CI and BH q, strongest first.

    Pairwise-complete: each pair uses every row where both values exist, and
    reports that n, because two columns with 40% missing may share far fewer
    rows than the file has.

    Pairs in `arithmetic` are linked by calculation. They rank last, so they
    never take a place from a correlation that says something.
    """
    if len(cols) < 2:
        return []
    if len(cols) > MAX_CORRELATION_COLUMNS:
        # Keep the most complete columns; a 90%-missing column's correlations
        # rest on too few rows to rank.
        cols = sorted(cols, key=lambda c: df[c].notna().mean(), reverse=True)[:MAX_CORRELATION_COLUMNS]
    num = df[cols].astype("float64")
    try:
        r = num.corr(method=method).to_numpy()
    except Exception:
        return []
    present = num.notna().to_numpy(dtype="float64")
    n = present.T @ present

    pairs = []
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            rv, nij = r[i, j], int(n[i, j])
            if not np.isfinite(rv) or nij < 10:
                continue
            pairs.append((cols[i], cols[j], float(rv), nij, correlation_p_value(rv, nij)))
    if not pairs:
        return []
    q = bh_adjust([p for *_, p in pairs])

    rows = []
    for (c1, c2, rv, nij, p), qv in zip(pairs, q):
        item = {
            "col1": str(c1), "col2": str(c2),
            "n": nij,
            "direction": "positive" if rv > 0 else "negative",
            "strength": correlation_strength(rv),
            "p": fmt_p(p),
            "q": fmt_p(qv),
            "significant": bool(qv is not None and qv < 0.05),
        }
        if method == "pearson":
            item["correlation"] = round(rv, 3)
            ci = fisher_ci(rv, nij)
            if ci:
                item["ci95"] = [round(ci[0], 3), round(ci[1], 3)]
        else:
            item["spearman"] = round(rv, 3)
        if abs(rv) >= NEAR_DUPLICATE_R:
            item["nearDuplicate"] = True
        if frozenset((str(c1), str(c2))) in arithmetic:
            item["arithmetic"] = True
        rows.append(item)

    key = "correlation" if method == "pearson" else "spearman"
    rows.sort(key=lambda d: (not d.get("arithmetic", False), d["significant"],
                             not d.get("nearDuplicate", False), abs(d[key])), reverse=True)
    return rows[:top_n]


def _group_comparisons(df: pd.DataFrame, cats: List[str], measures: List[str], top_n: int = 5) -> List[Dict[str, Any]]:
    """
    The category × measure pairs with the largest real differences.

    eta-squared is computed for every pair in one vectorised pass per category
    (np.bincount over group codes), the ANOVA p follows from it in closed form,
    and the slower Kruskal-Wallis test runs only on the shortlist. At most two
    results per category, so one rich grouping cannot crowd out the rest.
    """
    if not cats or not measures:
        return []
    M = df[measures].to_numpy(dtype="float64")
    finite = np.isfinite(M)
    coded = {cat: pd.factorize(df[cat], sort=False) for cat in cats}

    def pair_data(cat: str, j: int):
        """Codes and values for one pair, groups under 3 rows dropped."""
        codes, levels = coded[cat]
        ok = (codes >= 0) & finite[:, j]
        c, y = codes[ok], M[ok, j]
        counts = np.bincount(c, minlength=len(levels))
        mask = (counts >= 3)[c]
        return c[mask], y[mask], levels

    candidates = []
    for cat in cats:
        for j, m in enumerate(measures):
            c, y, levels = pair_data(cat, j)
            if len(y) < 10:
                continue
            k_all = len(levels)
            counts = np.bincount(c, minlength=k_all)
            present = counts > 0
            if present.sum() < 2:
                continue
            sums = np.bincount(c, weights=y, minlength=k_all)
            means = np.where(present, sums / np.maximum(counts, 1), 0.0)
            grand = y.mean()
            ss_total = float(((y - grand) ** 2).sum())
            if ss_total <= 0:
                continue
            ss_between = float((counts[present] * (means[present] - grand) ** 2).sum())
            eta = ss_between / ss_total
            k, n = int(present.sum()), int(len(y))
            p_anova, f_stat = 0.0, None
            if eta < 1 and n > k:
                f_stat = (eta / (k - 1)) / ((1 - eta) / (n - k))
                p_anova = float(scipy_stats.f.sf(f_stat, k - 1, n - k))
            candidates.append({"cat": cat, "j": j, "measure": m, "eta": eta, "k": k, "n": n,
                               "p_anova": p_anova, "f": f_stat})

    if not candidates:
        return []
    q_all = bh_adjust([c["p_anova"] for c in candidates])
    for c, qv in zip(candidates, q_all):
        c["q"] = qv
    candidates.sort(key=lambda c: c["eta"], reverse=True)

    results: List[Dict[str, Any]] = []
    per_cat: Dict[str, int] = {}
    for c in candidates:
        if len(results) >= top_n:
            break
        if per_cat.get(c["cat"], 0) >= 2:
            continue
        per_cat[c["cat"]] = per_cat.get(c["cat"], 0) + 1

        codes, y, levels = pair_data(c["cat"], c["j"])
        stats_by_group = [(str(lv), y[codes == i]) for i, lv in enumerate(levels) if (codes == i).sum() >= 3]
        h, p_kw = None, None
        try:
            h, p_kw = scipy_stats.kruskal(*[g for _, g in stats_by_group])
            h, p_kw = float(h), float(p_kw)
            if not np.isfinite(h):
                h, p_kw = None, None
        except Exception:
            pass

        stats_by_group.sort(key=lambda t: len(t[1]), reverse=True)
        group_stats = {
            name: {"mean": _num(g.mean()), "median": _num(np.median(g)),
                   "std": _num(g.std(ddof=1)) if len(g) > 1 else 0.0, "count": int(len(g))}
            for name, g in stats_by_group[:8]
        }
        by_mean = sorted(stats_by_group, key=lambda t: t[1].mean(), reverse=True)
        hi_name, hi = by_mean[0]
        lo_name, lo = by_mean[-1]
        item = {
            "group_column":  str(c["cat"]),
            "metric_column": str(c["measure"]),
            "groups":        c["k"],
            "n":             c["n"],
            "group_stats":   group_stats,
            "highest":       {"group": hi_name, "mean": _num(hi.mean())},
            "lowest":        {"group": lo_name, "mean": _num(lo.mean())},
            "f_statistic":   _num(c["f"]) if c["f"] is not None else None,
            "p_value":       fmt_p(c["p_anova"]),
            "q_value":       fmt_p(c["q"]),
            "kruskal_h":     _num(h) if h is not None else None,
            "kruskal_p":     fmt_p(p_kw),
            "eta_squared":   round(c["eta"], 4),
            "epsilon_squared": round(epsilon_squared(h, c["n"]), 4) if h is not None else None,
            "effect":        variance_explained_strength(c["eta"]),
            # Significant only if both the parametric and the rank test agree
            # after correction, and the effect is not negligible: on large
            # files a negligible difference is always "significant".
            "significant":   bool(c["q"] is not None and c["q"] < 0.05
                                  and (p_kw is None or p_kw < 0.05)
                                  and c["eta"] >= 0.01),
        }
        if lo.mean() != 0 and np.sign(hi.mean()) == np.sign(lo.mean()):
            item["highToLowRatio"] = round(float(hi.mean() / lo.mean()), 3)
        if len(stats_by_group) == 2:
            d = cohens_d(hi, lo)
            item["cohens_d"] = round(d, 3) if d is not None else None
            item["d_effect"] = d_strength(d)
        results.append(item)
    return results


def _categorical_associations(df: pd.DataFrame, cats: List[str], top_n: int = 5) -> List[Dict[str, Any]]:
    """Cramér's V between category pairs, BH-corrected, strongest first."""
    if len(cats) < 2:
        return []
    cats = cats[:15]
    coded = {c: pd.factorize(df[c], sort=False) for c in cats}
    pairs = []
    for i in range(len(cats)):
        for j in range(i + 1, len(cats)):
            a, b = cats[i], cats[j]
            ca, la = coded[a]
            cb, lb = coded[b]
            ok = (ca >= 0) & (cb >= 0)
            if ok.sum() < 30:
                continue
            table = np.bincount(ca[ok] * len(lb) + cb[ok], minlength=len(la) * len(lb)).reshape(len(la), len(lb))
            res = cramers_v(table)
            if res is None:
                continue
            pairs.append((a, b, res, int(ok.sum())))
    if not pairs:
        return []
    q = bh_adjust([res["p"] for _, _, res, _ in pairs])
    rows = []
    for (a, b, res, n), qv in zip(pairs, q):
        item = {
            "col1": str(a), "col2": str(b), "n": n,
            "cramers_v": round(res["v"], 3),
            "strength": association_strength(res["v"]),
            "p": fmt_p(res["p"]), "q": fmt_p(qv),
            "significant": bool(qv is not None and qv < 0.05 and res["v"] >= 0.1),
        }
        if res["v"] >= 0.95:
            item["nearDuplicate"] = True
        rows.append(item)
    rows.sort(key=lambda d: (d["significant"], not d.get("nearDuplicate", False), d["cramers_v"]), reverse=True)
    return [r for r in rows if r["cramers_v"] >= 0.05][:top_n]


def _missingness_patterns(df: pd.DataFrame, cats: List[str], measures: List[str], top_n: int = 5) -> List[Dict[str, Any]]:
    """
    Columns whose missing values cluster in one group or one range of values.

    If income is missing for 40% of one region and 5% of the others, every
    finding about income by region is skewed, and the report has to say so.
    Missing completely at random would show no such pattern.
    """
    out = []
    n = len(df)
    if n < 50:
        return out
    for col in df.columns:
        miss = df[col].isna().to_numpy()
        share = miss.mean()
        if share < 0.02 or share > 0.8:
            continue
        best = None
        for cat in cats:
            if cat == col:
                continue
            codes, levels = pd.factorize(df[cat], sort=False)
            ok = codes >= 0
            if ok.sum() < 50:
                continue
            table = np.zeros((len(levels), 2))
            np.add.at(table, (codes[ok], miss[ok].astype(int)), 1)
            res = cramers_v(table)
            if res is None:
                continue
            rates = table[:, 1] / np.maximum(table.sum(axis=1), 1)
            worst = int(np.argmax(rates))
            cand = {"by": str(cat), "kind": "category", "cramers_v": round(res["v"], 3), "p": res["p"],
                    "worstGroup": str(levels[worst]), "worstGroupMissingPct": round(float(rates[worst] * 100), 1)}
            if best is None or cand["cramers_v"] > best.get("cramers_v", 0):
                best = cand
        for m in measures:
            if m == col:
                continue
            vals = df[m].to_numpy(dtype="float64")
            a, b = vals[miss & np.isfinite(vals)], vals[~miss & np.isfinite(vals)]
            if len(a) < 10 or len(b) < 10:
                continue
            d = cohens_d(a, b)
            if d is None or abs(d) < 0.3:
                continue
            p = float(scipy_stats.mannwhitneyu(a, b).pvalue)
            if best is None or (best["kind"] == "measure" and abs(d) > abs(best["cohens_d"])) or \
                    (best["kind"] == "category" and best["cramers_v"] < 0.1):
                best = {"by": str(m), "kind": "measure", "cohens_d": round(d, 3), "p": p,
                        "whenMissing": "higher" if d > 0 else "lower"}
        if best is None:
            continue
        strong = (best["kind"] == "category" and best["cramers_v"] >= 0.1) or best["kind"] == "measure"
        if strong and best["p"] < 0.01:
            best["p"] = fmt_p(best["p"])
            out.append({"column": str(col), "missingPct": round(float(share * 100), 1), **best})
    out.sort(key=lambda r: r["missingPct"], reverse=True)
    return out[:top_n]


def _anomalies(df: pd.DataFrame, measures: List[str], seed: int = 42) -> Dict[str, Any]:
    """
    Rows unusual in several measures at once, and what makes them unusual.

    The forest's own threshold ("auto") decides how many rows are anomalous,
    so the figure comes from the data. For those rows, each measure's median
    shift (in robust standard units) says which measures drive the anomaly.
    """
    cols = measures[:20]
    if len(cols) < 2:
        return {}
    frame = df[cols].dropna()
    if len(frame) < 50:
        return {}
    if len(frame) > 20_000:
        frame = frame.sample(20_000, random_state=seed)
    try:
        from sklearn.ensemble import IsolationForest
        clf = IsolationForest(contamination="auto", random_state=seed, n_estimators=60)
        flags = clf.fit_predict(frame.to_numpy(dtype="float64")) == -1
    except Exception:
        return {}
    k = int(flags.sum())
    result: Dict[str, Any] = {
        "method": "isolation_forest",
        "rowsScored": int(len(frame)),
        "anomalousRows": k,
        "anomalousPct": round(float(flags.mean() * 100), 2),
    }
    if k >= 3:
        shifts = []
        for c in cols:
            v = frame[c].to_numpy(dtype="float64")
            med = np.median(v)
            mad = np.median(np.abs(v - med)) * 1.4826
            scale = mad if mad > 0 else (v.std() or 1.0)
            shift = (np.median(v[flags]) - med) / scale
            shifts.append((abs(shift), c, shift))
        shifts.sort(reverse=True)
        result["drivers"] = [
            {"column": str(c), "direction": "high" if s > 0 else "low", "robustShift": round(float(s), 2)}
            for _, c, s in shifts[:3] if abs(s) >= 0.5
        ]
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def build_stats_summary(
    df: pd.DataFrame,
    quality: DataQualityResult,
    domain: str = "general",
    type_conversions: Optional[List[Dict[str, Any]]] = None,
    source_file: Optional[Dict[str, Any]] = None,
) -> StatsSummary:
    started = time.monotonic()
    keys = _key_columns(df)
    measures = _measures(df, keys)
    all_numeric = numeric_columns(df)
    texts = text_columns(df)

    sample = df
    sampled_rows = None
    if len(df) > SAMPLE_ROWS:
        sample = df.sample(SAMPLE_ROWS, random_state=42)
        sampled_rows = SAMPLE_ROWS

    column_types = {str(col): str(dtype) for col, dtype in df.dtypes.items()}
    missing_pct = {str(k): float(v) for k, v in (df.isnull().mean() * 100).round(2).items()}
    complete_rows = round(float(df.notna().all(axis=1).mean() * 100), 1) if len(df) else 0.0

    fences = _fences(df, all_numeric)
    numeric_stats = _numeric_stats(df, all_numeric, fences)
    cat_summaries = _categorical_summaries(df, texts)
    outlier_summary = _outlier_summary(df, measures, fences)
    normality = _normality_tests(sample, measures)

    derived = find_derived_columns(sample, measures)
    arithmetic = arithmetic_pairs(derived)
    pearson = _correlations(sample, measures, "pearson", arithmetic=arithmetic)
    spearman = _correlations(sample, measures, "spearman", arithmetic=arithmetic)

    group_cats = _categories(sample, keys, MAX_GROUP_LEVELS)
    groups = _group_comparisons(sample, group_cats, measures)
    correlation_checks = check_correlations(sample, pearson, group_cats)
    assoc = _categorical_associations(sample, _categories(sample, keys, MAX_ASSOCIATION_LEVELS))
    missing_patterns = _missingness_patterns(sample, group_cats, measures)

    time_col = _try_parse_dates(df)
    temporal_info: Dict[str, Any] = {"detected": False}
    if time_col:
        try:
            parsed = _parse_dates(df[time_col]).dropna()
            temporal_info = {
                "detected":           True,
                "time_column":        str(time_col),
                "inferred_frequency": _infer_frequency(df[time_col]),
                "date_range":         f"{parsed.min().date()} to {parsed.max().date()}",
                "distinct_dates":     int(parsed.dt.normalize().nunique()),
                "parsed_share":       round(float(len(parsed) / max(df[time_col].notna().sum(), 1)), 4),
                "trend_columns":      [str(c) for c in measures[:5]],
            }
        except Exception:
            temporal_info = {"detected": False}

    anomalies = _anomalies(sample, measures)

    # Everything above describes the data; these ask what it is for. Selection
    # is structural — the domain only orders them — so a wrong domain guess
    # costs relevance, never correctness.
    domain_analyses = build_domain_analyses(sample if sampled_rows else df, domain=domain, date_col=time_col,
                                            full_frame=df, derived=derived)

    elapsed = time.monotonic() - started
    print(f"[Stats] {len(df):,} rows x {len(df.columns)} cols in {elapsed:.2f}s "
          f"(sampled={sampled_rows is not None})", flush=True)

    return StatsSummary(
        rowCount=len(df),
        columnCount=len(df.columns),
        columnTypes=column_types,
        missingPercentages=missing_pct,
        numericStats=numeric_stats,
        topCorrelations=pearson,
        categoricalSummaries=cat_summaries,
        outlierSummary=outlier_summary,
        detectedIssues=quality.warnings + quality.errors,
        normalityTests=normality,
        groupComparisons=groups,
        temporalInfo=temporal_info,
        spearmanCorrelations=spearman,
        anomalyScores=anomalies,
        domainAnalyses=domain_analyses,
        categoricalAssociations=assoc,
        derivedColumns=derived,
        correlationChecks=correlation_checks,
        missingnessPatterns=missing_patterns,
        typeConversions=list(type_conversions or []),
        sampledRows=sampled_rows,
        completeRowsPct=complete_rows,
        sourceFile=dict(source_file or {}),
    )
