"""
Regression tests for the data-cleaning loop.

Bug this guards against
-----------------------
A user uploads a messy CSV. The chatbot asks "shall I clean this?" because
check_data_quality().needsCleaning is True. The user says yes, the pipeline
cleans the file, and the user downloads the cleaned CSV. When they re-upload
that cleaned CSV, the checker flagged it as dirty *again* and the chatbot asked
the same question — an infinite loop.

Root cause was twofold:
  1. AnalysisService never forwarded user_wants_cleaning to Python, so cleaning
     never ran at all for authenticated users (covered by the C# test suite).
  2. check_data_quality() set needsCleaning from `len(warnings) > 0`, but
     clean_dataset() did not fix every warning it could emit — outliers and
     constant columns survived cleaning, so the second check failed again.

The invariant these tests protect:

    check_data_quality(clean_dataset(df)).needsCleaning == False

If you add a new signal to needsCleaning, you must add a matching fix to
clean_dataset() or these tests will fail.
"""

import numpy as np
import pandas as pd
import pytest

from ai_engine.core.cleaner import clean_dataset
from ai_engine.quality.quality_checker import check_data_quality


# ── Fixtures ─────────────────────────────────────────────────────────────────

def _messy_frame() -> pd.DataFrame:
    """A frame exercising every issue the checker knows how to flag."""
    rng = np.random.default_rng(42)
    n = 120

    df = pd.DataFrame({
        # Normal numeric column with missing values
        "revenue": rng.normal(1000, 100, n),
        # Numeric column with extreme outliers
        "units": rng.normal(50, 5, n),
        # Object column that is mostly numeric (mixed type)
        "score": [str(round(v, 2)) for v in rng.normal(75, 8, n)],
        # Categorical with missing values
        "region": rng.choice(["north", "south", "east", "west"], n),
        # Constant column — zero variance
        "currency": ["CAD"] * n,
        # Genuinely useful categorical
        "segment": rng.choice(["smb", "mid", "ent"], n),
    })

    # Inject missing values
    df.loc[rng.choice(n, 12, replace=False), "revenue"] = np.nan
    df.loc[rng.choice(n, 8, replace=False), "region"] = np.nan

    # Inject extreme outliers well beyond 3x IQR
    df.loc[[0, 1, 2, 3, 4], "units"] = 5000.0

    # Inject non-numeric entries into the mostly-numeric text column
    df.loc[[10, 11], "score"] = "suppressed"

    # Inject exact duplicate rows
    df = pd.concat([df, df.iloc[[20, 21, 22]]], ignore_index=True)

    # Inject a fully empty row
    df.loc[len(df)] = [np.nan] * len(df.columns)

    return df


# ── The core invariant ───────────────────────────────────────────────────────

def test_cleaning_converges_in_one_pass():
    """clean(df) must satisfy the checker. This is the loop-breaking guarantee."""
    df = _messy_frame()

    before = check_data_quality(df)
    assert before.needsCleaning, "fixture should be dirty enough to trigger cleaning"

    cleaned = clean_dataset(df, before)
    after = check_data_quality(cleaned)

    assert not after.needsCleaning, (
        "cleaned data still reports needsCleaning — the user would be asked to "
        f"clean again. Remaining warnings: {after.warnings}"
    )


def test_cleaning_is_idempotent():
    """Cleaning an already-clean frame must not change it or re-flag it."""
    df = _messy_frame()
    once = clean_dataset(df, check_data_quality(df))
    twice = clean_dataset(once, check_data_quality(once))

    assert not check_data_quality(twice).needsCleaning
    assert len(once) == len(twice), "second clean pass dropped more rows"
    assert list(once.columns) == list(twice.columns), "second pass dropped more columns"


def test_reupload_of_cleaned_file_is_not_flagged():
    """
    Simulates the exact user journey that produced the bug: clean, serialise to
    CSV, re-read it as a fresh upload, and check it again.

    Round-tripping through CSV matters — dtypes are re-inferred on read, which is
    where a purely in-memory test would miss a regression.
    """
    import io

    df = _messy_frame()
    cleaned = clean_dataset(df, check_data_quality(df))

    buf = io.StringIO()
    cleaned.to_csv(buf, index=False)
    reuploaded = pd.read_csv(io.StringIO(buf.getvalue()))

    result = check_data_quality(reuploaded)
    assert not result.needsCleaning, (
        "re-uploading the cleaned CSV re-triggers the cleaning prompt. "
        f"Warnings: {result.warnings}"
    )


# ── Individual signals ───────────────────────────────────────────────────────

