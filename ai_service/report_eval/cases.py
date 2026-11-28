"""
Files whose right answers are known, because they were made to hold them.

Each case builds a table with a planted truth (a link that reverses inside
every region, a jump in one month, one department far above the rest), says
what a good report must say about it and what it must never say, and checks
that DIG's own statistics found the truth before any model writes. A case
whose statistics miss the truth is a statistics bug, scored apart from the
writing.

The checks are written for English reports: the scorecard runs in English.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Tuple

import numpy as np
import pandas as pd

# (label, regular expression). Matched case-insensitively against everything
# a reader sees: title, summary, insights, conclusion.
Check = Tuple[str, str]


@dataclass
class Case:
    name: str
    about: str
    build: Callable[[], pd.DataFrame]
    domain: str
    key: List[str]
    interpretations: Dict[str, str]
    must: List[Check] = field(default_factory=list)
    must_not: List[Check] = field(default_factory=list)
    # The planted truth, as DIG's statistics should report it: a test on the
    # results evidence.catalog() lists, {id: {"kind", "item", ...}}.
    found: Callable[[Dict[str, Any]], bool] = lambda known: True
    settings: Dict[str, Any] = field(default_factory=dict)


def _of(known: Dict[str, Any], kind: str) -> List[Dict[str, Any]]:
    return [e["item"] for e in known.values() if e.get("kind") == kind]


# ── The files ────────────────────────────────────────────────────────────────

def marketing() -> pd.DataFrame:
    """Spend and revenue rise together across regions and fall together inside each; a step in month 21."""
    rng = np.random.default_rng(7)
    months = pd.date_range("2023-01-01", periods=36, freq="MS")
    frames = []
    for region, centre in (("North", 20.0), ("East", 40.0), ("South", 60.0), ("West", 80.0)):
        n = 360
        spend = rng.normal(centre, 5, n)
        month = months[rng.integers(0, 36, n)]
        revenue = 3 * centre - 0.8 * (spend - centre) + rng.normal(0, 4, n) + 25 * (month >= months[20])
        frames.append(pd.DataFrame({"month": month.strftime("%Y-%m-%d"), "region": region,
                                    "spend": spend.round(2), "revenue": revenue.round(2),
                                    "units": rng.poisson(30, n)}))
    return pd.concat(frames, ignore_index=True).sample(frac=1, random_state=1).reset_index(drop=True)


def attrition() -> pd.DataFrame:
    """Sales loses 40% of its staff, every other department about 10%; pay differs by department."""
    rng = np.random.default_rng(11)
    rows = []
    for dept, n, rate, pay in (("Sales", 300, 0.40, 52000), ("Engineering", 300, 0.10, 88000),
                               ("Finance", 200, 0.09, 71000), ("Support", 200, 0.11, 46000)):
        left = rng.random(n) < rate
        rows.append(pd.DataFrame({
            "department": dept,
            "salary": rng.normal(pay, 6000, n).round(0),
            "tenure_years": rng.gamma(2.0, 2.0, n).round(1),
            "engagement": np.clip(rng.normal(3.6 - 0.6 * left, 0.6), 1, 5).round(1),
            "left": np.where(left, "Yes", "No"),
        }))
    return pd.concat(rows, ignore_index=True).sample(frac=1, random_state=2).reset_index(drop=True)


def shop() -> pd.DataFrame:
    """Revenue is units times price, exactly; nothing else relates to anything."""
    rng = np.random.default_rng(5)
    n = 800
    units = rng.integers(1, 40, n)
    price = rng.choice([4.99, 9.99, 14.99, 24.99], n)
    return pd.DataFrame({
        "store": rng.choice(["Downtown", "Airport", "Mall"], n),
        "units": units,
        "unit_price": price,
        "revenue": (units * price).round(2),
        "rating": rng.integers(1, 6, n),
    })


def noise() -> pd.DataFrame:
    """Columns with no relationship at all."""
    rng = np.random.default_rng(3)
    n = 500
    return pd.DataFrame({
        "site": rng.choice(["A", "B", "C", "D"], n),
        "temperature": rng.normal(20, 4, n).round(1),
        "output": rng.normal(100, 15, n).round(1),
        "defects": rng.poisson(3, n),
        "shift_hours": rng.normal(8, 1, n).round(1),
    })


def clinic() -> pd.DataFrame:
    """Waiting times rise steadily over two years."""
    rng = np.random.default_rng(9)
    days = pd.date_range("2024-01-01", "2025-12-31", freq="D")
    n = 1500
    day = days[rng.integers(0, len(days), n)]
    progress = (day - days[0]).days / len(days)
    return pd.DataFrame({
        "visit_date": day.strftime("%Y-%m-%d"),
        "clinic": rng.choice(["East", "West", "Central"], n),
        "wait_minutes": np.clip(rng.normal(25 + 30 * progress, 8), 2, None).round(0),
        "age": rng.integers(1, 95, n),
    }).sort_values("visit_date").reset_index(drop=True)


CASES: List[Case] = [
    Case(
        name="marketing_reversal",
        about="Spend and revenue move together across regions but the other way inside every region; "
              "revenue steps up in September 2024.",
        build=marketing, domain="marketing", key=["revenue", "spend"],
        interpretations={"spend": "marketing spend", "revenue": "revenue", "region": "sales region"},
        must=[("names the split inside the regions",
               r"(inside|within) (each|every|the) region|region[^.]{0,80}(opposite|revers|turn|flip)"
               r"|(opposite|revers)[^.]{0,80}region"),
              ("names when revenue jumped", r"(sep(tember)?\.? 2024|2024-09)")],
        must_not=[("calls more spend more revenue as a plain fact",
                   r"(more|higher|increas\w*) spend\w* (leads?|drives?|brings?|generates?) (to )?(more|higher)")],
        found=lambda known: any(m.get("by") == "region" and m.get("kind") == "reversed"
                                for m in _of(known, "misleading")),
    ),
    Case(
        name="attrition_by_department",
        about="Sales loses 40% of its staff, the other departments about 10%.",
        build=attrition, domain="hr", key=["left", "engagement"],
        interpretations={"left": "whether the employee left", "department": "department",
                         "engagement": "engagement score"},
        must=[("names Sales as the department losing most", r"\bsales\b"),
              ("gives a rate or share, not a count", r"\d+(\.\d+)?\s?%|per ?cent")],
        must_not=[("claims a cause", r"\b(causes?|caused|makes? (people|staff|employees) (leave|quit)|"
                                     r"because of (low|their) (pay|salary|engagement))\b")],
        found=lambda known: any("Sales" in str(e.get("item")) for e in known.values()
                                if e.get("kind") in ("segment", "group_difference", "driver", "association")),
    ),
    Case(
        name="calculated_revenue",
        about="Revenue is units times price, so their link is arithmetic, not a finding.",
        build=shop, domain="retail", key=["revenue"],
        interpretations={"revenue": "revenue", "units": "units sold", "unit_price": "price per unit"},
        must_not=[("reports the arithmetic as a finding",
                   r"(units|price)[^.]{0,60}(drive|driver|strongly (linked|associated|correlated)|predict)"
                   r"[^.]{0,40}revenue"),
                  ("calls units a driver", r"\bunits?\b[^.]{0,30}\bdriver\b")],
        found=lambda known: any(d.get("column") == "revenue" for d in _of(known, "derived"))
        or not any({"units", "revenue"} <= {c.get("a"), c.get("b")} for c in _of(known, "correlation")),
    ),
    Case(
        name="nothing_to_find",
        about="No column relates to any other; a good report says so instead of inventing links.",
        build=noise, domain="manufacturing", key=["output", "defects"],
        interpretations={"output": "units produced", "defects": "defects found", "site": "factory site"},
        must_not=[("invents a strong link", r"\bstrong(ly)? (positive |negative )?(link|relationship|correlat|associat)"),
                  ("calls a site clearly better", r"site [abcd][^.]{0,40}(clearly|significantly) (higher|better|more)")],
        found=lambda known: not any(abs(float(c.get("r") or 0)) >= 0.3 for c in _of(known, "correlation")),
    ),
    Case(
        name="rising_waits",
        about="Waiting times rise steadily over two years.",
        build=clinic, domain="healthcare", key=["wait_minutes"],
        interpretations={"wait_minutes": "waiting time in minutes", "clinic": "clinic", "age": "patient age"},
        must=[("says waits are rising", r"(ris(e|es|ing)|increas\w*|grew|grow\w*|longer|up)\b[^.]{0,60}wait"
                                        r"|wait[^.]{0,60}(ris(e|es|ing)|increas\w*|grew|grow\w*|longer)")],
        must_not=[("calls the trend flat", r"wait[^.]{0,60}(stable|flat|unchanged|steady over)")],
        found=lambda known: any(t.get("direction") == "rising" and t.get("significant")
                                for t in _of(known, "trend")),
    ),
]


def by_name(names: List[str]) -> List[Case]:
    if not names:
        return list(CASES)
    wanted = {n.strip() for n in names if n.strip()}
    unknown = wanted - {c.name for c in CASES}
    if unknown:
        raise SystemExit(f"Unknown case(s): {', '.join(sorted(unknown))}. "
                         f"Known: {', '.join(c.name for c in CASES)}")
    return [c for c in CASES if c.name in wanted]
