"""
Small statistical primitives shared by the analysis modules.

Each one is a textbook procedure, implemented once so that every finding in a
report is computed the same way and can be checked against scipy in the tests.
Three rules run through all of them:

  * **A p-value is never reported alone.** With a few thousand rows almost any
    difference is "significant", so every test here comes with an effect size
    and a plain-words strength label. A report should lead with the size of an
    effect, not with its p-value.

  * **Many tests means corrected p-values.** The engine compares dozens of
    column pairs. At p < 0.05, one in twenty unrelated pairs looks significant
    by chance, so anything ranked and reported is screened with the
    Benjamini-Hochberg false discovery rate instead.

  * **Degenerate input returns None, not a number.** A correlation of a
    constant column or a test on two rows is undefined. Returning NaN or 0 lets
    a meaningless figure reach the prose; None makes the caller skip it.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats


# ── Multiple testing ─────────────────────────────────────────────────────────

def bh_adjust(p_values: Sequence[Optional[float]]) -> List[Optional[float]]:
    """
    Benjamini-Hochberg adjusted p-values (q-values), in the input order.

    None entries are passed through and do not count toward the number of
    tests. Matches scipy.stats.false_discovery_control(method="bh").
    """
    idx = [i for i, p in enumerate(p_values) if p is not None and np.isfinite(p)]
    out: List[Optional[float]] = [None] * len(p_values)
    if not idx:
        return out
    ps = np.array([float(p_values[i]) for i in idx])
    m = len(ps)
    order = np.argsort(ps)
    ranked = ps[order] * m / np.arange(1, m + 1)
    # Enforce monotonicity from the largest p downwards.
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    adjusted = np.empty(m)
    adjusted[order] = np.clip(ranked, 0.0, 1.0)
    for j, i in enumerate(idx):
        out[i] = float(adjusted[j])
    return out


# ── Correlation ──────────────────────────────────────────────────────────────

def correlation_strength(r: float) -> str:
    """Cohen-style wording for |r|."""
    a = abs(r)
    if a >= 0.7:
        return "strong"
    if a >= 0.4:
        return "moderate"
    if a >= 0.2:
        return "weak"
    return "negligible"


def correlation_p_value(r: float, n: int) -> Optional[float]:
    """Two-sided p for H0: rho = 0, via the t distribution (as scipy does)."""
    if n is None or n < 4 or r is None or not np.isfinite(r):
        return None
    r = max(min(float(r), 1.0), -1.0)
    if abs(r) >= 1.0:
        return 0.0
    t = r * math.sqrt((n - 2) / (1.0 - r * r))
    return float(2.0 * scipy_stats.t.sf(abs(t), n - 2))


def fisher_ci(r: float, n: int, level: float = 0.95) -> Optional[Tuple[float, float]]:
    """Confidence interval for a Pearson r via the Fisher z-transform."""
    if n is None or n < 4 or r is None or not np.isfinite(r):
        return None
    r = max(min(float(r), 0.999999), -0.999999)
    z = math.atanh(r)
    se = 1.0 / math.sqrt(n - 3)
    crit = scipy_stats.norm.ppf(0.5 + level / 2.0)
    return (math.tanh(z - crit * se), math.tanh(z + crit * se))


# ── Group differences ────────────────────────────────────────────────────────

def eta_squared(groups: Sequence[np.ndarray]) -> Optional[float]:
    """Share of total variance explained by group membership."""
    groups = [np.asarray(g, dtype="float64") for g in groups if len(g) > 0]
    if len(groups) < 2:
        return None
    allv = np.concatenate(groups)
    grand = allv.mean()
    ss_total = float(((allv - grand) ** 2).sum())
    if ss_total <= 0:
        return None
    ss_between = float(sum(len(g) * (g.mean() - grand) ** 2 for g in groups))
    return ss_between / ss_total


def epsilon_squared(h: float, n: int) -> Optional[float]:
    """Effect size for Kruskal-Wallis H (Tomczak & Tomczak, 2014)."""
    if h is None or n is None or n < 3 or not np.isfinite(h):
        return None
    return float(min(1.0, max(0.0, h * (n + 1) / (n * n - 1))))


def variance_explained_strength(v: Optional[float]) -> str:
    """Cohen's conventions for eta-squared and similar shares of variance."""
    if v is None:
        return "unknown"
    if v >= 0.14:
        return "large"
    if v >= 0.06:
        return "medium"
    if v >= 0.01:
        return "small"
    return "negligible"


