import numpy as np
import pandas as pd
from ai_engine.models.models import DataQualityResult


def check_data_quality(df: pd.DataFrame) -> DataQualityResult:
    warnings = []
    errors = []
    outlier_columns = []

    row_count = len(df)
    col_count = len(df.columns)

    # ── Fatal errors ──────────────────────────────────────────────────────
    if row_count < 10:
        errors.append(f"Dataset has only {row_count} rows — too small for meaningful analysis.")
    if col_count < 2:
        errors.append("Dataset needs at least 2 columns.")

    # Duplicate column names
    dupes = df.columns[df.columns.duplicated()].tolist()
    if dupes:
        errors.append(f"Duplicate column names: {dupes}")

    # Entirely empty columns
    for col in df.columns:
        if df[col].isnull().all():
            errors.append(f"Column '{col}' is entirely empty.")

    # ── Per-column quality ────────────────────────────────────────────────
    missing_per_col = df.isnull().mean()
    for col, ratio in missing_per_col.items():
        if ratio > 0.8:
            errors.append(f"Column '{col}' is {round(ratio*100)}% missing.")
        elif ratio > 0.4:
            warnings.append(f"Column '{col}' has {round(ratio*100)}% missing values.")
        elif ratio > 0.1:
            warnings.append(f"Column '{col}' has {round(ratio*100)}% missing values.")

    # Constant columns (no variance)
    for col in df.columns:
        if df[col].nunique(dropna=True) <= 1:
            warnings.append(f"Column '{col}' has no variance — all values are the same.")

    # Mixed type columns
    for col in df.select_dtypes(include="object").columns:
        coerced = pd.to_numeric(df[col], errors="coerce")
        numeric_ratio = coerced.notnull().mean()
        if 0.2 < numeric_ratio < 0.85:
            warnings.append(f"Column '{col}' has mixed numeric and text values ({round(numeric_ratio*100)}% numeric).")

    # Fully empty rows
    empty_rows = int(df.isnull().all(axis=1).sum())
    if empty_rows > 0:
        warnings.append(f"{empty_rows} completely empty rows found.")

    # Duplicate rows
    dup_rows = int(df.duplicated().sum())
    if dup_rows > 0:
        pct = round(dup_rows / row_count * 100, 1)
        warnings.append(f"{dup_rows} duplicate rows ({pct}% of dataset).")

    # ── Outlier detection (IQR 3x rule) ──────────────────────────────────
    numeric_df = df.select_dtypes(include=[np.number])
    for col in numeric_df.columns:
        series = numeric_df[col].dropna()
        if len(series) < 10:
            continue
        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        outlier_ratio = ((series < q1 - 3 * iqr) | (series > q3 + 3 * iqr)).mean()
        if outlier_ratio > 0.05:
            warnings.append(f"Column '{col}' has {round(outlier_ratio*100)}% extreme outliers.")
            outlier_columns.append(col)
        elif outlier_ratio > 0.01:
            warnings.append(f"Column '{col}' has some extreme outliers ({round(outlier_ratio*100)}%).")
            outlier_columns.append(col)

    # ── Decide if it needs cleaning ───────────────────────────────────────
    overall_missing = df.isnull().mean().mean()
    needs_cleaning = (
        len(warnings) > 0 or
        overall_missing > 0.05 or
        dup_rows > 0 or
        len(outlier_columns) > 0
    )

    is_usable = len(errors) == 0

    return DataQualityResult(
        warnings=warnings,
        errors=errors,
        isUsable=is_usable,
        needsCleaning=needs_cleaning,
        missingRatio=round(float(overall_missing), 4),
        outlierColumns=outlier_columns,
    )
