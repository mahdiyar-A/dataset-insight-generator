"""
What each insight in a report rests on.

The writer receives everything DIG computed and writes freely. Nothing tied a
paragraph to the figure behind it, so a fluent sentence with nothing under it
read exactly like a real finding, and a reader had no way to tell them apart.

So every result the writer is shown carries an id ("F3" for a result in the
statistics, "R1" for one computed for the user's own request). Each insight
must name the ids it stands on. An insight that names none that exist is sent
back once and then left out. And the line a reader sees under each insight,
"Based on: ...", is written here from the numbers, never by the model.
"""

from __future__ import annotations

import copy
import json
import re
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple

from ai_engine.report_labels import labels_for

MAX_PER_INSIGHT = 3
_ID = re.compile(r"^[FR]\d{1,3}$")

# An entry: what kind of result it is, the result itself, and what the line
# needs from around it (the column a measure describes, a driver's target).
Entry = Dict[str, Any]


# ─────────────────────────────────────────────────────────────────────────────
# Ids on the digest
# ─────────────────────────────────────────────────────────────────────────────

def _results(digest: Dict[str, Any]) -> Iterator[Tuple[str, Dict[str, Any], Dict[str, Any], Callable[[Dict[str, Any]], None]]]:
    """
    Every result in a digest that an insight can rest on, in a fixed order, as
    (kind, result, context, put) where put(new) replaces the result in place.

    Findings come first because the prompt tells the writer to lead with them.
    """
    findings = digest.get("findings")
    if isinstance(findings, dict):
        for name in ("trend", "concentration", "repeat_entity", "group_effect"):
            if isinstance(findings.get(name), dict):
                yield name, findings[name], {}, lambda new, n=name: findings.__setitem__(n, new)
        drivers = findings.get("key_drivers")
        if isinstance(drivers, dict) and isinstance(drivers.get("drivers"), list):
            drivers = findings["key_drivers"] = dict(drivers)
            items = drivers["drivers"] = list(drivers["drivers"])
            for i, item in enumerate(items):
                if isinstance(item, dict):
                    yield "driver", item, {"target": drivers.get("target")}, lambda new, i=i, l=items: l.__setitem__(i, new)
        segments = findings.get("segments")
        if isinstance(segments, dict):
            segments = findings["segments"] = dict(segments)
            for side in ("high", "low"):
                items = segments.get(side)
                if not isinstance(items, list):
                    continue
                items = segments[side] = list(items)
                for i, item in enumerate(items):
                    if isinstance(item, dict):
                        yield "segment", item, {"target": segments.get("target"),
                                                "binary": segments.get("targetKind") == "binary"}, \
                            lambda new, i=i, l=items: l.__setitem__(i, new)

    for block, kind in (("correlations", "correlation"), ("misleading_correlations", "misleading"),
                        ("group_differences", "group_difference"), ("category_associations", "association"),
                        ("derived_columns", "derived"), ("missing_value_patterns", "missing_pattern")):
        items = digest.get(block)
        if not isinstance(items, list):
            continue
        items = digest[block] = list(items)
        for i, item in enumerate(items):
            # A calculated column is only a finding where the calculation fails.
            if isinstance(item, dict) and (kind != "derived" or item.get("mismatched_rows")):
                yield kind, item, {}, lambda new, i=i, l=items: l.__setitem__(i, new)

    if isinstance(digest.get("multivariate_anomalies"), dict) and digest["multivariate_anomalies"].get("anomalousRows"):
        yield "anomalies", digest["multivariate_anomalies"], {}, \
            lambda new: digest.__setitem__("multivariate_anomalies", new)

    for block, kind in (("measures", "measure"), ("categories", "category")):
        columns = digest.get(block)
        if not isinstance(columns, dict):
            continue
        columns = digest[block] = dict(columns)
        for column, item in list(columns.items()):
            # "Most often 2023-01-01 (1 row)" says nothing: a column whose
            # values never repeat has no most common value to stand on.
            if isinstance(item, dict) and (kind != "category" or _repeats(item)):
                yield kind, item, {"column": column}, lambda new, c=column, d=columns: d.__setitem__(c, new)


