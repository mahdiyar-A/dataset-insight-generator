"""
Column profiling — what a column *is*, decided before anything is done to it.

Two facts about a column drive most of the damage a generic cleaner can do, and
both are computable locally with no model call:

  1. Is it an identifier?  Imputing the median into a customer_id invents a
     customer who does not exist, and nothing downstream can tell that it is
     fake. Identifiers must never be imputed and never be capped.

  2. Is it skewed?  The textbook IQR fence assumes a roughly symmetric
     distribution. Revenue, order counts and durations are log-normal, so a
     plain fence declares the entire upper tail to be errors — the exact rows an
     analysis is usually about. The published correction is the adjusted
     boxplot of Hubert & Vandervieren (2008), which scales each fence by the
     medcouple, a robust measure of skewness.

Both the cleaner and the quality checker import from here, deliberately: the
invariant check(clean(df)).needsCleaning == False only holds while the two
agree on which columns are identifiers and where the fences sit.
"""

from __future__ import annotations

import re
from typing import Tuple

import numpy as np
import pandas as pd

# Columns whose name alone is strong evidence of an identifier.
_ID_NAME = re.compile(
    r"(^|[_\s-])(id|ids|uuid|guid|key|code|ref|sku|isbn|ean|"
    r"no|num|number|account|acct|invoice|order_no|serial|barcode)($|[_\s-])",
    re.IGNORECASE,
)

# A column has to be this close to fully unique before it can be an identifier.
_UNIQUE_RATIO = 0.98

# Medcouple is O(n^2). Above this many values it is computed on a deterministic
# evenly-spaced subsample of the sorted data — never a random one, because the
# checker recomputes these fences after the cleaner used them and a different
# sample would move the fence and re-flag values cleaning just fixed.
_MC_MAX_N = 2000


def is_identifier(series: pd.Series, name: str = "") -> bool:
    """
    True when a column identifies a row rather than measuring it.

    Near-uniqueness is necessary but nowhere near sufficient — a float revenue
    column is often 100% unique too. So uniqueness must be corroborated by
    either the column's name or its structure (integer-like, or strings of one
    consistent shape). Continuous measurements satisfy neither.
    """
    non_null = series.dropna()
    if len(non_null) < 10:
        return False

    if non_null.nunique() / len(non_null) < _UNIQUE_RATIO:
        return False

    if _ID_NAME.search(str(name)):
        return True

    # Integer-valued and either monotonic or a dense run of values: a row number
    # or a sequential key. Floats are excluded — a measurement that happens to be
    # unique is not an identifier.
    if pd.api.types.is_integer_dtype(non_null) or (
        pd.api.types.is_float_dtype(non_null) and np.all(np.equal(np.mod(non_null.to_numpy(), 1), 0))
    ):
        values = non_null.to_numpy(dtype="float64")
        if np.all(np.diff(np.sort(values)) > 0):
            spread = values.max() - values.min()
            # Dense: the values nearly enumerate their own range, as keys do and
            # as measurements do not.
            if spread > 0 and len(values) / (spread + 1) > 0.9:
                return True

    # Strings sharing one exact shape — "CUS000481", "A-1002" and so on.
    # Both dtypes are checked: pandas 3 gives string columns a dedicated `str`
    # dtype, so an object-only test silently stops recognising text keys.
    if pd.api.types.is_object_dtype(non_null) or pd.api.types.is_string_dtype(non_null):
        # A timestamp column is unique and uniformly shaped, so it satisfies
        # every structural test below — but it measures when something happened
        # rather than naming it. Observed misclassifying order_date on a real
        # run.
        if _looks_like_dates(non_null):
            return False
        shapes = non_null.astype(str).str.replace(r"\d", "0", regex=True).str.replace(
            r"[A-Za-z]", "A", regex=True
        )
        if shapes.nunique() == 1 and shapes.iloc[0] != "":
            return True

    return False


def medcouple(values: np.ndarray) -> float:
    """
    Robust skewness in [-1, 1] (Brys, Hubert & Struyf, 2004).

    0 for a symmetric distribution, positive for a right tail. Computed by the
    naive definition over a deterministic subsample; the fast O(n log n)
    algorithm is not worth the complexity at the sizes this pipeline sees.
    """
    x = np.sort(np.asarray(values, dtype="float64"))
    x = x[np.isfinite(x)]
    n = x.size
    if n < 3:
        return 0.0

    if n > _MC_MAX_N:
        # Evenly spaced over the sorted values: deterministic, and preserves the
        # shape of the distribution far better than taking a contiguous slice.
        idx = np.linspace(0, n - 1, _MC_MAX_N).astype(int)
        x = x[idx]
        n = x.size

    med = float(np.median(x))
    left = x[x <= med]
    right = x[x >= med]
    if left.size == 0 or right.size == 0:
        return 0.0

    xi = left[:, None]      # <= median
    xj = right[None, :]     # >= median
    denom = xj - xi

    with np.errstate(divide="ignore", invalid="ignore"):
        h = ((xj - med) - (med - xi)) / denom

    # Ties at the median: the kernel above is 0/0 there. The definition replaces
    # it with a sign based on the relative position of the two indices.
    tied = denom == 0
    if tied.any():
        li = np.arange(left.size)[:, None]
        rj = np.arange(right.size)[None, :]
        k = left.size - 1 - li  # index of xi counting back from the median
        signs = np.sign(k - rj).astype("float64")
        h = np.where(tied, signs, h)

    h = h[np.isfinite(h)]
    if h.size == 0:
        return 0.0
    return float(np.clip(np.median(h), -1.0, 1.0))


