"""
Which columns are calculated from other columns?

A file often carries its own arithmetic: revenue = units × unit_price, profit =
revenue − cost, margin = 100 × profit ÷ revenue. Such a column moves with its
parts because it is built from them. "Revenue rises with units sold" is then a
sentence about multiplication, and a model of revenue given units and price
fits perfectly and explains nothing.

Trying y + z, y × z and y × z ÷ 100 for every pair of columns covers the other
forms too: x = y − z is y = x + z, and x = y ÷ z is y = x × z.

What keeps this from claiming a formula that is not there:

  * A row is evidence only if neither part alone gives the target. A zero, or
    a quantity of 1, satisfies an equation without showing anything, and files
    are full of both.
  * The allowance for rounding comes from how each column is actually written.
    A total kept to cents may be off by half a cent and no more. A fixed
    percentage would be too loose for large values and too tight for small ones.
  * That allowance must be small beside the target's own spread, or nearly any
    pair of columns could pass.

Rows the formula does not hold on are counted, not dropped: a total that does
not add up is worth knowing about.
"""

from __future__ import annotations

import re
from itertools import combinations
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import numpy as np
import pandas as pd

MAX_COLUMNS = 40
MAX_DECIMALS = 6
SCREEN_ROWS = 300
SCREEN_CLOSENESS = 0.02   # first pass: within 2% of the value...
SCREEN_SHARE = 0.6        # ...on this share of the rows
MAX_CANDIDATES = 200
MIN_ROWS = 30             # rows that can show the arithmetic at work
MIN_SHARE = 0.95          # of those, the share it must hold on
MAX_SLACK = 0.1           # rounding allowance, as a share of the target's spread
MAX_RESULTS = 6

# Which of the three is the calculated one cannot be read from the numbers:
# revenue = units × price and price = revenue ÷ units are one equation. It
# matters, because the two parts are free to vary and their correlation is a
# real finding (higher prices, fewer units). These words mark a calculated
# column, and failing that the rightmost column is taken, as files tend to put
# a calculation after what it is made from. Words like rate and pct are left
# out on purpose: hourly_rate and discount_pct are inputs as often as not.
CALCULATED_WORDS = {
    "total", "sum", "amount", "revenue", "sales", "profit", "margin", "net", "gross",
    "ratio", "avg", "average", "ctr",
}


def _decimals(values: np.ndarray) -> Optional[int]:
    """Decimal places a column is written to, None when it is not rounded."""
    v = values[np.isfinite(values)][:5000]
    if not len(v):
        return None
    for places in range(MAX_DECIMALS + 1):
        if np.mean(np.abs(v - np.round(v, places)) <= 1e-9 * np.maximum(np.abs(v), 1.0)) >= 0.99:
            return places
    return None


def _half_unit(places: Optional[int]) -> float:
    """
    How far rounding can have moved a part. Whole numbers are taken as exact:
    they are usually counts, and allowing 0.5 on each would be far too generous
    when the numbers are small.
    """
    return 0.5 * 10.0 ** -places if places else 0.0


def _check(
    x: np.ndarray, y: np.ndarray, z: np.ndarray, form: str, places: Tuple[Optional[int], ...],
) -> Optional[Tuple[int, int]]:
    """(rows that show the arithmetic, how many of them break it) for x = y form z."""
    present = np.isfinite(x) & np.isfinite(y) & np.isfinite(z)
    x, y, z = x[present], y[present], z[present]

    half_y, half_z = _half_unit(places[1]), _half_unit(places[2])
    half_x = _half_unit(places[0])
    if places[0] == 0 and (places[1] != 0 or places[2] != 0):
        half_x = 0.5    # a whole-number result of parts that are not whole
    if form == "sum":
        result = y + z
        slack = half_x + half_y + half_z + np.zeros(len(x))
    else:
        scale = 0.01 if form == "percent" else 1.0
        result = y * z * scale
        slack = half_x + scale * (np.abs(z) * half_y + np.abs(y) * half_z + half_y * half_z)
    slack = slack + 1e-9 * np.maximum(np.abs(x), 1.0)

    telling = (np.abs(x - y) > slack) & (np.abs(x - z) > slack)
    rows = int(telling.sum())
    if rows < MIN_ROWS or np.median(slack[telling]) > MAX_SLACK * x[telling].std():
        return None
    broken = int((np.abs(x - result) > slack)[telling].sum())
    return (rows, broken) if rows - broken >= MIN_SHARE * rows else None