def _repeats(category: Dict[str, Any]) -> bool:
    counts = [v for v in (category.get("top") or {}).values() if isinstance(v, (int, float))]
    return bool(counts) and max(counts) > 1


def tag(digest: Dict[str, Any]) -> Dict[str, Any]:
    """
    Give every result in a freshly built digest an id, F1, F2, ... in a fixed
    order, so the same statistics always get the same ids.

    Results are copied before the id goes on: a digest holds the analysis's
    own dicts, which must not change underneath it.
    """
    number = 0
    for _, item, _, put in _results(digest):
        number += 1
        put({"id": f"F{number}", **{k: v for k, v in item.items() if k != "id"}})
    return digest


def catalog(digest: Dict[str, Any], requested: str = "") -> Dict[str, Entry]:
    """Every id a report may cite, from a tagged digest and the requests block."""
    known: Dict[str, Entry] = {}
    # A copy, because walking the digest swaps its lists for copies of their own.
    for kind, item, context, _ in _results(copy.deepcopy(digest or {})):
        if isinstance(item.get("id"), str):
            known[item["id"]] = {"kind": kind, "item": item, **context}
    for entry in _requested_entries(requested):
        known[entry["id"]] = {"kind": "requested", "item": entry}
    return known


def _requested_entries(requested: str) -> List[Dict[str, Any]]:
    try:
        entries = json.loads(requested) if requested else []
    except (TypeError, ValueError):
        return []
    return [e for e in entries if isinstance(e, dict) and isinstance(e.get("id"), str)] \
        if isinstance(entries, list) else []


# ─────────────────────────────────────────────────────────────────────────────
# Reading what the writer cited
# ─────────────────────────────────────────────────────────────────────────────

def cited(value: Any) -> List[str]:
    """The ids a reply gives, as a clean list: ["F3", "R1"] from "f3, [R1]" or a list."""
    if isinstance(value, str):
        value = re.split(r"[\s,;]+", value)
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for v in value:
        token = str(v).strip().strip("[]()\"'").upper()
        if _ID.match(token) and token not in out:
            out.append(token)
    return out


def traced(ids: Any, known: Dict[str, Entry]) -> List[str]:
    """The cited ids that name a real result, at most MAX_PER_INSIGHT."""
    return [i for i in cited(ids) if i in known][:MAX_PER_INSIGHT]


# Ids a model puts in the prose as well: "(F3)", "[F3, F7]".
_IN_TEXT = re.compile(r"\s*[\(\[]\s*[FR]\d{1,3}(?:\s*[,;/]\s*[FR]\d{1,3})*\s*[\)\]]")


def without_ids(text: str) -> str:
    return _IN_TEXT.sub("", text or "")


# ─────────────────────────────────────────────────────────────────────────────
# The line a reader sees
# ─────────────────────────────────────────────────────────────────────────────

def _num(value: Any) -> str:
    if isinstance(value, bool) or value is None:
        return str(value)
    if isinstance(value, int):
        return f"{value:,}"
    if isinstance(value, float):
        if value.is_integer() and abs(value) < 1e15:
            return f"{int(value):,}"
        if abs(value) >= 100:
            return f"{value:,.2f}".rstrip("0").rstrip(".")
        return f"{value:.3g}" if abs(value) < 1 else f"{value:,.2f}".rstrip("0").rstrip(".")
    return str(value)


def _pct(share: Any) -> str:
    """0.642 → "64.2%"."""
    try:
        return f"{float(share) * 100:.1f}".rstrip("0").rstrip(".") + "%"
    except (TypeError, ValueError):
        return str(share)


def _p(value: Any) -> str:
    return str(value) if isinstance(value, str) else _num(value)


def _group(value: Any) -> str:
    """A group difference's highest or lowest: {"group": "South", "mean": 0.44} → "South (0.44)"."""
    if isinstance(value, dict) and "group" in value:
        return f"{value['group']} ({_num(value.get('mean'))})" if value.get("mean") is not None else str(value["group"])
    return str(value)


def _segment(label: Any) -> str:
    if isinstance(label, dict):
        return ", ".join(f"{k} = {v}" for k, v in label.items())
    return str(label)


