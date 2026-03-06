import numpy as np
import pandas as pd
from ai_engine.models.models import DataQualityResult


def clean_dataset(df: pd.DataFrame, quality: DataQualityResult) -> pd.DataFrame:
    """
    Cleans the dataset based on detected issues.
    Returns a cleaned copy — never mutates original.
    """
    df = df.copy()

    # ── Drop entirely empty rows ──────────────────────────────────────────
    df.dropna(how="all", inplace=True)

    # ── Drop duplicate rows ───────────────────────────────────────────────
    df.drop_duplicates(inplace=True)

    # ── Handle missing values per column ─────────────────────────────────
    for col in df.columns:
        missing_ratio = df[col].isnull().mean()
        if missing_ratio == 0:
            continue

        # Drop column if >80% missing
        if missing_ratio > 0.8:
            df.drop(columns=[col], inplace=True)
            continue

        # Numeric: fill with median (robust to outliers)
        if pd.api.types.is_numeric_dtype(df[col]):
            median_val = df[col].median()
            df[col].fillna(median_val, inplace=True)
        else:
            # Categorical: fill with mode
            mode_val = df[col].mode()
            if not mode_val.empty:
                df[col].fillna(mode_val[0], inplace=True)
            else:
                df[col].fillna("Unknown", inplace=True)

    # ── Cap extreme outliers (Winsorize at 1.5 IQR) ───────────────────────
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) < 10:
            continue
        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        df[col] = df[col].clip(lower=lower, upper=upper)

    return df
