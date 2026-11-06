"""
Context-Aware Dataset Cleaner  —  Phase 2

Cleaning is applied in this order:
  1. General always-on cleaning (empty rows, duplicates, infinity values)
  2. Fill missing values: the median for numbers, the most common value for text
  3. Cap extreme outliers at the skew-adjusted fence

All of it is fixed rules, and no model has a say, so the same file gives the
same numbers. Columns a model wants left out of the analysis are taken out
afterwards: rows are told apart by every column they arrived with. With an
order id dropped first, 1,000 separate orders looked like copies of 20.

`what_cleaning_did` reports the result in the vocabulary the report uses:
  "remove_empty_rows"          → rows where all values were NaN were dropped
  "remove_duplicates"          → exact duplicate rows were dropped
  "remove_infinity"            → ±inf became NaN, then was filled
  "impute_median:<col>"        → NaN in <col> became its median
  "impute_mode:<col>"          → NaN in <col> became its most common value
  "cap_outliers:<col>"         → <col> was capped at the fence
  "drop_column:<col>"          → the column was dropped
"""

import numpy as np
import pandas as pd
from typing import List

from ai_engine.core.profiler import adjusted_fences, protected_columns
from ai_engine.core.stat_tests import text_columns
from ai_engine.models.models import DataQualityResult


def droppable_columns(df: pd.DataFrame, columns: List[str]) -> List[str]:
    """
    Which of a model's "drop this column" suggestions may stand.

    A model dropped discount_pct from a sales file, and neither the report nor
    the questions box then knew the file had discounts. A suggestion stands only
    for a column there is nothing to analyse in: one that names rows, holds one
    value, is mostly empty, or is free text with hardly a repeat.
    """
    keys = set(protected_columns(df))
    allowed = []
    for name in columns:
        if name not in df.columns:
            continue
        s = df[name]
        filled = s.dropna()
        free_text = (not pd.api.types.is_numeric_dtype(s) and len(filled) > 0
                     and filled.nunique() / len(filled) > 0.5)
        if name in keys or filled.nunique() <= 1 or s.isna().mean() >= 0.85 or free_text:
            allowed.append(name)
    return allowed