def adjusted_fences(series: pd.Series, k: float = 3.0) -> Tuple[float, float]:
    """
    Outlier fences corrected for skewness (Hubert & Vandervieren, 2008).

        MC >= 0:  [Q1 - k*exp(-4*MC)*IQR,  Q3 + k*exp( 3*MC)*IQR]
        MC <  0:  [Q1 - k*exp(-3*MC)*IQR,  Q3 + k*exp( 4*MC)*IQR]

    At MC = 0 this reduces exactly to the plain Q1 - k*IQR / Q3 + k*IQR rule, so
    symmetric columns are treated precisely as before. A right-skewed column
    gets a wider upper fence, which is what stops a log-normal revenue tail
    being winsorised into nonsense.

    k defaults to 3 — the "extreme outlier" distance this pipeline has always
    used — rather than the 1.5 of the original paper.

    Returns (-inf, inf) when the column has no spread to measure.
    """
    clean = series.dropna()
    clean = clean[np.isfinite(clean.to_numpy(dtype="float64", na_value=np.nan))]
    if len(clean) < 10:
        return (-np.inf, np.inf)

    q1 = float(clean.quantile(0.25))
    q3 = float(clean.quantile(0.75))
    iqr = q3 - q1
    if iqr <= 0:
        return (-np.inf, np.inf)

    mc = medcouple(clean.to_numpy(dtype="float64"))
    if mc >= 0:
        lower = q1 - k * float(np.exp(-4.0 * mc)) * iqr
        upper = q3 + k * float(np.exp(3.0 * mc)) * iqr
    else:
        lower = q1 - k * float(np.exp(-3.0 * mc)) * iqr
        upper = q3 + k * float(np.exp(4.0 * mc)) * iqr

    return (lower, upper)


def fence_tolerance(lower: float, upper: float) -> float:
    """
    Relative slack for comparing a value against a fence.

    The cleaner clips values to exactly the fence, so they land on it. Any later
    recomputation — after a CSV round-trip, or simply because clipping changed
    the quartiles — moves the fence by a few ULPs, and a strict comparison
    re-flags values that cleaning just fixed. An outlier test that flips on
    floating-point noise is not measuring anything real.
    """
    scale = max(abs(lower) if np.isfinite(lower) else 0.0,
                abs(upper) if np.isfinite(upper) else 0.0,
                1.0)
    return 1e-9 * scale


def identifier_columns(df: pd.DataFrame) -> list:
    """Names of every column in `df` that identifies rather than measures."""
    return [c for c in df.columns if is_identifier(df[c], str(c))]

def _looks_like_dates(series: pd.Series) -> bool:
    """True when most values parse as timestamps."""
    sample = series.astype(str).head(200)
    try:
        parsed = pd.to_datetime(sample, errors="coerce", format="mixed")
    except (ValueError, TypeError):
        try:
            parsed = pd.to_datetime(sample, errors="coerce")
        except Exception:
            return False
    return bool(parsed.notna().mean() > 0.8)


# A reference key points at another entity. Unlike a row identifier it repeats,
# so the uniqueness test above never catches one — but imputing it is just as
# damaging, and quieter: filling a missing customer_id with the most common
# value hands those rows to a real customer who did not place them. Observed on
# a real run: 8 orders silently reassigned to CUS00102.
_REF_CARDINALITY_FLOOR = 0.05


def is_reference_key(series: pd.Series, name: str = "") -> bool:
    """
    True for a column that names another entity — customer_id, account_no.

    Distinguished from a small category that happens to match the naming
    pattern (region_code, status_code) by cardinality: a key takes many
    distinct values, a category takes few. Without that test every coded
    category would be exempted from cleaning.
    """
    if not _ID_NAME.search(str(name)):
        return False

    non_null = series.dropna()
    if len(non_null) < 10:
        return False
    if _looks_like_dates(non_null):
        return False

    ratio = non_null.nunique() / len(non_null)
    return ratio >= _REF_CARDINALITY_FLOOR


def protected_columns(df: pd.DataFrame) -> list:
    """
    Columns that must never be imputed or capped: row identifiers and the
    reference keys that point at other entities. A statistic is not a
    legitimate substitute for either.
    """
    return [
        c for c in df.columns
        if is_identifier(df[c], str(c)) or is_reference_key(df[c], str(c))
    ]

