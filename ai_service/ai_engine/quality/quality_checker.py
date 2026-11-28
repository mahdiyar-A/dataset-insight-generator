import re

import numpy as np
import pandas as pd
from ai_engine.core.profiler import adjusted_fences, fence_tolerance, is_identifier, is_reference_key
from ai_engine.core.stat_tests import text_columns
from ai_engine.models.models import DataQualityResult


# Words in a column name that say a value cannot go below zero.
_NEVER_NEGATIVE = {
    "units", "qty", "quantity", "quantities", "count", "counts", "headcount", "age", "price", "prices",
    "salary", "salaries", "wage", "wages", "weight", "height", "distance", "duration", "visits",
    "clicks", "orders", "employees", "students",
}
_PERCENT = {"percent", "percentage", "pct"}
# Words that mean the column measures a change, where any sign is fine.
_CAN_GO_EITHER_WAY = {
    "change", "delta", "diff", "difference", "growth", "net", "adjustment", "adj", "variance",
    "return", "returns", "refund", "refunds", "balance", "loss", "profit", "margin", "yoy", "mom",
}
_AGE_IN_SMALLER_UNITS = {"days", "weeks", "months", "hours", "minutes"}

# Past this share the name does not mean what it seems to, or it is a convention
# in this file. A few odd rows are a data problem; a fifth of them is not.
_MAX_ODD_SHARE = 0.2


# Small words that make up much of any sentence and almost none of a table:
# English, French and Persian, the languages DIG writes in.
_FUNCTION_WORDS = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "from", "by",
    "is", "are", "was", "were", "be", "been", "am", "have", "has", "had", "do", "did", "will", "would",
    "can", "could", "should", "i", "you", "he", "she", "it", "we", "they", "me", "my", "your", "our",
    "their", "his", "her", "this", "that", "these", "those", "so", "not", "no", "as", "if", "then",
    "there", "here", "what", "which", "who", "when", "all", "very", "just", "about", "up", "out",
    "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "je", "tu", "il", "elle", "nous",
    "vous", "ils", "est", "sont", "pour", "que", "qui", "dans", "sur", "avec", "pas", "ne", "ce", "mon",
    "\u0648", "\u062f\u0631", "\u0628\u0647", "\u0627\u0632", "\u06a9\u0647", "\u0627\u06cc\u0646",
    "\u0631\u0627", "\u0628\u0627", "\u0627\u0633\u062a", "\u0645\u0646", "\u0645\u0627",
    "\u0634\u0645\u0627", "\u0622\u0646", "\u06cc\u06a9",
}
NOT_A_TABLE = ("This file reads like a letter or a document, not a table of data. "
               "Upload a spreadsheet or CSV where each row is one record and each column one field.")


def looks_like_prose(df: pd.DataFrame) -> bool:
    """
    Whether a "table" is really running text, such as a letter saved as .csv.

    Any reader will cut sentences into columns at the commas or spaces, so
    the shape alone says nothing. Three things together do: no column holds
    numbers or dates, a large share of the words are the small words every
    sentence is built from (the, and, you, de, \u0648), and no column repeats
    its values the way a category does. A table of names and cities fails
    the second test; a list of reviews beside a product column fails the
    third. Both are tables and stay accepted.
    """
    if df.empty or len(df.columns) == 0:
        return False
    for col in df.columns:
        series = df[col]
        if pd.api.types.is_numeric_dtype(series) or pd.api.types.is_datetime64_any_dtype(series):
            return False
        sample = series.dropna().astype(str).head(200)
        if len(sample) and pd.to_numeric(sample, errors="coerce").notnull().mean() >= 0.5:
            return False
    cells = [str(c) for c in df.columns]
    for col in df.columns:
        cells.extend(df[col].dropna().astype(str).head(400).tolist())
    words = [w for cell in cells for w in re.findall(r"[^\W\d_]+", cell.lower())]
    if len(words) < 12:
        return False
    if sum(w in _FUNCTION_WORDS for w in words) / len(words) < 0.2:
        return False
    if len(df) >= 20:
        for col in df.columns:
            filled = df[col].dropna()
            distinct = filled.nunique()
            if len(filled) and distinct >= 2 and distinct / len(filled) < 0.5:
                return False
    return True


def _name_words(name) -> set:
    spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", str(name))
    return set(re.findall(r"[a-z]+", spaced.lower()))


def impossible_values(df: pd.DataFrame) -> list:
    """
    Numbers a column's own name rules out, such as -1 units or an age of 300.

    Reported, never changed. Minus one unit is often a return, and only the
    person who knows the file can tell a return from a typing mistake.
    """
    found = []
    for col in df.select_dtypes(include=[np.number]).columns:
        series = df[col].dropna()
        words = _name_words(col)
        if series.empty or words & _CAN_GO_EITHER_WAY:
            continue
        if is_identifier(df[col], str(col)) or is_reference_key(df[col], str(col)):
            continue

        if words & _PERCENT or "%" in str(col):
            odd, what = (series < 0) | (series > 100), "outside 0 to 100 for a percentage"
        elif "age" in words and not words & _AGE_IN_SMALLER_UNITS:
            odd, what = (series < 0) | (series > 120), "outside 0 to 120 for an age"
        elif words & _NEVER_NEGATIVE:
            odd, what = series < 0, "below zero. Check whether they are returns or entry errors"
        else:
            continue

        count = int(odd.sum())
        if 0 < count <= _MAX_ODD_SHARE * len(series):
            found.append(f"Column '{col}' has {count:,} value{'s' if count != 1 else ''} {what}.")
    return found


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
    elif looks_like_prose(df):
        errors.append(NOT_A_TABLE)

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
    for col in text_columns(df):
        if pd.api.types.is_bool_dtype(df[col]):
            continue
        # Parsing every value of a 500,000-row text column takes a quarter of
        # a second; a sample settles names and categories first. The probe's
        # bar (0.3) sits well below the decision's (0.5) so a column the full
        # test would flag is never skipped by sampling noise.
        probe = df[col].dropna().head(500)
        if len(probe) and pd.to_numeric(probe, errors="coerce").notnull().mean() < 0.3:
            continue
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
        # Keys of either kind are exempt: no magnitude makes an account
        # number an anomaly, and the cleaner will not touch one either.
        if is_identifier(df[col], str(col)) or is_reference_key(df[col], str(col)):
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

    # First in the list: the report's writer is only given the first few, and
    # a value that cannot be true matters more than a column with a few gaps.
    # Not part of needsCleaning, because the cleaner leaves these alone.
    warnings = impossible_values(df) + warnings

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
