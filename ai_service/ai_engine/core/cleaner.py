"""
Context-Aware Dataset Cleaner  —  Phase 2

Cleaning is applied in this order:
  1. Drop columns Groq classified as analytically irrelevant
  2. General always-on cleaning (empty rows, duplicates, infinity values)
  3. Groq-directed per-column methods (impute_median, cap_outliers, etc.)
  4. Default fallback for any remaining missing values not explicitly handled

Groq cleaning methods format:
  "remove_empty_rows"          → drop rows where all values are NaN
  "remove_duplicates"          → drop exact duplicate rows
  "remove_infinity"            → replace ±inf with NaN, then handle
  "impute_median:<col>"        → fill NaN in <col> with its median
  "impute_mode:<col>"          → fill NaN in <col> with its mode
  "impute_zero:<col>"          → fill NaN in <col> with 0
  "cap_outliers:<col>"         → winsorize <col> at 1.5 × IQR
  "drop_column:<col>"          → drop column (fallback for columns Groq missed)
"""

import numpy as np
import pandas as pd
from typing import List, Optional

from ai_engine.models.models import DataQualityResult


def clean_dataset(
    df: pd.DataFrame,
    quality: DataQualityResult,
    groq_drop_columns: Optional[List[str]] = None,
    groq_methods: Optional[List[str]] = None,
) -> pd.DataFrame:
    """
    Clean the dataset using Groq's directives + general rules.
    Returns a cleaned copy — never mutates the original.
    """
    df = df.copy()

    # ── Step 1: Drop columns Groq classified as irrelevant ─────────────────
    if groq_drop_columns:
        to_drop = [c for c in groq_drop_columns if c in df.columns]
        if to_drop:
            df.drop(columns=to_drop, inplace=True)
            print(f"[Cleaner] Dropped {len(to_drop)} irrelevant column(s): {to_drop}")

    # ── Step 2: Coerce mixed-type numeric columns ─────────────────────────
    # Object columns that are >50% numeric (e.g. "C" suppressed entries mixed
    # with real numbers) get converted to float. Non-parseable values → NaN,
    # which the fallback step below will then impute.
    for col in df.select_dtypes(include="object").columns:
        coerced = pd.to_numeric(df[col], errors="coerce")
        numeric_ratio = coerced.notnull().mean()
        if numeric_ratio > 0.5:
            n_converted = int((coerced.isnull() & df[col].notnull()).sum())
            df[col] = coerced
            print(f"[Cleaner] Coerced '{col}' to numeric ({n_converted} non-numeric → NaN)")

    # ── Step 3: General always-on cleaning ────────────────────────────────
    df.dropna(how="all", inplace=True)
    df.drop_duplicates(inplace=True)
    df.replace([float("inf"), float("-inf")], float("nan"), inplace=True)

    # ── Step 4: Apply Groq-directed per-column methods ────────────────────
    groq_handled_cols = set()

    for method in (groq_methods or []):
        if method in ("remove_empty_rows", "remove_duplicates", "remove_infinity"):
            continue  # already handled above

        if ":" not in method:
            continue

        method_name, col_name = method.split(":", 1)

        if col_name not in df.columns:
            continue  # column was already dropped or doesn't exist

        s = df[col_name]

        if method_name == "impute_median":
            if pd.api.types.is_numeric_dtype(s):
                df[col_name] = s.fillna(s.median())
                groq_handled_cols.add(col_name)

        elif method_name == "impute_mode":
            mode_vals = s.mode()
            if not mode_vals.empty:
                df[col_name] = s.fillna(mode_vals[0])
                groq_handled_cols.add(col_name)

        elif method_name == "impute_zero":
            df[col_name] = s.fillna(0)
            groq_handled_cols.add(col_name)

        elif method_name == "cap_outliers":
            if pd.api.types.is_numeric_dtype(s):
                clean = s.dropna()
                if len(clean) >= 10:
                    q1, q3 = clean.quantile(0.25), clean.quantile(0.75)
                    iqr = q3 - q1
                    if iqr > 0:
                        lower = q1 - 1.5 * iqr
                        upper = q3 + 1.5 * iqr
                        df[col_name] = s.clip(lower=lower, upper=upper)

        elif method_name == "drop_column":
            if col_name in df.columns:
                df.drop(columns=[col_name], inplace=True)
                groq_handled_cols.add(col_name)

    # ── Step 5: Default fallback for remaining missing values ─────────────
    # Handle any columns that still have NaNs but weren't explicitly directed
    cols_to_drop_fallback = []

    for col in df.columns:
        if df[col].isnull().sum() == 0:
            continue
        if col in groq_handled_cols:
            continue

        missing_ratio = df[col].isnull().mean()

        # Drop if > 80% missing
        if missing_ratio > 0.8:
            cols_to_drop_fallback.append(col)
            continue

        # Numeric → median imputation
        if pd.api.types.is_numeric_dtype(df[col]):
            df[col] = df[col].fillna(df[col].median())
        else:
            # Categorical → mode imputation
            mode_val = df[col].mode()
            df[col] = df[col].fillna(mode_val[0] if not mode_val.empty else "Unknown")

    if cols_to_drop_fallback:
        df.drop(columns=cols_to_drop_fallback, inplace=True)
        print(f"[Cleaner] Dropped {len(cols_to_drop_fallback)} column(s) with >80% missing: {cols_to_drop_fallback}")

    # ── Step 6: Cap extreme outliers ──────────────────────────────────────
    # The quality checker flags any numeric column where >1% of values fall
    # outside 3×IQR. Groq only directs cap_outliers for columns it happens to
    # notice, so anything it missed would still be flagged on the next check.
    #
    # Capping has to be iterative. Clipping to exactly q3 + 3*IQR piles the
    # outliers onto the boundary, which changes the quartiles; recomputing the
    # IQR on the clipped column can then place those same boundary values
    # outside the *new* 3×IQR fence. A single pass therefore does not converge —
    # the checker re-flags the column and the user is asked to clean again.
    # Repeating until the fence stops moving is what makes
    # check(clean(df)).needsCleaning == False hold.
    MAX_CAP_PASSES = 10
    for col in df.select_dtypes(include=[np.number]).columns:
        total_capped = 0
        for _ in range(MAX_CAP_PASSES):
            series = df[col].dropna()
            if len(series) < 10:
                break
            q1, q3 = series.quantile(0.25), series.quantile(0.75)
            iqr = q3 - q1
            if iqr <= 0:
                break
            lower, upper = q1 - 3 * iqr, q3 + 3 * iqr
            mask = (df[col] < lower) | (df[col] > upper)
            n_capped = int(mask.sum())
            if n_capped == 0:
                break
            df[col] = df[col].clip(lower=lower, upper=upper)
            total_capped += n_capped
        if total_capped:
            print(f"[Cleaner] Capped {total_capped} extreme outlier(s) in '{col}'")

    # ── Step 7: Drop constant columns ─────────────────────────────────────
    # Zero-variance columns carry no analytical signal and are flagged by the
    # checker. Dropping them last means columns that only became constant as a
    # result of imputation or outlier capping are caught too.
    constant_cols = [c for c in df.columns if df[c].nunique(dropna=True) <= 1]
    # Never strip the frame down past the 2-column minimum the checker requires.
    if constant_cols and len(df.columns) - len(constant_cols) >= 2:
        df.drop(columns=constant_cols, inplace=True)
        print(f"[Cleaner] Dropped {len(constant_cols)} constant column(s): {constant_cols}")

    # ── Step 8: Final sweep ───────────────────────────────────────────────
    # Capping and dropping can re-expose duplicates that were distinct only
    # because of an outlier value. Re-run the cheap row-level rules so the
    # result satisfies check_data_quality().needsCleaning == False.
    df.drop_duplicates(inplace=True)
    df.reset_index(drop=True, inplace=True)

    return df
