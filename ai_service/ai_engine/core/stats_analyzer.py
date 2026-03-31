"""
Enhanced Statistical Analysis Engine — Phase 3

Produces a rich StatsSummary used by the LLM insight agent.
Added over the baseline:
  - Normality tests (Shapiro-Wilk for n<5000, KS otherwise)
  - Spearman rank correlations (alongside Pearson)
  - Group comparisons (categorical × numeric, ANOVA F-test)
  - Temporal detection (datetime column detection, range, inferred frequency)
  - Isolation Forest anomaly scoring per column
"""

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from typing import List, Dict, Any, Optional

from ai_engine.models.models import StatsSummary, DataQualityResult


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _try_parse_dates(df: pd.DataFrame) -> Optional[str]:
    """
    Return the name of the first column that looks like a datetime.
    Tries dtype first, then attempted coercion.
    """
    # Already datetime
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            return col

    # Try coercing object columns
    for col in df.select_dtypes(include="object").columns:
        sample = df[col].dropna().head(50)
        try:
            converted = pd.to_datetime(sample, infer_datetime_format=True, errors="coerce")
            if converted.notna().mean() > 0.8:
                return col
        except Exception:
            continue
    return None


def _infer_frequency(series: pd.Series) -> str:
    """Infer temporal frequency from a parsed datetime series."""
    try:
        parsed = pd.to_datetime(series, errors="coerce").dropna().sort_values()
        if len(parsed) < 3:
            return "irregular"
        diffs = parsed.diff().dropna()
        median_diff = diffs.median()
        days = median_diff.days
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


def _normality_tests(df: pd.DataFrame, numeric_cols: List[str]) -> List[Dict[str, Any]]:
    results = []
    for col in numeric_cols:
        s = df[col].dropna()
        if len(s) < 8:
            continue
        try:
            if len(s) < 5000:
                stat, p = scipy_stats.shapiro(s.sample(min(len(s), 2000), random_state=42))
                test_name = "shapiro"
            else:
                # KS test against normal distribution
                normalized = (s - s.mean()) / s.std()
                stat, p = scipy_stats.kstest(normalized, "norm")
                test_name = "ks"
            results.append({
                "column":    col,
                "test_used": test_name,
                "statistic": round(float(stat), 4),
                "p_value":   round(float(p), 4),
                "is_normal": bool(p > 0.05),
            })
        except Exception:
            continue
    return results


def _group_comparisons(df: pd.DataFrame, max_groups: int = 3) -> List[Dict[str, Any]]:
    """
    For the best categorical × numeric pairs, compute group statistics
    and a one-way ANOVA F-test.
    """
    results = []
    categorical_cols = [
        c for c in df.select_dtypes(include=["object", "category"]).columns
        if 2 <= df[c].nunique() <= 20
    ]
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

    if not categorical_cols or not numeric_cols:
        return results

    # Score each categorical column by (unique count variety, non-null ratio)
    def col_score(c):
        n = df[c].nunique()
        non_null = df[c].notna().mean()
        return non_null * (1 / (1 + abs(n - 5)))  # prefer ~5 categories

    best_cats = sorted(categorical_cols, key=col_score, reverse=True)[:max_groups]

    for cat_col in best_cats:
        # Pick the numeric column with most variance
        best_num = max(
            numeric_cols,
            key=lambda c: df[c].std() / (df[c].mean() + 1e-9) if df[c].mean() != 0 else df[c].std(),
            default=None,
        )
        if best_num is None:
            continue

        groups = {}
        group_arrays = []
        for name, grp in df.groupby(cat_col):
            vals = grp[best_num].dropna()
            if len(vals) < 3:
                continue
            groups[str(name)] = {
                "mean":  round(float(vals.mean()), 4),
                "std":   round(float(vals.std()), 4),
                "count": int(len(vals)),
                "median": round(float(vals.median()), 4),
            }
            group_arrays.append(vals.values)

        if len(group_arrays) < 2:
            continue

        f_stat, p_val = None, None
        try:
            f_stat, p_val = scipy_stats.f_oneway(*group_arrays)
            f_stat = round(float(f_stat), 4)
            p_val  = round(float(p_val), 6)
        except Exception:
            pass

        results.append({
            "group_column":  cat_col,
            "metric_column": best_num,
            "group_stats":   groups,
            "f_statistic":   f_stat,
            "p_value":       p_val,
            "significant":   bool(p_val is not None and p_val < 0.05),
        })

    return results


def _spearman_correlations(df: pd.DataFrame, top_n: int = 5) -> List[Dict[str, Any]]:
    numeric_df = df.select_dtypes(include=[np.number])
    if len(numeric_df.columns) < 2:
        return []
    try:
        corr_matrix = numeric_df.corr(method="spearman").abs()
        vals = corr_matrix.values.copy()
        np.fill_diagonal(vals, 0)
        corr = pd.DataFrame(vals, index=corr_matrix.index, columns=corr_matrix.columns)
        pairs = corr.unstack().sort_values(ascending=False).drop_duplicates().head(top_n)
        results = []
        for (c1, c2), val in pairs.items():
            results.append({
                "col1": c1, "col2": c2,
                "spearman": round(float(val), 3),
                "strength": "strong" if val > 0.7 else "moderate" if val > 0.4 else "weak",
            })
        return results
    except Exception:
        return []


