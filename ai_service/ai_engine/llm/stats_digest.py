"""
The statistics, condensed for a model to read.

The report prompt used to embed the whole StatsSummary as indented JSON. That
was tolerable while the summary was small; with signed correlations, group
tests, drivers and segments it would have doubled, and prompt size is not
free here. Groq's free tier counts the prompt *plus* the reply against about
8,000 tokens a minute per model, so a fatter prompt means a fallback model
refuses the request outright, and every model reads a long prompt slower.

So the writer gets a digest: findings ranked and filtered (significant
results first, near-duplicate pairs labelled, insignificant noise dropped),
per-column descriptions trimmed to what a sentence would quote, and compact
JSON. The full summary still drives the confidence score and the chat.

The same digest is stored with each analysis as the chat's grounding, so the
assistant that answers questions later sees exactly what the report saw.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from ai_engine.models.models import DomainResult, StatsSummary

MAX_MEASURES = 12
MAX_CATEGORIES = 10
MAX_ISSUES = 8


def _drop_none(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None and v != [] and v != {}}


def _measures(stats: StatsSummary, key_features: List[str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    numeric = stats.numericStats or {}
    # Key features first, then the rest in their original order.
    order = [c for c in key_features if c in numeric] + [c for c in numeric if c not in key_features]
    for col in order[:MAX_MEASURES]:
        s = numeric[col]
        entry = {
            "mean": s.get("mean"), "median": s.get("median"),
            "min": s.get("min"), "max": s.get("max"), "std": s.get("std"),
            "sum": s.get("sum"), "shape": s.get("shape"),
        }
        if s.get("outlier_pct"):
            entry["outlier_pct"] = s["outlier_pct"]
        if s.get("zeros_pct", 0) >= 5:
            entry["zeros_pct"] = s["zeros_pct"]
        if s.get("negative_pct", 0) > 0:
            entry["negative_pct"] = s["negative_pct"]
        missing = (stats.missingPercentages or {}).get(col, 0)
        if missing:
            entry["missing_pct"] = missing
        out[col] = _drop_none(entry)
    return out


def _categories(stats: StatsSummary) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    cats = stats.categoricalSummaries or {}
    # Low-cardinality first: those are the groupings a report talks about.
    order = sorted(cats, key=lambda c: cats[c].get("unique_count", 0))
    for col in order[:MAX_CATEGORIES]:
        c = cats[col]
        top = dict(list((c.get("top_values") or {}).items())[:4])
        entry = {"distinct": c.get("unique_count"), "top": top}
        if c.get("missing_pct"):
            entry["missing_pct"] = c["missing_pct"]
        out[col] = entry
    return out


def _correlations(stats: StatsSummary) -> List[Dict[str, Any]]:
    rows = []
    spearman = {frozenset((s["col1"], s["col2"])): s for s in (stats.spearmanCorrelations or [])}
    for c in stats.topCorrelations or []:
        r = c.get("correlation")
        if r is None:
            continue
        if not c.get("significant", True) and abs(r) < 0.3:
            continue
        item = {"a": c["col1"], "b": c["col2"], "r": r, "n": c.get("n"), "q": c.get("q"),
                "strength": c.get("strength")}
        if c.get("nearDuplicate"):
            item["nearDuplicate"] = True
        s = spearman.get(frozenset((c["col1"], c["col2"])))
        if s and abs(abs(s.get("spearman", 0)) - abs(r)) >= 0.15:
            # A rank correlation well above the linear one means a monotone
            # but curved relationship — worth a sentence.
            item["spearman"] = s["spearman"]
        rows.append(_drop_none(item))
    # Monotone relationships Pearson missed entirely.
    seen = {frozenset((r["a"], r["b"])) for r in rows}
    for s in stats.spearmanCorrelations or []:
        key = frozenset((s["col1"], s["col2"]))
        if key in seen or not s.get("significant", True) or abs(s.get("spearman", 0)) < 0.3:
            continue
        rows.append(_drop_none({"a": s["col1"], "b": s["col2"], "spearman": s["spearman"],
                                "n": s.get("n"), "q": s.get("q"), "strength": s.get("strength")}))
    return rows[:8]


def _groups(stats: StatsSummary) -> List[Dict[str, Any]]:
    out = []
    for g in stats.groupComparisons or []:
        if g.get("effect") == "negligible" and not g.get("significant"):
            continue
        means = {k: v.get("mean") for k, v in list((g.get("group_stats") or {}).items())[:6]}
        out.append(_drop_none({
            "by": g.get("group_column"), "measure": g.get("metric_column"),
            "eta_squared": g.get("eta_squared"), "effect": g.get("effect"),
            "significant": g.get("significant"), "q": g.get("q_value"),
            "kruskal_p": g.get("kruskal_p"),
            "highest": g.get("highest"), "lowest": g.get("lowest"),
            "high_to_low_ratio": g.get("highToLowRatio"),
            "cohens_d": g.get("cohens_d"),
            "group_means": means,
        }))
    return out[:4]


def _findings(stats: StatsSummary) -> Dict[str, Any]:
    analyses = dict((stats.domainAnalyses or {}).get("analyses") or {})
    trend = analyses.get("trend")
    if trend:
        trend = dict(trend)
        series = trend.pop("series", None) or []
        # The last 12 points are enough to describe recent movement; the
        # full series stays in the stored context for the chat.
        trend["recent"] = {p["period"]: p["value"] for p in series[-12:]}
        analyses["trend"] = trend
    drivers = analyses.get("key_drivers")
    if drivers:
        drivers = dict(drivers)
        drivers["drivers"] = drivers.get("drivers", [])[:4]
        analyses["key_drivers"] = drivers
    return analyses


def build_digest(stats: StatsSummary, domain: DomainResult) -> Dict[str, Any]:
    key_features = list((domain.column_decisions or {}).get("key", []))
    temporal = stats.temporalInfo or {}
    source = stats.sourceFile or {}
    detail = source.get("detail") or {}
    dataset = _drop_none({
        "file_format": source.get("formatLabel"),
        # Which sheet or table was read, when the file held several: a reader
        # should know the report covers one of them.
        "read_from": detail.get("sheet") or detail.get("table") or detail.get("recordsAt"),
        "not_read": (detail.get("otherSheets") or detail.get("otherTables") or [])[:5] or None,
        "how_read": (source.get("notes") or [])[:4] or None,
        "rows": stats.rowCount,
        "columns": stats.columnCount,
        "domain": domain.domain,
        "complete_rows_pct": stats.completeRowsPct,
        "sampled_rows_for_tests": stats.sampledRows,
        "date_column": temporal.get("time_column") if temporal.get("detected") else None,
        "date_range": temporal.get("date_range") if temporal.get("detected") else None,
        "frequency": temporal.get("inferred_frequency") if temporal.get("detected") else None,
    })
    non_normal = [t["column"] for t in (stats.normalityTests or []) if not t.get("is_normal")]
    anomalies = stats.anomalyScores if isinstance(stats.anomalyScores, dict) else {}
    digest = {
        "dataset": dataset,
        "measures": _measures(stats, key_features),
        "categories": _categories(stats),
        "correlations": _correlations(stats),
        "group_differences": _groups(stats),
        "category_associations": [a for a in (stats.categoricalAssociations or []) if a.get("significant")][:4],
        "findings": _findings(stats),
        "missing_value_patterns": (stats.missingnessPatterns or [])[:4],
        "multivariate_anomalies": anomalies or None,
        "non_normal_measures": non_normal or None,
        "parsed_from_text": [
            {"column": c["column"], "written_as": c["kind"]} for c in (stats.typeConversions or [])
            if c.get("kind") != "plain"
        ] or None,
        "quality_issues": list(stats.detectedIssues or [])[:MAX_ISSUES],
    }
    return _drop_none(digest)


def digest_json(stats: StatsSummary, domain: DomainResult) -> str:
    """Compact JSON of the digest: no indentation, no spaces after separators."""
    return json.dumps(build_digest(stats, domain), separators=(",", ":"), ensure_ascii=False, default=str)
