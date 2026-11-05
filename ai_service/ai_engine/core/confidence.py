"""
Phase 6 — how far the report can be trusted, decided from the statistics.

This replaced an LLM "judge" (gpt-oss-20b on Groq) that read the finished
report and returned a confidence score, a verdict and edits. Measured on a
30,000-row file it took 20 of the analysis's 60 seconds, because it shared
the free tier's 8,000-tokens-per-minute budget with the domain call and had
to wait for the minute to roll over. It was also a weaker model second-
guessing a stronger one: the report is written by the strongest model in the
chain, then audited by the smallest.

Everything a confidence score should rest on is already computed locally:
how many rows there are, how complete they are, how many statistically
significant patterns exist to support the findings, and what quality issues
were detected. So this module scores from that evidence, deterministically
and in milliseconds, and says in plain words why it landed where it did — a
score a reader can check, rather than a model's impression.

It also validates the report's chart instructions against the real columns,
which was the one correction the judge made that mattered: a chart naming a
column that does not exist renders as an error or not at all.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Tuple

from ai_engine.core.confounding import misleading_pairs
from ai_engine.models.models import ChartInstruction, JudgeResult, StatsSummary

# Below this many rows no finding is more than anecdote.
MIN_ROWS_FOR_ANY_CONFIDENCE = 30

# A correlation this strong or stronger counts as supporting evidence.
EVIDENCE_MIN_ABS_R = 0.3


# ── Chart validation ─────────────────────────────────────────────────────────

def validate_chart_instructions(
    instructions: List[ChartInstruction], columns: Iterable[str]
) -> Tuple[List[ChartInstruction], List[str]]:
    """
    Keep charts whose columns exist, fixing case mismatches; drop the rest.

    A model writing "Revenue" for a column named "revenue" is harmless and
    fixed here. A model inventing "profit_margin" is not, and that chart is
    dropped rather than rendered as an error. Returns (kept, issues).
    """
    by_lower: Dict[str, str] = {str(c).lower(): str(c) for c in columns}

    def resolve(name: Optional[str]) -> Optional[str]:
        if not name:
            return None
        return by_lower.get(str(name).strip().lower())

    kept: List[ChartInstruction] = []
    issues: List[str] = []
    for c in instructions:
        x = resolve(c.xColumn)
        if x is None:
            issues.append(f"Dropped chart \"{c.title}\": column \"{c.xColumn}\" is not in the dataset.")
            continue
        c.xColumn = x

        if c.yColumn:
            y = resolve(c.yColumn)
            if y is None:
                issues.append(f"Chart \"{c.title}\": ignored unknown column \"{c.yColumn}\".")
            c.yColumn = y

        if c.groupColumn:
            c.groupColumn = resolve(c.groupColumn)

        if c.yColumns:
            c.yColumns = [r for r in (resolve(y) for y in c.yColumns) if r]

        kept.append(c)
    return kept, issues


def split_misleading_scatters(charts: List[ChartInstruction], stats: StatsSummary) -> None:
    """
    A plain scatter of a misleading pair draws the very picture that misleads,
    one rising line beside text saying otherwise. The writer is asked to split
    it; this makes sure. Runs on validated charts, so column names are exact.
    """
    split_by = {frozenset((c["a"], c["b"])): c["by"] for c in stats.correlationChecks or []}
    for chart in charts:
        if chart.chartType == "scatter" and chart.yColumn and not chart.groupColumn:
            chart.groupColumn = split_by.get(frozenset((chart.xColumn, chart.yColumn)))


# ── Evidence ─────────────────────────────────────────────────────────────────

def count_evidence(stats: StatsSummary) -> int:
    """
    Distinct statistically meaningful patterns the report can stand on.

    Counted once each:
      * a correlation pair at |r| >= 0.3 (Pearson or Spearman) that survives
        the false-discovery correction, unless the two columns are near-copies
        of each other (|r| >= 0.98 says they record the same thing, which is
        redundancy, not a finding) or the correlation does not hold inside
        the groups of a category;
      * a group difference that is significant with a non-negligible effect;
      * a significant trend, a group effect of at least medium size, and a
        concentration well above an even split;
      * a driver model that explains the target at least weakly, and any
        segment that differs significantly from the rest;
      * up to two significant associations between categories.

    Correlations without a "significant" field (older summaries) count on
    their size alone.
    """
    pairs = set()
    misleading = misleading_pairs(stats.correlationChecks)
    for item in list(stats.topCorrelations or []) + list(stats.spearmanCorrelations or []):
        r = item.get("correlation", item.get("spearman"))
        if r is None or abs(float(r)) < EVIDENCE_MIN_ABS_R:
            continue
        pair = frozenset((item.get("col1"), item.get("col2")))
        if item.get("nearDuplicate") or item.get("significant") is False or pair in misleading:
            continue
        pairs.add(pair)
    evidence = len(pairs)

    evidence += sum(1 for g in (stats.groupComparisons or []) if g.get("significant"))

    analyses = (stats.domainAnalyses or {}).get("analyses", {}) or {}
    if (analyses.get("trend") or {}).get("significant"):
        evidence += 1
    if (analyses.get("group_effect") or {}).get("strength") in ("medium", "large"):
        evidence += 1
    conc = analyses.get("concentration") or {}
    if conc.get("groupCount") and conc.get("top2Share") is not None:
        even = 2.0 / conc["groupCount"]
        if conc["top2Share"] - even >= 0.15:
            evidence += 1
    model = (analyses.get("key_drivers") or {}).get("model") or {}
    if model.get("fit") in ("weak", "moderate", "strong"):
        evidence += 1
    seg = analyses.get("segments") or {}
    if seg.get("high") or seg.get("low"):
        evidence += 1
    evidence += min(2, sum(1 for a in (stats.categoricalAssociations or [])
                           if a.get("significant") and not a.get("nearDuplicate")))
    return evidence


def _mean_missing_pct(stats: StatsSummary) -> float:
    values = list((stats.missingPercentages or {}).values())
    return float(sum(values) / len(values)) if values else 0.0


# ── Score ────────────────────────────────────────────────────────────────────

def assess_confidence(
    stats: StatsSummary,
    chart_issues: Optional[List[str]] = None,
) -> JudgeResult:
    """
    Score 1-10 from the evidence, with the reasons spelled out.

    Starts at 10 and loses points for what actually weakens a conclusion: too
    few rows, missing data, little statistical support, and detected quality
    problems. Every deduction is written into the verdict, so the score can
    always be explained.
    """
    n = int(stats.rowCount or 0)
    missing = _mean_missing_pct(stats)
    evidence = count_evidence(stats)
    issues_found = list(stats.detectedIssues or [])

    score = 10
    reasons: List[str] = []

    if n < 100:
        score -= 3
        reasons.append(f"only {n:,} rows")
    elif n < 500:
        score -= 2
        reasons.append(f"a modest {n:,} rows")
    elif n < 2000:
        score -= 1

    if missing > 20:
        score -= 3
        reasons.append(f"{missing:.0f}% of values missing on average")
    elif missing > 10:
        score -= 2
        reasons.append(f"{missing:.0f}% of values missing on average")
    elif missing > 3:
        score -= 1

    if evidence == 0:
        score -= 3
        reasons.append("no statistically significant patterns")
    elif evidence == 1:
        score -= 2
        reasons.append("a single significant pattern")
    elif evidence == 2:
        score -= 1

    if len(issues_found) >= 5:
        score -= 2
        reasons.append(f"{len(issues_found)} data-quality issues")
    elif len(issues_found) >= 2:
        score -= 1

    if n < MIN_ROWS_FOR_ANY_CONFIDENCE:
        score = min(score, 4)

    score = max(1, min(10, score))
    level = "HIGH" if score >= 8 else "MEDIUM" if score >= 5 else "LOW"

    support = (f"{evidence} statistically significant pattern{'s' if evidence != 1 else ''}"
               if evidence else "no statistically significant patterns")
    statement = (f"Confidence is {level.lower()} ({score}/10), based on {n:,} rows "
                 f"with {missing:.1f}% of values missing and {support} in the data.")
    if reasons and level != "HIGH":
        statement += " It is held back by " + _join(reasons) + "."
    if level == "LOW":
        statement += " Treat these findings as directional rather than conclusive."

    return JudgeResult(
        confidence_score=score,
        confidence_level=level,
        overall_confidence=round(score / 10, 2),
        issues=issues_found + list(chart_issues or []),
        judge_statement=statement,
        conclusion="",                       # the writer's conclusion stands
        corrected_insights=None,
        corrected_chart_instructions=None,   # validation is applied in place
        proceed=level != "LOW",
    )


def _join(parts: List[str]) -> str:
    if len(parts) <= 1:
        return "".join(parts)
    return ", ".join(parts[:-1]) + " and " + parts[-1]
