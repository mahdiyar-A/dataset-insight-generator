"""
A score out of 100 for one report on one case.

What a reader would mark a report down for, each check worth a few points:

  * it says what the case's planted truth requires, and none of what a
    careless writer says about it (case.must / case.must_not);
  * every insight rests on a result DIG computed;
  * every figure in it is one the statistics hold;
  * it writes about the findings the plan put first;
  * it gives the number of insights asked for;
  * no internal result ids ("F3") leak into the words.

A report from the stats-only fallback is scored too, so the harness can be
checked without a model, but it is marked: tuning compares model reports.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from ai_engine.llm.guard import ungrounded_numbers

WEIGHTS = {
    "must": 3.0,
    "must_not": 3.0,
    "traced": 2.0,
    "figures": 2.0,
    "plan": 1.5,
    "count": 1.0,
    "no_ids": 1.0,
}
_ID = re.compile(r"\b[FR]\d{1,3}\b")


def reader_text(report) -> str:
    """Everything a reader sees, as one string."""
    parts = [getattr(report, "reportTitle", ""), getattr(report, "introduction", ""),
             getattr(report, "executiveSummary", ""), getattr(report, "conclusion", "")]
    for insight in getattr(report, "insights", None) or []:
        parts += [str(insight.get("title") or ""), str(insight.get("body") or "")]
    return "\n".join(p for p in parts if p)


def score_report(report, case, prompt: str = "", planned: Optional[List[str]] = None,
                 asked_insights: int = 5, found: Optional[bool] = None) -> Dict[str, Any]:
    """
    {"case", "score", "checks": [{"name", "passed", "points", "of", "note"}], "fallback", "statsFound"}.
    `prompt` is what the writer was shown, for the figure check; `planned`
    the ids the plan put first.
    """
    text = reader_text(report)
    insights = list(getattr(report, "insights", None) or [])
    checks: List[Dict[str, Any]] = []

    def add(name: str, kind: str, share: float, note: str = "") -> None:
        of = WEIGHTS[kind]
        share = max(0.0, min(1.0, share))
        checks.append({"name": name, "passed": share >= 0.999, "points": round(of * share, 2),
                       "of": of, "note": note})

    for label, pattern in case.must:
        add(f"says: {label}", "must", 1.0 if re.search(pattern, text, re.I) else 0.0)
    for label, pattern in case.must_not:
        hit = re.search(pattern, text, re.I)
        add(f"never: {label}", "must_not", 0.0 if hit else 1.0, hit.group(0)[:80] if hit else "")

    if insights:
        traced = sum(bool(i.get("restsOn")) for i in insights)
        add("every insight rests on a result", "traced", traced / len(insights), f"{traced}/{len(insights)}")
    else:
        add("every insight rests on a result", "traced", 0.0, "no insights")

    wrong = ungrounded_numbers(text, [prompt]) if prompt else []
    add("every figure is in the statistics", "figures", 1.0 - 0.25 * len(wrong),
        ", ".join(f"{v:,.6g}" for v in wrong[:6]))

    top = [p for p in (planned or [])[:3]]
    if top:
        cited = {str(i) for ins in insights for i in (ins.get("restsOn") or [])}
        covered = sum(p in cited for p in top)
        add("writes about the planned findings", "plan", covered / len(top), f"{covered}/{len(top)}")

    add("gives the insights asked for", "count",
        1.0 if len(insights) == asked_insights else max(0.0, 1 - abs(len(insights) - asked_insights) / asked_insights),
        f"{len(insights)} of {asked_insights}")

    leaked = sorted(set(_ID.findall(text)))
    add("no result ids in the words", "no_ids", 0.0 if leaked else 1.0, ", ".join(leaked[:6]))

    earned = sum(c["points"] for c in checks)
    possible = sum(c["of"] for c in checks)
    writer = str(getattr(report, "writerModel", "") or "")
    return {
        "case": case.name,
        "score": round(100 * earned / possible, 1) if possible else 0.0,
        "checks": checks,
        "writer": writer,
        "fallback": not writer or "fallback" in writer.lower() or "statistics" in writer.lower(),
        "statsFound": found,
    }


def summary(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """The mean score, and the mean over model-written reports only."""
    scores = [r["score"] for r in results]
    written = [r["score"] for r in results if not r["fallback"]]
    return {
        "cases": len(results),
        "mean": round(sum(scores) / len(scores), 1) if scores else 0.0,
        "meanWritten": round(sum(written) / len(written), 1) if written else None,
        "written": len(written),
        "statsMissed": [r["case"] for r in results if r.get("statsFound") is False],
    }