def clean_dataset(
    df: pd.DataFrame,
    quality: DataQualityResult,
) -> pd.DataFrame:
    """
    Clean the dataset by fixed rules.
    Returns a cleaned copy — never mutates the original.
    """
    df = df.copy()

    # ── Step 1: Coerce mixed-type numeric columns ─────────────────────────
    # Object columns that are >50% numeric (e.g. "C" suppressed entries mixed
    # with real numbers) get converted to float. Non-parseable values → NaN,
    # which the fallback step below will then impute.
    # Same column set and the same sampled probe as the quality checker, so
    # every column it flags as mixed is one this step converts.
    for col in text_columns(df):
        if pd.api.types.is_bool_dtype(df[col]):
            continue
        probe = df[col].dropna().head(500)
        if len(probe) and pd.to_numeric(probe, errors="coerce").notnull().mean() < 0.3:
            continue
        coerced = pd.to_numeric(df[col], errors="coerce")
        numeric_ratio = coerced.notnull().mean()
        if numeric_ratio > 0.5:
            n_converted = int((coerced.isnull() & df[col].notnull()).sum())
            df[col] = coerced
            print(f"[Cleaner] Coerced '{col}' to numeric ({n_converted} non-numeric → NaN)")

    # ── Step 2: General always-on cleaning ────────────────────────────────
    df.dropna(how="all", inplace=True)
    df.drop_duplicates(inplace=True)
    df.replace([float("inf"), float("-inf")], float("nan"), inplace=True)

    # ── Step 3: Identify the columns that identify rows ──────────────────
    # Computed once, before anything is imputed or capped, and honoured by every
    # step below. An identifier names a thing; it does not measure one, so no
    # statistic of the column is a legitimate substitute for a missing value and
    # no magnitude makes one an outlier.
    # Row identifiers AND reference keys. A reference key repeats, so the
    # uniqueness test never catches one, but imputing it is just as damaging and
    # quieter: filling a missing customer_id with the most common value hands
    # those rows to a real customer who did not place them.
    id_cols = set(protected_columns(df))
    if id_cols:
        print(f"[Cleaner] Key column(s), exempt from imputation and capping: {sorted(id_cols)}")

    # ── Step 4: Fill missing values ─────────────
    # The same rule for every column, whatever the model planned.
    cols_to_drop_fallback = []

    for col in df.columns:
        if df[col].isnull().sum() == 0:
            continue

        missing_ratio = df[col].isnull().mean()

        # Identifiers are never imputed. A row without a key is dropped, because
        # the row cannot be attributed to anything — unless so many are missing
        # that the column cannot serve as an identifier at all, in which case the
        # column goes and the rows stay.
        if col in id_cols:
            if missing_ratio <= 0.2:
                before = len(df)
                df = df[df[col].notnull()]
                print(f"[Cleaner] Dropped {before - len(df)} row(s) missing identifier '{col}'")
            else:
                cols_to_drop_fallback.append(col)
                print(f"[Cleaner] Dropped identifier '{col}' — {round(missing_ratio*100)}% missing")
            continue

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

    # ── Step 5: Cap extreme outliers ──────────────────────────────────────
    # The quality checker flags any numeric column where >1% of values fall
    # outside 3×IQR, so every such column is capped here.
    #
    # Capping has to be iterative. Clipping to exactly q3 + 3*IQR piles the
    # outliers onto the boundary, which changes the quartiles; recomputing the
    # IQR on the clipped column can then place those same boundary values
    # outside the *new* 3×IQR fence. A single pass therefore does not converge —
    # the checker re-flags the column and the user is asked to clean again.
    # Repeating until the fence stops moving is what makes
    # check(clean(df)).needsCleaning == False hold.
    #
    # The fence itself is skew-adjusted (see profiler.adjusted_fences). A plain
    # IQR fence assumes symmetry, so on log-normal data — revenue, order counts,
    # durations — it declares the whole upper tail to be errors and winsorises
    # away the largest observations, which are usually the point of the
    # analysis. At zero skew the adjusted fence is identical to the old one.
    MAX_CAP_PASSES = 10
    for col in df.select_dtypes(include=[np.number]).columns:
        if col in id_cols:
            continue
        total_capped = 0
        for _ in range(MAX_CAP_PASSES):
            series = df[col].dropna()
            if len(series) < 10:
                break
            lower, upper = adjusted_fences(series)
            if not np.isfinite(lower) or not np.isfinite(upper):
                break
            mask = (df[col] < lower) | (df[col] > upper)
            n_capped = int(mask.sum())
            if n_capped == 0:
                break
            df[col] = df[col].clip(lower=lower, upper=upper)
            total_capped += n_capped
        if total_capped:
            print(f"[Cleaner] Capped {total_capped} extreme outlier(s) in '{col}'")

    # ── Step 6: Drop constant columns ─────────────────────────────────────
    # Zero-variance columns carry no analytical signal and are flagged by the
    # checker. Dropping them last means columns that only became constant as a
    # result of imputation or outlier capping are caught too.
    constant_cols = [c for c in df.columns if df[c].nunique(dropna=True) <= 1]
    # Never strip the frame down past the 2-column minimum the checker requires.
    if constant_cols and len(df.columns) - len(constant_cols) >= 2:
        df.drop(columns=constant_cols, inplace=True)
        print(f"[Cleaner] Dropped {len(constant_cols)} constant column(s): {constant_cols}")

    # ── Step 7: Final sweep ───────────────────────────────────────────────
    # Capping and dropping can re-expose duplicates that were distinct only
    # because of an outlier value. Re-run the cheap row-level rules so the
    # result satisfies check_data_quality().needsCleaning == False.
    df.drop_duplicates(inplace=True)
    df.reset_index(drop=True, inplace=True)

    return df


def what_cleaning_did(before: pd.DataFrame, after: pd.DataFrame) -> List[str]:
    """
    What cleaning changed, read from the data itself.

    The report used to repeat the model's plan, so it could describe a step
    that never ran on a column that never needed it.
    """
    kept = [c for c in before.columns if c in after.columns]
    keys = set(protected_columns(before))

    done = []
    if before.isnull().all(axis=1).any():
        done.append("remove_empty_rows")
    if before[kept].duplicated().any():
        done.append("remove_duplicates")
    # Read as numbers first: a column of text can hold "inf" as well.
    as_numbers = {c: pd.to_numeric(before[c], errors="coerce") for c in kept
                  if pd.api.types.is_numeric_dtype(after[c])}
    if any(np.isinf(s).any() for s in as_numbers.values()):
        done.append("remove_infinity")

    for col in kept:
        if col in keys:
            continue
        numeric = col in as_numbers
        was = as_numbers[col].replace([np.inf, -np.inf], np.nan) if numeric else before[col]
        gaps = int(was.isnull().sum())
        if gaps and int(after[col].isnull().sum()) < gaps:
            done.append(f"{'impute_median' if numeric else 'impute_mode'}:{col}")
        if numeric and (after[col].max() < was.max() or after[col].min() > was.min()):
            done.append(f"cap_outliers:{col}")

    done += [f"drop_column:{c}" for c in before.columns if c not in after.columns]
    return done
