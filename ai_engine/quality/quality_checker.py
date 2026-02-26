import numpy as np
import pandas as pd

from ai_engine.models.models import DataQualityResult


def check_data_quality(df: pd.DataFrame) -> DataQualityResult:
    warnings = []
    errors = []

    row_count = len(df)
    col_count = len(df.columns)

    # Very small.csv / insufficient datasets
    if row_count < 10:
        errors.append("Dataset contains fewer than 10 rows.")
    if col_count < 2:
        errors.append("Dataset must contain at least 2 columns.")

    # Missing values and empty columns
    missing_ratio_per_col = df.isnull().mean()
    for col, ratio in missing_ratio_per_col.items():
        if ratio > 0.8:
            errors.append(f"Column '{col}' has over 80% missing values.")
        elif ratio > 0.5:
            warnings.append(f"Column '{col}' has over 50% missing values.")

    for col in df.columns:
        if df[col].isnull().all():
            errors.append(f"Column '{col}' is entirely empty.")
        if df[col].nunique(dropna=True) <= 1:
            warnings.append(f"Column '{col}' has no variance (constant values).")

    # Empty rows
    empty_rows = int(df.isnull().all(axis=1).sum())
    if empty_rows > 0:
        warnings.append(f"Dataset contains {empty_rows} completely empty rows.")

    # Duplicate columns
    duplicates = df.columns[df.columns.duplicated()].tolist()
    if duplicates:
        errors.append(f"Duplicate column names found: {duplicates}")

    # Mixed / incorrect types (heuristic)
    for col in df.columns:
        series = df[col]
        if series.dtype == "object":
            coerced = pd.to_numeric(series, errors="coerce")
            numeric_ratio = coerced.notnull().mean()
            if 0.3 < numeric_ratio < 0.9:
                warnings.append(
                    f"Column '{col}' appears to contain mixed numeric and non-numeric values."
                )

    # Extreme outliers (IQR rule)
    numeric_df = df.select_dtypes(include=[np.number])
    for col in numeric_df.columns:
        series = numeric_df[col].dropna()
        if len(series) < 10:
            continue

        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue

        lower = q1 - 3 * iqr
        upper = q3 + 3 * iqr
        outlier_ratio = ((series < lower) | (series > upper)).mean()

        if outlier_ratio > 0.1:
            warnings.append(
                f"Column '{col}' contains many extreme outliers (~{round(outlier_ratio * 100)}%)."
            )
        elif outlier_ratio > 0.01:
            warnings.append(
                f"Column '{col}' contains some extreme outliers (~{round(outlier_ratio * 100)}%)."
            )

    is_usable = len(errors) == 0

    return DataQualityResult(
        warnings=warnings,
        errors=errors,
        isUsable=is_usable
    )
