"""
Did a series change at a moment, rather than drift?

A trend test answers one question: is the series generally going up or down.
It gives the wrong impression of two shapes that are common in business data.

  step            the level moved at one moment, with or without a slope around
                  it. A trend test calls this a steady rise, when nothing rose
                  steadily and something happened in March.
  turning point   the direction changed. Up then down can pass as "no trend",
                  because the two halves cancel.

Two things imitate these and are ruled out here.

Smooth curves. Compound growth is fitted well by "flat, then rising", yet no
moment exists. A step or a bend therefore has to beat a smooth curve, not merely
a straight line. A reversal is the exception: a smooth rise and fall really did
rise and then fall, so it only has to beat a line, provided both legs are real.

Memory. This month resembles last month, so runs of high and low months appear
by themselves and look like regimes. The best fit is therefore judged against
series simulated with the same memory, and it must beat nearly all of them.

This says that the series changed and roughly when, never why. It is built to
stay quiet when unsure, so saying nothing does not mean nothing happened: a
gradual take-off cannot be told from compound growth, and a series with two
changes usually gets neither.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Sequence, Tuple

import numpy as np

MIN_PERIODS = 12
# The work grows with the square of the periods, and a chat question can ask for
# daily figures across years.
MAX_PERIODS = 120
SIMULATIONS = 299
MAX_P = 0.01
MAX_MEMORY = 0.95
# After the best shape, this month must not still predict next month this well.
# If it does, the series wanders or has a form the shape misses, however good the
# fit looks, and there is no single moment to name.
MAX_PATTERN = 0.5
# A jump against the slope, with the slope going on to take it back, is how a
# step-plus-slope imitates a wave. A real one, like a rising series losing a big
# customer, leaves clean leftovers, so that case is held to this.
CLEAN_PATTERN = 0.3
# Added to the memory reading, over the square root of the periods. Series that
# wander get flagged when their memory happens to read low, so the simulation
# assumes somewhat more than was seen.
MEMORY_MARGIN = 1.0
# The shorter leg of a reversal must move at least this share of the longer one.
# Below it the series went one way, with a wobble at the start.
MIN_LEG_SHARE = 0.25
EXACT_FIT = 1e-18
# A percentage needs a base. Beyond this multiple, as when a product launches
# from nothing, the level before is too small for one to mean anything.
MAX_RISE_MULTIPLE = 20


def _projector(*columns: np.ndarray) -> np.ndarray:
    """The matrix that removes whatever these columns can fit."""
    q, _ = np.linalg.qr(np.column_stack(columns))
    return np.eye(len(q)) - q @ q.T


def _unit(vectors: np.ndarray) -> np.ndarray:
    return vectors / np.linalg.norm(vectors, axis=-1, keepdims=True)


def _candidates(n: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Each shape as the single direction it adds to a straight line. All of them,
    the smooth curve included, have one more parameter than a line, so how much
    of the residual a direction explains can be compared directly.
    """
    edge = max(3, n // 8)
    t = np.linspace(-1.0, 1.0, n)
    index = np.arange(n)
    positions = np.arange(edge, n - edge + 1)
    line = _projector(np.ones(n), t)
    steps = (index[None, :] >= positions[:, None]).astype("float64")
    bends = np.maximum(index[None, :] - positions[:, None], 0).astype("float64")
    return line, _unit(line @ t ** 2), positions, _unit(steps @ line), _unit(bends @ line)


def _gain(residual: np.ndarray, shapes: np.ndarray, baseline: Optional[np.ndarray]) -> np.ndarray:
    """How many times less the best shape leaves than the baseline, per column."""
    total = (residual ** 2).sum(axis=0)
    base = total if baseline is None else total - (baseline @ residual) ** 2
    left = total - ((shapes @ residual) ** 2).max(axis=0)
    return base / np.maximum(left, EXACT_FIT * total)


def _pattern(leftover: np.ndarray) -> float:
    """
    How far what the best shape left over still predicts its own next value. A
    fit with three parameters takes about 3 / n off this reading.
    """
    total = float(leftover @ leftover)
    return float(leftover[:-1] @ leftover[1:]) / total + 3 / len(leftover) if total > 0 else 0.0


def _wander(y: np.ndarray, k: int) -> float:
    """
    Lag-one memory read from period-to-period changes, which barely feel a trend
    or a bend; leaving out the change across the break removes a step. A fitted
    shape soaks up slow wander, so this sees what its leftovers cannot. For noise
    with memory m, each change correlates with the next at (m - 1) / 2.
    """
    changes = np.diff(y)
    legs = [leg - leg.mean() for leg in (changes[:k - 1], changes[k:]) if len(leg) > 1]
    spread = sum(float(leg @ leg) for leg in legs)
    return 1 + 2 * sum(float(leg[:-1] @ leg[1:]) for leg in legs) / spread if spread > 0 else 0.0


def _simulate(
    residual: np.ndarray, line: np.ndarray, baseline: Optional[np.ndarray],
    memory: float, rng: np.random.Generator,
) -> np.ndarray:
    """
    Series with no break: the baseline plus noise with this memory, each scaled
    to leave exactly what the real series leaves. The test then compares like
    with like at any amount of memory.
    """
    shocks = rng.standard_normal((len(residual), SIMULATIONS))
    noise = np.empty_like(shocks)
    noise[0] = shocks[0]
    scale = np.sqrt(1 - memory ** 2)
    for i in range(1, len(shocks)):
        noise[i] = memory * noise[i - 1] + scale * shocks[i]
    noise = line @ noise
    fitted = np.zeros_like(residual)
    if baseline is not None:
        noise -= np.outer(baseline, baseline @ noise)
        fitted = (baseline @ residual) * baseline
    noise *= np.linalg.norm(residual - fitted) / np.linalg.norm(noise, axis=0)
    return fitted[:, None] + noise


def _judge(
    y: np.ndarray, k: int, shape: np.ndarray, residual: np.ndarray, line: np.ndarray,
    shapes: np.ndarray, baseline: Optional[np.ndarray], limit: float, seed: int,
) -> Optional[Tuple[float, float]]:
    """Memory and p-value if the best shape stands up, otherwise None."""
    leftover = residual - (shape @ residual) * shape
    # An exact fit leaves only rounding, which has no meaning to read.
    pattern = _pattern(leftover) if leftover @ leftover > EXACT_FIT * (residual @ residual) else 0.0
    if pattern >= limit:
        return None
    reading = max(_wander(y, k), pattern) + MEMORY_MARGIN / np.sqrt(len(y))
    memory = float(np.clip(reading, 0.0, MAX_MEMORY))
    simulated = _simulate(residual, line, baseline, memory, np.random.default_rng(seed))
    beaten = int((_gain(simulated, shapes, baseline) >= _gain(residual, shapes, baseline)).sum())
    p = (1 + beaten) / (SIMULATIONS + 1)
    return (memory, p) if p <= MAX_P else None


def _fit(y: np.ndarray, kind: str, k: int) -> Tuple[float, float, float]:
    """Intercept, slope and the size of the extra term for one shape at one position."""
    t = np.arange(len(y), dtype="float64")
    extra = (t >= k).astype("float64") if kind == "step" else np.maximum(t - k, 0.0)
    intercept, slope, change = np.linalg.lstsq(np.column_stack([np.ones(len(y)), t, extra]), y, rcond=None)[0]
    return float(intercept), float(slope), float(change)


def _takes_back(y: np.ndarray, k: int) -> bool:
    """Whether a step here runs against a slope that undoes it within the series."""
    _, slope, change = _fit(y, "step", k)
    return slope * change < 0 and abs(slope) * len(y) >= abs(change)


def _reverses(y: np.ndarray, k: int) -> bool:
    """Whether a bend here turns the series round, with both legs moving."""
    _, slope, change = _fit(y, "bend", k)
    first, second = slope * k, (slope + change) * (len(y) - 1 - k)
    return first * second < 0 and min(abs(first), abs(second)) >= MIN_LEG_SHARE * max(abs(first), abs(second))


def _percent(before: float, change: float) -> Optional[float]:
    if before <= 0 or abs(change) > MAX_RISE_MULTIPLE * before:
        return None
    return change / before * 100


def _describe(
    y: np.ndarray, kind: str, k: int, shapes: np.ndarray, positions: np.ndarray,
    residual: np.ndarray, memory: float, p: float,
) -> Dict[str, Any]:
    # Positions that fit about as well, as a likelihood-ratio interval. Memory
    # means fewer independent periods, so it widens.
    total = float(residual @ residual)
    left = np.maximum(total - (shapes @ residual) ** 2, EXACT_FIT * total)
    effective = len(y) * (1 - memory) / (1 + memory)
    close = positions[effective * np.log(left / left.min()) <= 3.84]

    intercept, slope, change = _fit(y, kind, k)
    result: Dict[str, Any] = {
        "kind": kind, "position": k, "earliest": int(close.min()), "latest": int(close.max()),
        "p": p, "memory": round(memory, 2),
    }
    if kind == "step":
        before = intercept + slope * k
        result.update(before=before, after=before + change, changePct=_percent(before, change))
    else:
        result.update(slopeBefore=slope, slopeAfter=slope + change)
    return result


def find_shift(values: Sequence[float], seed: int = 0) -> Optional[Dict[str, Any]]:
    """
    The clearest change in a series in time order, or None if there is none.

    `position` is the first period at the new level, or the period the direction
    changed at. `earliest` and `latest` bound the positions that fit about as
    well, since a change is rarely known to the exact period. A step's `before`
    and `after` are the levels either side of it, so a slope around the step
    does not count towards its size.
    """
    y = np.asarray(values, dtype="float64")
    n = len(y)
    if not MIN_PERIODS <= n <= MAX_PERIODS or not np.isfinite(y).all() or np.ptp(y) == 0:
        return None

    line, curve, positions, steps, bends = _candidates(n)
    residual = line @ ((y - y.mean()) / y.std())
    if residual @ residual <= EXACT_FIT * n:
        return None

    shapes = np.vstack([steps, bends])
    best = int(np.argmax((shapes @ residual) ** 2))
    kind = "step" if best < len(positions) else "turning_point"
    of_kind = steps if kind == "step" else bends
    k = int(positions[best % len(positions)])
    limit = CLEAN_PATTERN if kind == "step" and _takes_back(y, k) else MAX_PATTERN
    judged = _judge(y, k, shapes[best], residual, line, shapes, curve, limit, seed)
    if judged:
        return _describe(y, kind, k, of_kind, positions, residual, *judged)

    best = int(np.argmax((bends @ residual) ** 2))
    k = int(positions[best])
    if not _reverses(y, k):
        return None
    judged = _judge(y, k, bends[best], residual, line, bends, None, MAX_PATTERN, seed)
    return _describe(y, "turning_point", k, bends, positions, residual, *judged) if judged else None


def labelled_shift(values: Sequence[float], periods: Sequence[Any]) -> Optional[Dict[str, Any]]:
    """
    find_shift in the series' own period labels, for a report or a chat answer.
    The p-value stays behind: it is an output of the test, not something for a
    reader, and being here at all means the change passed.
    """
    found = find_shift(values)
    if not found:
        return None
    shift: Dict[str, Any] = {
        "kind": found["kind"],
        "period": str(periods[found["position"]]),
        "earliestPeriod": str(periods[found["earliest"]]),
        "latestPeriod": str(periods[found["latest"]]),
    }
    if found["kind"] == "step":
        shift.update(before=round(found["before"], 4), after=round(found["after"], 4))
        if found["changePct"] is not None:
            shift["changePct"] = round(found["changePct"], 1)
    else:
        shift.update(slopeBeforePerPeriod=round(found["slopeBefore"], 4),
                     slopeAfterPerPeriod=round(found["slopeAfter"], 4))
    return shift