def _screen(values: np.ndarray) -> List[Tuple[int, int, int, str]]:
    """
    Cheap first pass on a few hundred rows: (x, y, z, form) that come close.

    Every target is compared at once for each pair, so 40 columns stay well
    under a second, and only what survives is checked on every row.
    """
    columns = values.shape[1]
    scale = np.abs(values) * SCREEN_CLOSENESS + 1e-9
    needed = SCREEN_SHARE * len(values)
    found: List[Tuple[int, int, int, str]] = []
    with np.errstate(all="ignore"):
        for j, k in combinations(range(columns), 2):
            y, z = values[:, j], values[:, k]
            for form, result in (("sum", y + z), ("product", y * z), ("percent", y * z / 100)):
                close = (np.abs(values - result[:, None]) <= scale).sum(axis=0)
                close[[j, k]] = 0
                found.extend((int(i), j, k, form) for i in np.flatnonzero(close >= needed))
    return found[:MAX_CANDIDATES]


def _calculated(columns: Sequence[str]) -> str:
    """Of three columns in file order, the one to present as calculated."""
    def named(column: str) -> bool:
        return bool(CALCULATED_WORDS & {w.lower() for w in re.findall(r"[A-Z]?[a-z]+|[A-Z]+", str(column))})

    return ([c for c in columns if named(c)] or list(columns))[-1]


def _formula(target: str, x: str, y: str, z: str, form: str) -> str:
    """x = y form z, rearranged to give `target`."""
    other = z if target == y else y
    if form == "sum":
        return f"{y} + {z}" if target == x else f"{x} − {other}"
    if form == "product":
        return f"{y} × {z}" if target == x else f"{x} ÷ {other}"
    return f"{y} × {z} ÷ 100" if target == x else f"100 × {x} ÷ {other}"


def find_derived_columns(df: pd.DataFrame, measures: Sequence[str]) -> List[Dict[str, Any]]:
    """Columns that are arithmetic on two others, in file order."""
    if len(measures) < 3:
        return []
    columns = sorted(measures, key=lambda c: df[c].notna().mean(), reverse=True)[:MAX_COLUMNS]
    columns = [c for c in df.columns if c in set(columns)]
    numbers = df[columns].astype("float64").to_numpy()
    rows = np.random.default_rng(0).permutation(len(numbers))[:SCREEN_ROWS]
    places = [_decimals(numbers[:, i]) for i in range(len(columns))]

    results: Dict[frozenset, Dict[str, Any]] = {}
    with np.errstate(all="ignore"):
        for i, j, k, form in _screen(numbers[rows]):
            trio = frozenset((i, j, k))
            if trio in results:
                continue
            checked = _check(numbers[:, i], numbers[:, j], numbers[:, k], form, (places[i], places[j], places[k]))
            if checked is None:
                continue
            x, y, z = columns[i], columns[j], columns[k]
            target = _calculated([columns[c] for c in sorted(trio)])
            results[trio] = {
                "column": str(target),
                "formula": _formula(target, x, y, z, form),
                "parts": [str(c) for c in (x, y, z) if c != target],
                "rows": checked[0],
                "mismatchedRows": checked[1],
            }
    order = {str(c): i for i, c in enumerate(columns)}
    return sorted(results.values(), key=lambda r: order[r["column"]])[:MAX_RESULTS]


def arithmetic_pairs(derived: Optional[Sequence[Dict[str, Any]]]) -> Set[frozenset]:
    """
    Column pairs linked by calculation: each calculated column and its parts.
    The two parts are not paired: nothing makes them move together.
    """
    return {frozenset((d["column"], part)) for d in derived or [] for part in d["parts"]}


def tied_to(target: str, derived: Optional[Sequence[Dict[str, Any]]]) -> Set[str]:
    """Columns that would predict `target` by arithmetic rather than by anything learned."""
    tied: Set[str] = set()
    for d in derived or []:
        if d["column"] == target:
            tied.update(d["parts"])
        elif target in d["parts"]:
            tied.add(d["column"])
    return tied
