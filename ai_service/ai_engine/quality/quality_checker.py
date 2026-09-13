import numpy as np
import pandas as pd
from ai_engine.core.profiler import adjusted_fences, fence_tolerance, is_identifier
from ai_engine.models.models import DataQualityResult


def check_data_quality(df: pd.DataFrame) -> DataQualityResult:
    """
    Inspect a DataFrame and report quality issues.

    `needsCleaning` is deliberately NOT "any warning exists". It is true only when
    the cleaner can actually change something — missing values, duplicate rows,
    empty rows, constant columns, mixed-type columns, or extreme outliers.

    Why: the chatbot asks "would you like me to clean this?" based on needsCleaning.
    If needsCleaning were driven by warnings the cleaner cannot act on, a user who
    accepted cleaning and re-uploaded the cleaned file would be asked again forever.
    Keeping this in sync with cleaner.clean_dataset() is what makes cleaning
    converge: clean(df) must satisfy check(clean(df)).needsCleaning == False.
    """
    warnings = []
    errors = []
    outlier_columns = []
    constant_columns = []
    mixed_type_columns = []

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

    # Constant columns (no variance) — cleaner drops these
    for col in df.columns:
        if df[col].nunique(dropna=True) <= 1:
            constant_columns.append(col)
            warnings.append(f"Column '{col}' has no variance — all values are the same.")

    # Mixed type columns — object columns that are mostly numeric but stored as strings
    # (e.g. "C" suppressed entries mixed with real numbers like "979594")
    for col in df.select_dtypes(include="object").columns:
        coerced = pd.to_numeric(df[col], errors="coerce")
        numeric_ratio = coerced.notnull().mean()
        if numeric_ratio > 0.5:
            # More than half the values are numeric — column should be numeric dtype
            mixed_type_columns.append(col)
            non_numeric_count = int((coerced.isnull() & df[col].notnull()).sum())
            warnings.append(
                f"Column '{col}' should be numeric but is stored as text "
                f"({round(numeric_ratio*100, 1)}% parseable, {non_numeric_count} non-numeric entries will become missing)."
            )

    # Fully empty rows
    empty_rows = int(df.isnull().all(axis=1).sum())
    if empty_rows > 0:
        warnings.append(f"{empty_rows} completely empty rows found.")

    # Duplicate rows
    dup_rows = int(df.duplicated().sum())
    if dup_rows > 0:
        pct = round(dup_rows / row_count * 100, 1)
        warnings.append(f"{dup_rows} duplicate rows ({pct}% of dataset).")

    # ── Outlier detection (skew-adjusted boxplot) ────────────────────────
    # Fences come from ai_engine.core.profiler so that this and the cleaner
    # cannot drift apart: the convergence invariant only holds while both agree
    # on where the fence sits and which columns are exempt.
    #
    # Identifiers are exempt. An account number is not an outlier at any
    # magnitude, and the cleaner will not touch one, so flagging it here would
    # ask the user to clean something nothing can fix.
    #
    # The fence is widened by a small relative tolerance before comparing,
    # because the cleaner clips values to sit exactly on it — see
    # profiler.fence_tolerance.
    numeric_df = df.select_dtypes(include=[np.number])
    for col in numeric_df.columns:
        series = numeric_df[col].dropna()
        if len(series) < 10:
            continue
        if is_identifier(df[col], str(col)):
            continue
        lower, upper = adjusted_fences(series)
        if not np.isfinite(lower) or not np.isfinite(upper):
            continue
        tol = fence_tolerance(lower, upper)
        lower_fence = lower - tol
        upper_fence = upper + tol
        outlier_ratio = ((series < lower_fence) | (series > upper_fence)).mean()
        if outlier_ratio > 0.05:
            warnings.append(f"Column '{col}' has {round(outlier_ratio*100)}% extreme outliers.")
            outlier_columns.append(col)
        elif outlier_ratio > 0.01:
            warnings.append(f"Column '{col}' has some extreme outliers ({round(outlier_ratio*100)}%).")
            outlier_columns.append(col)

    # ── Decide if it needs cleaning ───────────────────────────────────────
    # Only signals the cleaner can actually act on. Anything listed here must
    # have a corresponding fix in cleaner.clean_dataset(), otherwise cleaning
    # never converges and the user is re-prompted after uploading a clean file.
    overall_missing = float(df.isnull().mean().mean())
    has_missing_values = bool(df.isnull().any().any())

    needs_cleaning = (
        has_missing_values or
        dup_rows > 0 or
        empty_rows > 0 or
        len(constant_columns) > 0 or
        len(mixed_type_columns) > 0 or
        len(outlier_columns) > 0
    )

    is_usable = len(errors) == 0

    return DataQualityResult(
        warnings=warnings,
        errors=errors,
        isUsable=is_usable,
        needsCleaning=needs_cleaning,
        missingRatio=round(overall_missing, 4),
        outlierColumns=outlier_columns,
        constantColumns=constant_columns,
        mixedTypeColumns=mixed_type_columns,
        duplicateRows=dup_rows,
        emptyRows=empty_rows,
    )