def cohens_d(a: np.ndarray, b: np.ndarray) -> Optional[float]:
    """Standardised mean difference with a pooled standard deviation."""
    a = np.asarray(a, dtype="float64")
    b = np.asarray(b, dtype="float64")
    if len(a) < 2 or len(b) < 2:
        return None
    va, vb = a.var(ddof=1), b.var(ddof=1)
    pooled = math.sqrt(((len(a) - 1) * va + (len(b) - 1) * vb) / (len(a) + len(b) - 2))
    if pooled <= 0:
        return None
    return float((a.mean() - b.mean()) / pooled)


def d_strength(d: Optional[float]) -> str:
    if d is None:
        return "unknown"
    a = abs(d)
    if a >= 0.8:
        return "large"
    if a >= 0.5:
        return "medium"
    if a >= 0.2:
        return "small"
    return "negligible"


# ── Categorical association ──────────────────────────────────────────────────

def cramers_v(table: np.ndarray) -> Optional[Dict[str, float]]:
    """
    Bias-corrected Cramér's V (Bergsma, 2013) with the chi-square test.

    The uncorrected V is inflated for small samples and many categories — a
    table of pure noise can score 0.2 — so the corrected form is what gets
    reported. Returns {"v", "chi2", "p", "dof"} or None for a degenerate table.
    """
    table = np.asarray(table, dtype="float64")
    # Drop empty rows and columns: they carry no information and break dof.
    table = table[table.sum(axis=1) > 0][:, table.sum(axis=0) > 0]
    if table.ndim != 2 or min(table.shape) < 2:
        return None
    n = table.sum()
    if n < 10:
        return None
    chi2, p, dof, _ = scipy_stats.chi2_contingency(table, correction=False)
    r, k = table.shape
    phi2 = chi2 / n
    phi2c = max(0.0, phi2 - (k - 1) * (r - 1) / (n - 1))
    rc = r - (r - 1) ** 2 / (n - 1)
    kc = k - (k - 1) ** 2 / (n - 1)
    denom = min(kc - 1, rc - 1)
    if denom <= 0:
        return None
    v = math.sqrt(phi2c / denom)
    return {"v": float(min(1.0, v)), "chi2": float(chi2), "p": float(p), "dof": int(dof)}


def association_strength(v: Optional[float]) -> str:
    if v is None:
        return "unknown"
    if v >= 0.5:
        return "strong"
    if v >= 0.3:
        return "moderate"
    if v >= 0.1:
        return "weak"
    return "negligible"


# ── Trend ────────────────────────────────────────────────────────────────────

def mann_kendall(y: Sequence[float]) -> Optional[Dict[str, float]]:
    """
    Mann-Kendall monotonic trend test with Sen's slope.

    Rank-based, so a single spike month cannot manufacture a trend the way it
    can for a least-squares line, and it does not assume the change is linear.
    Uses Kendall's tau between position and value, which is the Mann-Kendall
    statistic with scipy's tie correction. Sen's slope is in units of y per
    step of the series.
    """
    y = np.asarray([v for v in y if v is not None and np.isfinite(v)], dtype="float64")
    n = len(y)
    if n < 4 or np.ptp(y) == 0:
        return None
    x = np.arange(n, dtype="float64")
    tau, p = scipy_stats.kendalltau(x, y)
    if tau is None or not np.isfinite(tau):
        return None
    slope, intercept, lo, hi = scipy_stats.theilslopes(y, x)
    return {
        "tau": float(tau),
        "p": float(p),
        "senSlope": float(slope),
        "senSlopeLow": float(lo),
        "senSlopeHigh": float(hi),
        "n": int(n),
    }


# ── Distributions ────────────────────────────────────────────────────────────