def basis(entry: Entry, language: str = "en") -> str:
    """One sentence in the report's language saying what a result is, or ""."""
    L = labels_for(language)
    kind, x = entry.get("kind"), entry.get("item") or {}
    try:
        if kind == "measure":
            return L["ev_measure"].format(column=entry["column"], mean=_num(x.get("mean")),
                                          median=_num(x.get("median")), min=_num(x.get("min")),
                                          max=_num(x.get("max")))
        if kind == "category":
            top = x.get("top") or {}
            if not top:
                return ""
            value, count = next(iter(top.items()))
            return L["ev_category"].format(column=entry["column"], top=value, count=_num(count))
        if kind == "correlation":
            r = x.get("r", x.get("spearman"))
            stat = f"r = {_num(r)}" if "r" in x else f"ρ = {_num(r)}"
            key = "ev_corr_down" if (r or 0) < 0 else "ev_corr_up"
            return L[key].format(a=x["a"], b=x["b"], stat=stat, n=_num(x.get("n")))
        if kind == "misleading":
            return L["ev_misleading"].format(a=x["a"], b=x["b"], by=x["by"], overall=_num(x.get("overall_r")),
                                             within=_num(x.get("within_groups_r")))
        if kind == "group_difference":
            return L["ev_group"].format(measure=x["measure"], by=x["by"], highest=_group(x.get("highest")),
                                        lowest=_group(x.get("lowest")), eta=_num(x.get("eta_squared")))
        if kind == "association":
            return L["ev_association"].format(a=x["col1"], b=x["col2"], v=_num(x.get("cramers_v")),
                                              n=_num(x.get("n")))
        if kind == "trend":
            key = ("ev_trend_none" if not x.get("significant") else
                   "ev_trend_up" if x.get("direction") == "rising" else
                   "ev_trend_down" if x.get("direction") == "falling" else "ev_trend_none")
            return L[key].format(measure=x["measure"], p=_p(x.get("pValue")))
        if kind == "concentration":
            return L["ev_concentration"].format(share=_pct(x.get("top2Share")), measure=x["measure"],
                                                count=_num(x.get("groupCount")), by=x["groupedBy"],
                                                top=x.get("top1"))
        if kind == "repeat_entity":
            return L["ev_repeat"].format(share=_pct(x.get("repeatShare")), entity=x["entity"],
                                         repeat=_num(x.get("repeatEntities")),
                                         distinct=_num(x.get("distinctEntities")))
        if kind == "group_effect":
            return L["ev_group_effect"].format(by=x["groupedBy"], share=_pct(x.get("etaSquared")),
                                               measure=x["measure"])
        if kind == "driver":
            stat = (f"ρ = {_num(x['rho'])}" if x.get("rho") is not None else
                    f"η² = {_num(x.get('etaSquared'))}")
            return L["ev_driver"].format(feature=x["feature"], target=entry.get("target"), stat=stat)
        if kind == "segment":
            # A yes/no target is a rate: 44.1% against 9.2%, not 0.441 against 0.0918.
            value = _pct if entry.get("binary") else _num
            return L["ev_segment"].format(segment=_segment(x.get("segment")), value=value(x.get("value")),
                                          rest=value(x.get("rest")), rows=_num(x.get("rows")))
        if kind == "derived":
            return L["ev_derived"].format(column=x["column"], formula=x.get("formula"),
                                          rows=_num(x.get("mismatched_rows")))
        if kind == "missing_pattern":
            return L["ev_missing"].format(column=x["column"], pct=f"{_num(x.get('missingPct'))}%", by=x["by"])
        if kind == "anomalies":
            return L["ev_anomalies"].format(rows=_num(x.get("anomalousRows")),
                                            pct=f"{_num(x.get('anomalousPct'))}%")
        if kind == "requested":
            return L["ev_requested"].format(asked=x.get("asked", ""))
    except (KeyError, TypeError, ValueError, IndexError):
        return ""
    return ""


def based_on(ids: List[str], known: Dict[str, Entry], language: str = "en") -> List[str]:
    """The lines for an insight's ids, each once, skipping any that cannot be said."""
    lines: List[str] = []
    for i in ids:
        line = basis(known[i], language) if i in known else ""
        if line and line not in lines:
            lines.append(line)
    return lines
