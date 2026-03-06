import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from ai_engine.models.models import StatsSummary, DataQualityResult


def build_stats_summary(df: pd.DataFrame, quality: DataQualityResult) -> StatsSummary:
    numeric_df   = df.select_dtypes(include=[np.number])
    categorical  = df.select_dtypes(include=["object", "category"])

    # ── Column types ──────────────────────────────────────────────────────
    column_types = {col: str(dtype) for col, dtype in df.dtypes.items()}

    # ── Missing % per column ──────────────────────────────────────────────
    missing_pct = (df.isnull().mean() * 100).round(2).to_dict()

    # ── Numeric stats (mean, median, std, min, max, q1, q3, skew, kurt) ──
    numeric_stats = {}
    for col in numeric_df.columns:
        s = numeric_df[col].dropna()
        if s.empty:
            continue
        skewness = float(scipy_stats.skew(s)) if len(s) > 2 else 0.0
        kurtosis = float(scipy_stats.kurtosis(s)) if len(s) > 3 else 0.0
        numeric_stats[col] = {
            "mean":   round(float(s.mean()),   4),
            "median": round(float(s.median()), 4),
            "std":    round(float(s.std()),    4),
            "min":    round(float(s.min()),    4),
            "max":    round(float(s.max()),    4),
            "q1":     round(float(s.quantile(0.25)), 4),
            "q3":     round(float(s.quantile(0.75)), 4),
            "skew":   round(skewness, 3),
            "kurtosis": round(kurtosis, 3),
            "outlier_pct": round(quality.outlierColumns.count(col) * 100 / max(len(quality.outlierColumns), 1), 1),
        }

    # ── Top correlations (up to 5) ────────────────────────────────────────
    top_correlations = []
    if len(numeric_df.columns) >= 2:
        corr = numeric_df.corr().abs()
        np.fill_diagonal(corr.values, 0)
        pairs = (
            corr.unstack()
            .sort_values(ascending=False)
            .drop_duplicates()
            .head(5)
        )
        for (c1, c2), val in pairs.items():
            top_correlations.append({
                "col1": c1, "col2": c2,
                "correlation": round(float(val), 3),
                "strength": "strong" if val > 0.7 else "moderate" if val > 0.4 else "weak"
            })

    # ── Categorical summaries (top 5 values + count) ─────────────────────
    cat_summaries = {}
    for col in categorical.columns:
        vc = df[col].value_counts().head(5)
        cat_summaries[col] = {
            "unique_count": int(df[col].nunique()),
            "top_values":   {str(k): int(v) for k, v in vc.items()},
        }

    # ── Outlier summary ───────────────────────────────────────────────────
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
    )