def _isolation_forest_anomalies(df: pd.DataFrame) -> Dict[str, float]:
    """
    Return per-column anomaly percentage using Isolation Forest on all numerics together.
    Falls back gracefully if sklearn not available.
    """
    numeric_df = df.select_dtypes(include=[np.number]).dropna()
    if len(numeric_df.columns) < 1 or len(numeric_df) < 20:
        return {}
    try:
        from sklearn.ensemble import IsolationForest
        clf = IsolationForest(contamination=0.05, random_state=42, n_estimators=100)
        preds = clf.fit_predict(numeric_df)
        anomaly_mask = preds == -1
        result = {}
        for col in numeric_df.columns:
            # Per-column anomaly rate is the global rate (same mask)
            result[col] = round(float(anomaly_mask.mean() * 100), 2)
        return result
    except Exception:
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def build_stats_summary(df: pd.DataFrame, quality: DataQualityResult) -> StatsSummary:
    numeric_df  = df.select_dtypes(include=[np.number])
    categorical = df.select_dtypes(include=["object", "category"])

    # ── Column types ──────────────────────────────────────────────────────────
    column_types = {col: str(dtype) for col, dtype in df.dtypes.items()}

    # ── Missing % per column ──────────────────────────────────────────────────
    missing_pct = (df.isnull().mean() * 100).round(2).to_dict()

    # ── Numeric stats ─────────────────────────────────────────────────────────
    numeric_stats = {}
    for col in numeric_df.columns:
        s = numeric_df[col].dropna()
        if s.empty:
            continue
        q1 = float(s.quantile(0.25))
        q3 = float(s.quantile(0.75))
        iqr = q3 - q1
        skewness  = float(scipy_stats.skew(s))  if len(s) > 2 else 0.0
        kurtosis  = float(scipy_stats.kurtosis(s)) if len(s) > 3 else 0.0
        if iqr > 0:
            outlier_pct = float(((s < q1 - 3 * iqr) | (s > q3 + 3 * iqr)).mean() * 100)
        else:
            outlier_pct = 0.0

        numeric_stats[col] = {
            "mean":        round(float(s.mean()),   4),
            "median":      round(float(s.median()), 4),
            "std":         round(float(s.std()),    4),
            "min":         round(float(s.min()),    4),
            "max":         round(float(s.max()),    4),
            "q1":          round(q1, 4),
            "q3":          round(q3, 4),
            "skew":        round(skewness, 3),
            "kurtosis":    round(kurtosis, 3),
            "outlier_pct": round(outlier_pct, 1),
        }

    # ── Pearson correlations (top 5) ──────────────────────────────────────────
    top_correlations = []
    if len(numeric_df.columns) >= 2:
        try:
            corr_matrix = numeric_df.corr().abs()
            corr_vals = corr_matrix.values.copy()
            np.fill_diagonal(corr_vals, 0)
            corr = pd.DataFrame(corr_vals, index=corr_matrix.index, columns=corr_matrix.columns)
            pairs = corr.unstack().sort_values(ascending=False).drop_duplicates().head(5)
            for (c1, c2), val in pairs.items():
                top_correlations.append({
                    "col1": c1, "col2": c2,
                    "correlation": round(float(val), 3),
                    "strength": "strong" if val > 0.7 else "moderate" if val > 0.4 else "weak",
                })
        except Exception:
            pass

    # ── Spearman correlations (top 5) ────────────────────────────────────────
    spearman_corrs = _spearman_correlations(df)

    # ── Categorical summaries ─────────────────────────────────────────────────
    cat_summaries = {}
    for col in categorical.columns:
        vc = df[col].value_counts().head(5)
        cat_summaries[col] = {
            "unique_count": int(df[col].nunique()),
            "top_values":   {str(k): int(v) for k, v in vc.items()},
            "missing_pct":  round(float(df[col].isnull().mean() * 100), 1),
        }

    # ── Outlier summary (IQR 3x rule) ────────────────────────────────────────
    outlier_summary = {}
    for col in numeric_df.columns:
        s = numeric_df[col].dropna()
        if len(s) < 10:
            continue
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        ratio = ((s < q1 - 3 * iqr) | (s > q3 + 3 * iqr)).mean()
        if ratio > 0:
            outlier_summary[col] = round(float(ratio * 100), 2)

    # ── Normality tests ───────────────────────────────────────────────────────
    normality_tests = _normality_tests(df, numeric_df.columns.tolist())

    # ── Group comparisons ─────────────────────────────────────────────────────
    group_comparisons = _group_comparisons(df)

    # ── Temporal detection ────────────────────────────────────────────────────
    time_col = _try_parse_dates(df)
    if time_col:
        try:
            parsed_dates = pd.to_datetime(df[time_col], errors="coerce").dropna()
            date_min = str(parsed_dates.min().date())
            date_max = str(parsed_dates.max().date())
            freq = _infer_frequency(df[time_col])
            temporal_info = {
                "detected":          True,
                "time_column":       time_col,
                "inferred_frequency": freq,
                "date_range":        f"{date_min} to {date_max}",
                "trend_columns":     numeric_df.columns.tolist()[:5],
            }
        except Exception:
            temporal_info = {"detected": False}
    else:
        temporal_info = {"detected": False}

    # ── Isolation Forest anomaly scoring ─────────────────────────────────────
    anomaly_scores = _isolation_forest_anomalies(df)

    return StatsSummary(
        rowCount=len(df),
        columnCount=len(df.columns),
        columnTypes=column_types,
        missingPercentages=missing_pct,
        numericStats=numeric_stats,
        topCorrelations=top_correlations,
        categoricalSummaries=cat_summaries,
        outlierSummary=outlier_summary,
        detectedIssues=quality.warnings + quality.errors,
        normalityTests=normality_tests,
        groupComparisons=group_comparisons,
        temporalInfo=temporal_info,
        spearmanCorrelations=spearman_corrs,
        anomalyScores=anomaly_scores,
    )