def robust_outliers(values: np.ndarray, threshold: float = 3.5) -> Optional[Dict[str, float]]:
    """
    Outliers by the modified z-score (Iglewicz & Hoaglin): |0.6745 (x - median) / MAD|.

    The median and MAD are not dragged by the outliers themselves, unlike the
    mean and standard deviation, so one extreme value cannot hide another.
    Returns None when MAD is zero (over half the values identical), where the
    score is undefined.
    """
    v = np.asarray(values, dtype="float64")
    v = v[np.isfinite(v)]
    if len(v) < 10:
        return None
    med = float(np.median(v))
    mad = float(np.median(np.abs(v - med)))
    if mad == 0:
        return None
    z = 0.6745 * (v - med) / mad
    mask = np.abs(z) > threshold
    return {
        "count": int(mask.sum()),
        "pct": float(mask.mean() * 100.0),
        "high": int((z > threshold).sum()),
        "low": int((z < -threshold).sum()),
    }


def distribution_shape(values: np.ndarray) -> Optional[str]:
    """
    One word for the shape a reader would see in a histogram.

    Uses skewness for asymmetry, excess kurtosis for heavy tails, and
    Sarle's bimodality coefficient (b > 0.555 suggests two humps).
    """
    v = np.asarray(values, dtype="float64")
    v = v[np.isfinite(v)]
    n = len(v)
    if n < 20 or np.ptp(v) == 0:
        return None
    if len(np.unique(v)) <= 2:
        return "binary"
    skew = float(scipy_stats.skew(v))
    kurt = float(scipy_stats.kurtosis(v))  # excess
    bc = (skew ** 2 + 1) / (kurt + 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)))
    if bc > 0.555 and abs(skew) < 1:
        return "bimodal"
    if skew >= 1:
        return "right-skewed"
    if skew <= -1:
        return "left-skewed"
    if kurt >= 3:
        return "heavy-tailed"
    return "roughly symmetric"


def gini(values: Sequence[float]) -> Optional[float]:
    """Gini coefficient of non-negative amounts: 0 = equal, 1 = one holder has all."""
    v = _finite(values)
    v = np.sort(v)
    if len(v) < 2 or (v < 0).any() or v.sum() <= 0:
        return None
    n = len(v)
    cum = np.cumsum(v)
    return float((n + 1 - 2 * (cum / cum[-1]).sum()) / n)


def pareto_share(values: Sequence[float], top_fraction: float = 0.2) -> Optional[Dict[str, float]]:
    """
    How concentrated a total is among its holders.

    Returns the share of the total held by the top `top_fraction` of holders,
    and the fraction of holders needed to reach 80% of the total — the two
    figures behind "20% of customers bring 75% of revenue".
    """
    v = np.sort(_finite(values))[::-1]
    if len(v) < 5 or (v < 0).any() or v.sum() <= 0:
        return None
    total = v.sum()
    k = max(1, int(round(len(v) * top_fraction)))
    cum = np.cumsum(v) / total
    holders_for_80 = int(np.searchsorted(cum, 0.8) + 1)
    return {
        "topFraction": top_fraction,
        "topShare": float(v[:k].sum() / total),
        "holdersFor80Pct": holders_for_80,
        "fractionFor80Pct": float(holders_for_80 / len(v)),
        "holders": int(len(v)),
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _finite(values) -> np.ndarray:
    """Values as float64 with None, NaN and infinities removed."""
    v = pd.to_numeric(pd.Series(values, dtype="object") if not isinstance(values, (np.ndarray, pd.Series))
                      else pd.Series(values), errors="coerce").to_numpy(dtype="float64")
    return v[np.isfinite(v)]


def fmt_p(p: Optional[float]) -> Optional[float]:
    """Round a p-value for display without turning a tiny one into 0."""
    if p is None or not np.isfinite(p):
        return None
    if p < 1e-6:
        return 1e-6
    return float(f"{p:.3g}")


def text_columns(df: pd.DataFrame) -> List[str]:
    """Columns holding text or categories, on pandas 2 and 3 alike."""
    out = []
    for c in df.columns:
        s = df[c]
        if pd.api.types.is_bool_dtype(s):
            out.append(c)
        elif isinstance(s.dtype, pd.CategoricalDtype):
            out.append(c)
        elif pd.api.types.is_object_dtype(s) or pd.api.types.is_string_dtype(s):
            out.append(c)
    return out


def numeric_columns(df: pd.DataFrame) -> List[str]:
    """Real numeric columns; booleans excluded (they are categories here)."""
    return [c for c in df.columns
            if pd.api.types.is_numeric_dtype(df[c]) and not pd.api.types.is_bool_dtype(df[c])]
