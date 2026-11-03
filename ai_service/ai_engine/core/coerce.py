"""
Turning numbers stored as text back into numbers.

Spreadsheets exported to CSV routinely write money as "$1,234.50", shares as
"45%" and losses as "(120)". pandas reads every one of those columns as text,
and the engine then treats revenue as a category with 9,000 distinct labels:
no mean, no correlation, no trend. The finding the file exists for is simply
not computed, and nothing says so.

This is parsing, not cleaning. The values are the same numbers written a
different way, so it runs for every upload — cleaned or not — and the user's
"analyse as provided" choice still holds.

It is deliberately conservative, because a wrong conversion is worse than none:

  * A column converts only when almost every value parses (PARSE_SHARE).
    A column of product codes where a few happen to look numeric stays text.
  * Leading zeros mean an identifier — postcodes, account numbers, phone
    numbers. "02134" is not the number 2134, so those columns are left alone.
  * The decimal separator is decided once per column, from values that are
    unambiguous ("1,234.5" or "1.234,5"), never guessed value by value.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from ai_engine.core.stat_tests import text_columns

# Share of non-missing values that must parse for a column to convert.
PARSE_SHARE = 0.95

# Spellings of "no value" that spreadsheets and exports use, matched
# case-insensitively after trimming. These are masked in every text column.
# "-" is included because accounting exports write a dash for nothing; it is
# treated as missing, never as zero, since the two mean different things.
NA_TOKENS = {
    "", "na", "n/a", "n.a.", "nan", "null", "#n/a", "#na", "-", "--", "—", "–",
    "?", "#value!", "#div/0!", "#ref!", "#null!", "#num!", "#name?",
}

# Words that mean "no value" only inside a column of numbers. In a text column
# "Unknown" or "None" is often a real category (no discount, gender not
# given), so these are treated as missing only when the rest of the column
# turns out to be numeric.
NUMERIC_NA_TOKENS = NA_TOKENS | {"none", "nil", "missing", "unknown", "not available", "n.d.", "nd"}

_CURRENCY = "$€£¥₹₩₽₺₪฿₫₴₦₱₲₵₡"
# Plain strings, not compiled patterns: pandas hands a string pattern to the
# pyarrow regex engine, but a compiled one falls back to a Python call per
# value, which was most of the time spent on a large file.
_CODES = "usd|cad|eur|gbp|aud|nzd|jpy|inr|chf|cny|sek|nok|dkk|mxn|brl|zar"
_CURRENCY_CODES = rf"(?i)^({_CODES})\s*|\s*({_CODES})$"
# Grouping separators besides comma and dot: space, no-break space, narrow
# no-break space, thin space, apostrophe (Swiss).
_GROUP_SPACES = r"[\s   ']"

_US = re.compile(r"^-?\d{1,3}(,\d{3})+(\.\d+)?$")       # 1,234,567.89
_EU = re.compile(r"^-?\d{1,3}(\.\d{3})+(,\d+)?$")       # 1.234.567,89
_EU_DECIMAL_ONLY = re.compile(r"^-?\d+,\d{1,2}$|^-?\d+,\d{4,}$")  # 12,5 / 0,12345
_PLAIN = re.compile(r"^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$")


def is_na_token(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() in NA_TOKENS


def _cores(text: pd.Series) -> Tuple[pd.Series, pd.Series, Dict[str, bool]]:
    """
    Strip currency, percent and sign wrappers from trimmed strings, vectorised.

    Returns (unsigned core, negative mask, flags). A Python loop over values
    took three seconds on 20,000 rows; these are pandas string operations.
    """
    s = text
    acc = s.str.startswith("(") & s.str.endswith(")")
    s = s.where(~acc, s.str.slice(1, -1).str.strip())
    neg = s.str.startswith("-") | s.str.startswith("−")
    s = s.where(~neg, s.str.slice(1).str.strip())
    s = s.str.lstrip("+")
    pct = s.str.endswith("%")
    s = s.where(~pct, s.str.slice(0, -1).str.strip())
    cur_re = f"^[{re.escape(_CURRENCY)}]|[{re.escape(_CURRENCY)}]$"
    cur = s.str.contains(cur_re, regex=True)
    s = s.str.strip(_CURRENCY).str.strip()
    coded = s.str.replace(_CURRENCY_CODES, "", regex=True).str.strip()
    cur = cur | (coded != s)
    s = coded
    # A sign can also sit after the currency symbol: "$-12".
    neg2 = s.str.startswith("-") | s.str.startswith("−")
    s = s.where(~neg2, s.str.slice(1).str.strip())
    s = s.str.replace(_GROUP_SPACES, "", regex=True)
    negative = (neg ^ neg2) | acc
    flags = {"currency": bool(cur.any()), "percent": bool(pct.any()), "accounting": bool(acc.any())}
    return s, negative, flags


def _parse(text: pd.Series) -> Optional[Tuple[pd.Series, Dict[str, Any]]]:
    """Parse trimmed, non-missing strings. Returns (floats aligned to text, note)."""
    core, negative, flags = _cores(text)
    zeros = core.str.match(r"^0\d")
    if zeros.sum() >= max(1, 0.1 * len(core)):
        return None  # codes with leading zeros: 02134 is not the number 2134
    us = int(core.str.match(_US.pattern).sum())
    eu = int((core.str.match(_EU.pattern) | core.str.match(_EU_DECIMAL_ONLY.pattern)).sum())
    style = "eu" if eu > us else "us"
    if style == "eu":
        plain = core.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    else:
        plain = core.str.replace(",", "", regex=False)
    valid = plain.str.match(_PLAIN.pattern).fillna(False).astype(bool)
    values = pd.to_numeric(plain.where(valid), errors="coerce").astype("float64")
    values = values.where(~negative.fillna(False).astype(bool), -values)
    ok = int(values.notna().sum())
    needed_parsing = (any(flags.values()) or style == "eu"
                      or bool(core.str.contains(",", regex=False).any())
                      or bool(text.str.contains(" ", regex=False).any()))
    note = {
        "kind": ("percent" if flags["percent"] else
                 "currency" if flags["currency"] else
                 "accounting" if flags["accounting"] else
                 "decimal_comma" if style == "eu" else
                 "thousands" if needed_parsing else "plain"),
        "parsedShare": round(ok / max(len(text), 1), 4),
        "decimalComma": style == "eu",
    }
    return values, note


def _leading_zero_codes(text: pd.Series) -> bool:
    zeros = text.str.match(r"^[-+]?0\d")
    return bool(zeros.sum() >= max(1, 0.1 * len(text)))


def _plain(text: pd.Series) -> Optional[pd.Series]:
    """
    Values that are already ordinary numbers ("12", "-3.5", "1e4"), or None.

    One pandas call instead of the twenty in _cores. Each pandas string
    operation costs about a millisecond however short the column, so a file
    with hundreds of numeric-looking columns took half a minute before this.
    """
    values = pd.to_numeric(text, errors="coerce").astype("float64")
    values = values.where(np.isfinite(values))  # "inf" is not a measurement
    if values.notna().sum() < PARSE_SHARE * len(text) or _leading_zero_codes(text):
        return None
    return values


def parse_numeric_column(series: pd.Series) -> Optional[Tuple[pd.Series, Dict[str, Any]]]:
    """
    Parse one text column as numbers, or return None to leave it as text.

    Returns (numeric series, note) where the note records what was stripped,
    so the report can say "amounts were written with currency symbols".
    """
    raw = series.dropna()
    if raw.empty:
        return None

    # Most text columns are names and categories. A probe of the first few
    # hundred values rejects them before the whole column is processed.
    head = raw.head(400).astype(str).str.strip()
    head = head[~head.str.lower().isin(NUMERIC_NA_TOKENS)]
    if head.empty:
        return None
    # A value without a digit cannot be a number, whatever it is wrapped in.
    if head.str.contains(r"\d", regex=True).mean() < PARSE_SHARE:
        return None
    plain_head = _plain(head)
    if plain_head is None:
        probe = _parse(head)
        if probe is None or probe[1]["parsedShare"] < PARSE_SHARE:
            return None

    text = raw.astype(str).str.strip()
    text = text[~text.str.lower().isin(NUMERIC_NA_TOKENS)]
    if text.empty:
        return None

    if plain_head is not None:
        values = _plain(text)
        if values is not None:
            out = pd.Series(np.nan, index=series.index, dtype="float64")
            out.loc[values.index] = values
            note = {"kind": "plain", "parsedShare": round(int(values.notna().sum()) / len(text), 4),
                    "decimalComma": False}
            return out, note

    parsed = _parse(text)
    if parsed is None:
        return None
    values, note = parsed
    if note["parsedShare"] < PARSE_SHARE:
        return None
    out = pd.Series(np.nan, index=series.index, dtype="float64")
    out.loc[values.index] = values
    return out, note


def coerce_types(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    """
    Convert text columns that hold numbers, and normalise missing-value tokens.

    Returns (frame, conversions). The input frame is not modified. Each entry
    in conversions is {"column", "kind", "parsedShare", "decimalComma"} for a
    column that changed type, so the change can be reported, not hidden.
    """
    out = df.copy()
    conversions: List[Dict[str, Any]] = []
    for col in text_columns(out):
        s = out[col]
        if pd.api.types.is_bool_dtype(s) or isinstance(s.dtype, pd.CategoricalDtype):
            continue
        # Normalise "N/A"-style tokens to real missing values first, so that
        # quality checks count them as missing rather than as a category.
        as_text = s.astype("string").str.strip().str.lower()
        mask = as_text.isin(NA_TOKENS).fillna(False).astype(bool) & s.notna()
        if mask.any():
            s = s.mask(mask.to_numpy())
            out[col] = s
        result = parse_numeric_column(s)
        if result is None:
            continue
        values, note = result
        if values.notna().sum() == 0:
            continue
        out[col] = values
        conversions.append({"column": str(col), **note})
    return out, conversions