def test_missing_values_are_removed():
    df = _messy_frame()
    cleaned = clean_dataset(df, check_data_quality(df))
    assert not cleaned.isnull().any().any(), "missing values survived cleaning"


def test_duplicate_rows_are_removed():
    df = _messy_frame()
    cleaned = clean_dataset(df, check_data_quality(df))
    assert cleaned.duplicated().sum() == 0, "duplicate rows survived cleaning"


def test_constant_columns_are_dropped():
    df = _messy_frame()
    cleaned = clean_dataset(df, check_data_quality(df))
    assert "currency" not in cleaned.columns, "zero-variance column survived cleaning"


def test_mixed_type_column_becomes_numeric():
    df = _messy_frame()
    cleaned = clean_dataset(df, check_data_quality(df))
    assert pd.api.types.is_numeric_dtype(cleaned["score"]), (
        "mostly-numeric text column was not coerced to numeric"
    )


def test_extreme_outliers_are_capped():
    df = _messy_frame()
    cleaned = clean_dataset(df, check_data_quality(df))
    assert cleaned["units"].max() < 5000.0, "extreme outliers survived cleaning"


def test_checker_reports_actionable_signals():
    """needsCleaning must be backed by a concrete, fixable signal."""
    df = _messy_frame()
    q = check_data_quality(df)

    assert q.duplicateRows > 0
    assert q.emptyRows > 0
    assert "currency" in q.constantColumns
    assert "score" in q.mixedTypeColumns
    assert "units" in q.outlierColumns


# ── Guard rails ──────────────────────────────────────────────────────────────

def test_clean_frame_is_not_flagged():
    """A genuinely clean dataset must never trigger the cleaning prompt."""
    rng = np.random.default_rng(7)
    df = pd.DataFrame({
        "a": rng.normal(0, 1, 200),
        "b": rng.normal(5, 2, 200),
        "c": rng.choice(["x", "y", "z"], 200),
    })
    assert not check_data_quality(df).needsCleaning


def test_cleaning_never_drops_below_two_columns():
    """
    The checker treats <2 columns as a fatal error. Constant-column dropping must
    not push a narrow dataset into an unusable state.
    """
    df = pd.DataFrame({
        "only_real": list(range(50)),
        "const_a": ["same"] * 50,
        "const_b": [1] * 50,
    })
    cleaned = clean_dataset(df, check_data_quality(df))
    assert len(cleaned.columns) >= 2, "cleaning made the dataset unusable"


@pytest.mark.parametrize("seed", range(25))
def test_convergence_holds_across_random_datasets(seed):
    """
    Fuzz the invariant. A single hand-built fixture can pass by luck — the
    original bug only showed up at a specific outlier/quartile ratio. Twenty-five
    different shapes and distributions make an accidental pass unlikely.
    """
    import io

    rng = np.random.default_rng(seed)
    n = int(rng.integers(40, 300))
    n_num = int(rng.integers(2, 5))

    data = {f"num_{i}": rng.normal(rng.integers(-100, 100), rng.integers(1, 50), n)
            for i in range(n_num)}
    data["cat"] = rng.choice(list("abcde"), n)
    df = pd.DataFrame(data)

    # Random missing values
    for col in list(data)[:n_num]:
        idx = rng.choice(n, size=int(n * rng.uniform(0, 0.2)), replace=False)
        df.loc[idx, col] = np.nan

    # Random extreme outliers
    if rng.random() < 0.8:
        col = f"num_{rng.integers(0, n_num)}"
        idx = rng.choice(n, size=max(1, int(n * 0.04)), replace=False)
        df.loc[idx, col] = df[col].mean() + rng.choice([-1, 1]) * 1e4

    # Random duplicate rows
    if rng.random() < 0.6:
        df = pd.concat([df, df.sample(5, random_state=seed)], ignore_index=True)

    quality = check_data_quality(df)
    if not quality.isUsable:
        pytest.skip("randomly generated frame is not usable")

    cleaned = clean_dataset(df, quality)

    buf = io.StringIO()
    cleaned.to_csv(buf, index=False)
    reuploaded = pd.read_csv(io.StringIO(buf.getvalue()))

    result = check_data_quality(reuploaded)
    assert not result.needsCleaning, (
        f"seed={seed} did not converge. Warnings: {result.warnings}"
    )


def test_cleaning_does_not_mutate_the_original():
    df = _messy_frame()
    snapshot = df.copy()
    clean_dataset(df, check_data_quality(df))
    pd.testing.assert_frame_equal(df, snapshot)
