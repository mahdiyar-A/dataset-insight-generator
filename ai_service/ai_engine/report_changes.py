"""
Changes the assistant suggests to a report, from a fixed list.

The owner asks in the chat ("shorten the summary", "add an insight about
returns", "show revenue by month as a chart"). The model may answer with
changes, never with a new report: each change is one of OPS below, and every
part of it is checked here against the report as it stands before the owner
sees it. Nothing changes until the owner presses Apply, and Apply goes through
the same rebuild as a save in the editor (report_document), so a change from
the chat can do nothing an edit cannot, except two things only DIG does:

  add_insight   an insight resting on a result DIG computed (an id from the
                digest, F3 or R1) or on a lookup the assistant ran on the data
                in this same request (L1). Its "Based on" line is written here
                from that result, never by the model.
  add_chart /   a chart DIG draws from named columns, with DIG's own chart code.
  redraw_chart  The model names columns and a kind of chart; it draws nothing.

What a model can never do through this: change a figure DIG measured or a
"Based on" line, touch the facts, or change more than MAX_CHANGES parts of the
report at once.
"""
from __future__ import annotations

import base64
import copy
import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from ai_engine.charts.chart_generator import DRAWABLE, draw_chart
from ai_engine.llm.evidence import _num, based_on, catalog, cited
from ai_engine.llm.guard import clean_user_text, one_line
from ai_engine.llm.query_tools import QueryError, resolve_column
from ai_engine.models.models import ChartInstruction
from ai_engine.report_document import (
    MAX_CAPTION, MAX_CHART_FILES, MAX_PARAGRAPH, MAX_REPORT_CHARTS, MAX_TITLE, TEXT_FIELDS, added_of,
)
from ai_engine.report_labels import labels_for

OPS = ("set_text", "set_insight", "move_insight", "remove_insight", "set_chart", "remove_chart",
       "set_answer", "add_insight", "add_chart", "redraw_chart")
MAX_CHANGES = 3
MAX_INSIGHTS = 10
MAX_LOOKUP_LINE = 220
AGGREGATES = ("sum", "mean")
NEW_CHART_COLOR = "#38bdf8"

MENU = f"""Each change is one JSON object. At most {MAX_CHANGES} in one reply.
  {{"op": "set_text", "field": "reportTitle|introduction|executiveSummary|conclusion|dataQualitySection|assumptions", "text": "..."}}
  {{"op": "set_insight", "id": "i2", "title": "...", "body": "..."}}       (title or body or both)
  {{"op": "move_insight", "id": "i2", "to": 1}}                              (1 = first)
  {{"op": "remove_insight", "id": "i3"}}
  {{"op": "set_chart", "file": 0, "label": "...", "desc": "...", "insight": "i2"}}   (any of label, desc, insight; insight null = at the end)
  {{"op": "remove_chart", "file": 1}}
  {{"op": "set_answer", "id": "q1", "answer": "..."}}
  {{"op": "add_insight", "title": "...", "body": "...", "restsOn": ["F7"], "after": "i2"}}
        restsOn: ids of results in the ANALYSIS (F.., R..) or of QUERY RESULTS from this request (L1..). Required.
  {{"op": "add_chart", "chart": {{"type": "bar|line|scatter|histogram|box|grouped_bar", "x": col, "y": col, "group": col, "agg": "sum|mean"}},
        "label": "...", "desc": "...", "insight": "i2"}}
        bar: x = categories, y = a number (or none to count rows). line: x = dates, y = a number.
        scatter: x and y numbers. histogram: x a number. box: x categories, y a number.
        grouped_bar: x and group categories, y a number. agg: total (sum) or average (mean).
  {{"op": "redraw_chart", "file": 0, "type": "bar|line|scatter|histogram|box|grouped_bar"}}"""


class Rejected(ValueError):
    """A change that cannot be made. The message goes back to the model."""


# ─────────────────────────────────────────────────────────────────────────────
# Lookups run in this request
# ─────────────────────────────────────────────────────────────────────────────

def lookups_of(ran: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """{"L1": {"query", "result"}} for each lookup the assistant ran, in order."""
    return {f"L{k + 1}": item for k, item in enumerate(ran or [])}


def _filters(result: Dict[str, Any]) -> str:
    filters = result.get("filters") or []
    return f" | {'; '.join(str(f) for f in filters)}" if filters else ""


def _groups(rows: Any, value_key: Optional[str]) -> str:
    out = []
    for row in (rows or [])[:3]:
        if not isinstance(row, dict):
            continue
        values = list(row.items())
        if value_key and value_key in row:
            label = " ".join(str(v) for k, v in values if k not in (value_key, "rows"))
            out.append(f"{label} {_num(row[value_key])}")
        else:
            out.append(" ".join(str(_num(v)) for _, v in values))
    return " · ".join(out)


def lookup_line(lookup: Dict[str, Any], language: str = "en") -> str:
    """What a lookup found, as the "Based on" line under an insight. "" if it found nothing."""
    query, result = lookup.get("query") or {}, lookup.get("result") or {}
    if not isinstance(result, dict) or result.get("error"):
        return ""
    op = result.get("op")
    where = _filters(result)
    try:
        if op == "aggregate":
            agg, measure = query.get("agg", "sum"), result.get("measure") or query.get("measure")
            if "value" in result:
                what = f"{agg}({measure}){where} = {_num(result['value'])}"
            else:
                by = query.get("by") or []
                by = ", ".join(by if isinstance(by, list) else [by])
                what = f"{agg}({measure}) / {by}{where}: {_groups(result.get('rows'), f'{agg}_{measure}')}"
        elif op == "count":
            what = (f"rows{where} = {_num(result['rows'])}" if isinstance(result.get("rows"), int)
                    else f"rows{where}: {_groups(result.get('rows'), 'rows')}")
        elif op == "describe":
            if result.get("kind") == "number":
                what = (f"{result['column']}{where}: mean = {_num(result.get('mean'))}, "
                        f"median = {_num(result.get('50%'))}, min = {_num(result.get('min'))}, "
                        f"max = {_num(result.get('max'))}")
            else:
                what = f"{result['column']}{where}: {result.get('most_common')} ({_num(result.get('most_common_count'))})"
        elif op == "top_values":
            what = f"{result['column']}{where}: " + " · ".join(
                f"{r.get('value')} {_num(r.get('rows'))}" for r in (result.get("rows") or [])[:3])
        elif op == "correlation":
            if result.get("pearson") is None:
                return ""
            what = f"{result['a']} ~ {result['b']}{where}: r = {_num(result['pearson'])}, n = {_num(result.get('n'))}"
        elif op == "trend":
            rows = result.get("rows") or []
            if not rows:
                return ""
            what = (f"{result.get('agg')}({result.get('measure')}) / {result.get('period')}: "
                    f"{rows[0]['period']} {_num(rows[0]['value'])} → {rows[-1]['period']} {_num(rows[-1]['value'])}")
        else:
            return ""
    except (KeyError, TypeError, IndexError):
        return ""
    return labels_for(language)["ev_lookup"].format(what=what)[:MAX_LOOKUP_LINE]


# ─────────────────────────────────────────────────────────────────────────────
# Checking what the model proposed
# ─────────────────────────────────────────────────────────────────────────────

def _text(value: Any, field: str = "") -> str:
    if not isinstance(value, str):
        return ""
    return one_line(value, MAX_TITLE) if field in ("reportTitle", "title") else clean_user_text(value, MAX_PARAGRAPH)


def _caption(value: Any) -> Optional[str]:
    return one_line(value, MAX_CAPTION) if isinstance(value, str) else None


def _file(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _column(df: pd.DataFrame, name: Any, role: str, numeric: bool = False) -> str:
    try:
        column = resolve_column(df, name)
    except QueryError as exc:
        raise Rejected(f"{role}: {exc}")
    if numeric and not pd.api.types.is_numeric_dtype(df[column]):
        raise Rejected(f"{role}: {column!r} is not a number column.")
    return column


def chart_spec(df: Optional[pd.DataFrame], raw: Any) -> Dict[str, Any]:
    """A chart request with its columns checked against the data, or Rejected."""
    if df is None or df.empty:
        raise Rejected("The data file is not available here, so no chart can be drawn.")
    if not isinstance(raw, dict):
        raise Rejected("'chart' must be an object.")
    kind = str(raw.get("type") or "").lower()
    if kind not in DRAWABLE:
        raise Rejected(f"Chart type {kind!r} is not on the menu: {', '.join(DRAWABLE)}.")
    agg = raw.get("agg") if raw.get("agg") in AGGREGATES else "mean"
    x = _column(df, raw.get("x"), "x", numeric=kind in ("scatter", "histogram"))
    y = group = None
    if kind in ("scatter", "box", "grouped_bar"):
        y = _column(df, raw.get("y"), "y", numeric=True)
    elif kind in ("bar", "line") and raw.get("y"):
        y = _column(df, raw.get("y"), "y", numeric=True)
    if kind == "grouped_bar":
        group = _column(df, raw.get("group"), "group")
        if group in (x, y):
            raise Rejected("group must be a different column from x and y.")
    if y is not None and y == x:
        raise Rejected("x and y must be different columns.")
    return {"type": kind, "x": x, "y": y, "group": group, "agg": agg if y else ""}


def _instruction(spec: Dict[str, Any], label: str, desc: str) -> ChartInstruction:
    return ChartInstruction(index=0, chartType=spec["type"], title=label, xColumn=spec["x"],
                            yColumn=spec.get("y"), description=desc, insightIndex=0, color=NEW_CHART_COLOR,
                            groupColumn=spec.get("group"), aggregate=spec.get("agg") or "")


def _style(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The chart style of the look the report was made in, or None for one made before looks."""
    look = ((doc or {}).get("facts") or {}).get("look")
    if not isinstance(look, dict):
        return None
    from ai_engine.design.looks import look_from_dict
    return look_from_dict(look).chart_style()


def draw(df: pd.DataFrame, spec: Dict[str, Any], label: str, desc: str = "",
         doc: Optional[Dict[str, Any]] = None) -> str:
    """The picture for a checked chart request, as base64 PNG, or Rejected."""
    picture = draw_chart(df, _instruction(spec, label, desc), _style(doc))
    if not picture:
        raise Rejected(f"A {spec['type']} chart of {spec['x']}"
                       f"{' and ' + spec['y'] if spec.get('y') else ''} could not be drawn from this data.")
    return picture


def _redraw_spec(chart: Dict[str, Any], kind: str, df: Optional[pd.DataFrame]) -> Dict[str, Any]:
    spec = chart.get("spec")
    if not isinstance(spec, dict) or not spec.get("x"):
        raise Rejected(f"Chart {chart['file']} cannot be drawn again: DIG does not know its columns.")
    return chart_spec(df, {"type": kind, "x": spec.get("x"), "y": spec.get("y"),
                           "group": spec.get("group"), "agg": spec.get("aggregate") or None})


def check(raw: Any, doc: Dict[str, Any], *, context: Optional[Dict[str, Any]] = None,
          lookups: Optional[Dict[str, Dict[str, Any]]] = None, df: Optional[pd.DataFrame] = None,
          language: str = "en") -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    The changes that can be made to `doc`, cleaned, and a sentence for each
    that cannot. Charts are drawn here, so a chart that cannot be drawn is a
    problem the model hears about rather than a broken card.
    """
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        return [], ["'changes' must be a list of change objects."]

    insights = {i["id"]: (k + 1, i) for k, i in enumerate(doc.get("insights") or [])}
    charts = {c["file"]: c for c in doc.get("charts") or []}
    answers = {qa["id"]: qa for qa in doc.get("questionAnswers") or []}
    context = context or {}
    known = catalog(context.get("digest") or {}, _requested(context))
    lookups = lookups or {}

    accepted: List[Dict[str, Any]] = []
    problems: List[str] = []
    removed_insights, chart_count, insight_count = set(), len(charts), len(insights)
    for k, item in enumerate(raw):
        if len(accepted) >= MAX_CHANGES:
            problems.append(f"Only {MAX_CHANGES} changes fit in one suggestion; the rest were left out.")
            break
        try:
            if not isinstance(item, dict) or item.get("op") not in OPS:
                raise Rejected(f"op must be one of: {', '.join(OPS)}.")
            change = _check_one(item, doc, insights, charts, answers, known, lookups, df, language)
            if change["op"] == "remove_insight":
                if change["id"] in removed_insights:
                    raise Rejected("That insight is already being removed.")
                if insight_count - 1 < 1:
                    raise Rejected("A report keeps at least one insight.")
                removed_insights.add(change["id"])
                insight_count -= 1
            elif change["op"] == "add_insight":
                if insight_count + 1 > MAX_INSIGHTS:
                    raise Rejected(f"A report holds at most {MAX_INSIGHTS} insights.")
                insight_count += 1
            elif change["op"] == "add_chart":
                if chart_count + 1 > MAX_REPORT_CHARTS:
                    raise Rejected(f"A report holds at most {MAX_REPORT_CHARTS} charts; remove one first.")
                chart_count += 1
            elif change["op"] == "remove_chart":
                chart_count -= 1
            accepted.append(change)
        except Rejected as exc:
            problems.append(f"Change {k + 1} ({item.get('op') if isinstance(item, dict) else '?'}): {exc}")
    return accepted, problems


def _requested(context: Dict[str, Any]) -> str:
    import json
    requested = context.get("requested")
    return json.dumps(requested) if isinstance(requested, list) else ""


def _check_one(item, doc, insights, charts, answers, known, lookups, df, language) -> Dict[str, Any]:
    op = item["op"]
    if op == "set_text":
        field = item.get("field")
        if field not in TEXT_FIELDS:
            raise Rejected(f"field must be one of: {', '.join(TEXT_FIELDS)}.")
        text = _text(item.get("text"), field)
        if not text:
            raise Rejected("text is empty.")
        if text == (doc.get("text") or {}).get(field):
            raise Rejected("text is the same as the report's.")
        return {"op": op, "field": field, "text": text}

    if op in ("set_insight", "move_insight", "remove_insight"):
        iid = item.get("id")
        if iid not in insights:
            raise Rejected(f"There is no insight {iid!r}. Insights: {', '.join(insights)}.")
        if op == "remove_insight":
            return {"op": op, "id": iid}
        if op == "move_insight":
            to = _file(item.get("to"))
            if to is None or not 1 <= to <= len(insights):
                raise Rejected(f"to must be a place from 1 to {len(insights)}.")
            if to == insights[iid][0]:
                raise Rejected("The insight is already there.")
            return {"op": op, "id": iid, "to": to}
        title, body = _text(item.get("title"), "title"), _text(item.get("body"))
        current = insights[iid][1]
        change = {"op": op, "id": iid}
        if title and title != current.get("title"):
            change["title"] = title
        if body and body != current.get("body"):
            change["body"] = body
        if len(change) == 2:
            raise Rejected("Give a new title or body.")
        return change

    if op in ("set_chart", "remove_chart", "redraw_chart"):
        file_no = _file(item.get("file"))
        if file_no not in charts:
            raise Rejected(f"There is no chart {item.get('file')!r}. Charts: {', '.join(map(str, charts))}.")
        if op == "remove_chart":
            return {"op": op, "file": file_no}
        if op == "redraw_chart":
            kind = str(item.get("type") or "").lower()
            if kind == charts[file_no].get("type"):
                raise Rejected(f"The chart is already a {kind} chart.")
            spec = _redraw_spec(charts[file_no], kind, df)
            picture = draw(df, spec, charts[file_no].get("label") or "", charts[file_no].get("desc") or "", doc)
            return {"op": op, "file": file_no, "chart": spec, "picture": picture}
        change = {"op": op, "file": file_no}
        label, desc = _caption(item.get("label")), _caption(item.get("desc"))
        if label:
            change["label"] = label
        if desc is not None and desc != charts[file_no].get("desc"):
            change["desc"] = desc
        if "insight" in item:
            owner = item.get("insight")
            if owner is not None and owner not in insights:
                raise Rejected(f"There is no insight {owner!r} to put it under.")
            if owner != charts[file_no].get("insight"):
                change["insight"] = owner
        if len(change) == 2:
            raise Rejected("Nothing would change.")
        return change

    if op == "set_answer":
        qid = item.get("id")
        if qid not in answers:
            raise Rejected(f"There is no answer {qid!r}.")
        answer = _text(item.get("answer"))
        if not answer:
            raise Rejected("answer is empty.")
        return {"op": op, "id": qid, "answer": answer}

    if op == "add_insight":
        title, body = _text(item.get("title"), "title"), _text(item.get("body"))
        if not title or not body:
            raise Rejected("A new insight needs a title and a body.")
        ids = cited(item.get("restsOn"))
        lookup_ids = [str(x).strip().upper() for x in (item.get("restsOn") or [])
                      if isinstance(x, str) and str(x).strip().upper() in lookups]
        rests_on = [i for i in ids if i in known][:3]
        lines = based_on(rests_on, known, language)
        lines += [line for line in (lookup_line(lookups[i], language) for i in lookup_ids[:3]) if line]
        if not lines:
            raise Rejected("restsOn must name a result in the ANALYSIS (F.., R..) or a lookup from this "
                           "request (L..). A new insight cannot rest on nothing.")
        after = item.get("after")
        return {"op": op, "title": title, "body": body, "restsOn": rests_on,
                "basedOn": list(dict.fromkeys(lines)), "after": after if after in insights else None}

    # add_chart
    label = _caption(item.get("label"))
    if not label:
        raise Rejected("A new chart needs a label.")
    desc = _caption(item.get("desc")) or ""
    owner = item.get("insight")
    if owner is not None and owner not in insights:
        raise Rejected(f"There is no insight {owner!r} to put it under.")
    spec = chart_spec(df, item.get("chart"))
    picture = draw(df, spec, label, desc, doc)
    return {"op": "add_chart", "chart": spec, "label": label, "desc": desc, "insight": owner,
            "picture": picture}


def texts(change: Dict[str, Any]) -> List[str]:
    """Words in a change a reader takes as fact, for the figure check."""
    return [change[k] for k in ("text", "title", "body", "answer", "label", "desc")
            if isinstance(change.get(k), str) and change[k]]


# ─────────────────────────────────────────────────────────────────────────────
# What the owner sees before Apply
# ─────────────────────────────────────────────────────────────────────────────

def preview(change: Dict[str, Any], doc: Dict[str, Any]) -> Dict[str, Any]:
    """The change as the card shows it: where, what it says now, what it would say."""
    op = change["op"]
    insights = {i["id"]: (k + 1, i) for k, i in enumerate(doc.get("insights") or [])}
    charts = {c["file"]: c for c in doc.get("charts") or []}
    out: Dict[str, Any] = {"op": op}
    if op == "set_text":
        out.update(section=change["field"], before=(doc.get("text") or {}).get(change["field"], ""),
                   after=change["text"])
    elif op in ("set_insight", "move_insight", "remove_insight"):
        position, ins = insights[change["id"]]
        out.update(position=position, title=ins.get("title", ""))
        if op == "set_insight":
            out.update(beforeTitle=ins.get("title", ""), afterTitle=change.get("title", ins.get("title", "")),
                       before=ins.get("body", ""), after=change.get("body", ins.get("body", "")))
        if op == "move_insight":
            out["to"] = change["to"]
    elif op in ("set_chart", "remove_chart", "redraw_chart"):
        chart = charts[change["file"]]
        out.update(chart=chart.get("label", ""))
        if op == "set_chart":
            out.update(beforeLabel=chart.get("label", ""), afterLabel=change.get("label", chart.get("label", "")),
                       before=chart.get("desc", ""), after=change.get("desc", chart.get("desc", "")))
            if "insight" in change:
                out["under"] = insights[change["insight"]][0] if change["insight"] else None
        if op == "redraw_chart":
            out["type"] = change["chart"]["type"]
    elif op == "set_answer":
        qa = next(q for q in doc.get("questionAnswers") or [] if q["id"] == change["id"])
        out.update(question=qa.get("question", ""), before=qa.get("answer", ""), after=change["answer"])
    elif op == "add_insight":
        out.update(title=change["title"], after=change["body"], basedOn=change["basedOn"],
                   position=(insights[change["after"]][0] + 1) if change.get("after") else len(insights) + 1)
    elif op == "add_chart":
        out.update(chart=change["label"], after=change["desc"], type=change["chart"]["type"],
                   under=insights[change["insight"]][0] if change.get("insight") else None)
    # A new picture travels once, inside the change; the backend shows it from there.
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Applying
# ─────────────────────────────────────────────────────────────────────────────

def _editable(doc: Dict[str, Any]) -> Dict[str, Any]:
    """A stored version in the shape an edit takes."""
    return {
        "text": dict(doc.get("text") or {}),
        "insights": [{"id": i["id"], "title": i.get("title", ""), "body": i.get("body", "")}
                     for i in doc.get("insights") or []],
        "charts": [{"file": c["file"], "label": c.get("label", ""), "desc": c.get("desc", ""),
                    "insight": c.get("insight")} for c in doc.get("charts") or []],
        "questionAnswers": [{"id": q["id"], "answer": q.get("answer", "")} for q in doc.get("questionAnswers") or []],
    }


def _next_insight_id(added: Dict[str, Any]) -> str:
    numbers = [int(i["id"][1:]) for i in added["insights"]
               if isinstance(i.get("id"), str) and i["id"][:1] == "a" and i["id"][1:].isdigit()]
    return f"a{max(numbers, default=0) + 1}"


def _next_file(original: Dict[str, Any], added: Dict[str, Any]) -> int:
    used = [c.get("file") for c in [*(original.get("charts") or []), *added["charts"]]]
    number = max([u for u in used if isinstance(u, int) and not isinstance(u, bool)], default=-1) + 1
    if number >= MAX_CHART_FILES:
        raise Rejected("This analysis already holds as many chart pictures as it can.")
    return number


def apply(current: Dict[str, Any], original: Dict[str, Any],
          changes: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[int, int]]:
    """
    The edit that makes `changes` to `current` (the newest version), what DIG
    has added once they are made, and the file number each new picture takes
    (by the change's position in the list).

    The result goes through report_document.apply_edits like any edit. A
    change that no longer fits the report (its insight is gone) is skipped.
    """
    edited = _editable(current)
    added = copy.deepcopy(added_of(current))
    new_files: Dict[int, int] = {}
    insights, charts = edited["insights"], edited["charts"]

    def find(items, key, value):
        return next((k for k, x in enumerate(items) if x.get(key) == value), None)

    for k, change in enumerate(changes or []):
        op = change.get("op")
        if op == "set_text" and change.get("field") in TEXT_FIELDS:
            edited["text"][change["field"]] = change["text"]
        elif op in ("set_insight", "move_insight", "remove_insight"):
            at = find(insights, "id", change.get("id"))
            if at is None:
                continue
            if op == "set_insight":
                insights[at].update({f: change[f] for f in ("title", "body") if change.get(f)})
            elif op == "move_insight":
                item = insights.pop(at)
                insights.insert(max(0, min(len(insights), int(change["to"]) - 1)), item)
            elif len(insights) > 1:
                insights.pop(at)
        elif op in ("set_chart", "remove_chart"):
            at = find(charts, "file", change.get("file"))
            if at is None:
                continue
            if op == "remove_chart":
                charts.pop(at)
            else:
                charts[at].update({f: change[f] for f in ("label", "desc", "insight") if f in change})
        elif op == "set_answer":
            at = find(edited["questionAnswers"], "id", change.get("id"))
            if at is not None:
                edited["questionAnswers"][at]["answer"] = change["answer"]
        elif op == "add_insight":
            new = {"id": _next_insight_id(added), "title": change["title"], "body": change["body"],
                   "restsOn": list(change.get("restsOn") or []), "basedOn": list(change.get("basedOn") or []),
                   "by": "assistant"}
            added["insights"].append(new)
            at = find(insights, "id", change.get("after"))
            insights.insert(len(insights) if at is None else at + 1,
                            {"id": new["id"], "title": new["title"], "body": new["body"]})
        elif op in ("add_chart", "redraw_chart"):
            file_no = _next_file(original, added)
            spec = change["chart"]
            if op == "redraw_chart":
                at = find(charts, "file", change.get("file"))
                if at is None:
                    continue
                old = charts[at]
                label, desc, owner = old["label"], old["desc"], old["insight"]
            else:
                at, label, desc, owner = None, change["label"], change.get("desc", ""), change.get("insight")
            added["charts"].append({
                "file": file_no, "type": spec["type"], "label": label, "desc": desc, "color": NEW_CHART_COLOR,
                "insight": owner, "by": "assistant",
                "spec": {"x": spec["x"], "y": spec.get("y"), "group": spec.get("group"), "yColumns": [],
                         "aggregate": spec.get("agg") or ""},
            })
            entry = {"file": file_no, "label": label, "desc": desc, "insight": owner}
            if at is None:
                charts.append(entry)
            else:
                charts[at] = entry
            new_files[k] = file_no
    return edited, added, new_files


def picture_bytes(change: Dict[str, Any]) -> Optional[bytes]:
    picture = change.get("picture")
    if not isinstance(picture, str) or not picture:
        return None
    try:
        return base64.b64decode(picture, validate=True)
    except ValueError:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Next steps, chosen without a model
# ─────────────────────────────────────────────────────────────────────────────

# For each kind of computed result: the columns it is about, and the chart
# that shows it, when one does.
def _about(kind: str, entry: Dict[str, Any]) -> Tuple[List[str], Optional[Dict[str, Any]], str]:
    x = entry.get("item") or {}
    if kind == "trend" and x.get("measure") and x.get("dateColumn"):
        # "Add a chart: patient_age over time" was offered for a flat line of
        # summed ages. Only a real trend is offered, drawn the way it was
        # measured (totals or averages).
        if x.get("significant") is False or x.get("direction") == "flat":
            return [], None, ""
        agg = "mean" if x.get("aggregation") == "mean" else "sum"
        return [x["measure"]], {"type": "line", "x": x["dateColumn"], "y": x["measure"], "agg": agg}, "trend"
    if kind in ("correlation", "misleading") and x.get("a") and x.get("b"):
        return [x["a"], x["b"]], {"type": "scatter", "x": x["a"], "y": x["b"]}, "relation"
    if kind == "group_difference" and x.get("measure") and x.get("by"):
        return [x["measure"], x["by"]], {"type": "box", "x": x["by"], "y": x["measure"]}, "compare"
    if kind in ("concentration", "group_effect") and x.get("measure") and x.get("groupedBy"):
        return ([x["measure"], x["groupedBy"]],
                {"type": "bar", "x": x["groupedBy"], "y": x["measure"],
                 "agg": "sum" if kind == "concentration" else "mean"}, "compare")
    if kind == "driver" and x.get("feature") and entry.get("target"):
        return [x["feature"], entry["target"]], None, "relation"
    if kind == "association" and x.get("col1") and x.get("col2"):
        return [x["col1"], x["col2"]], None, "relation"
    return [], None, ""


def _shown(doc: Dict[str, Any]) -> List[Tuple[Any, Any]]:
    shown = []
    for chart in [*(doc.get("charts") or [])]:
        spec = chart.get("spec") or {}
        shown.append((spec.get("x"), spec.get("y")))
    return shown


def chart_label(what: str, chart: Dict[str, Any], language: str = "en") -> str:
    """A title for a chart DIG offers to add, in the report's language."""
    pattern = labels_for(language).get(f"chart_{what}") or labels_for("en").get(f"chart_{what}", "{y}")
    x, y = _as_words(chart.get("x")), _as_words(chart.get("y") or chart.get("x"))
    return pattern.format(x=x, y=y)[:MAX_TITLE]


def _as_words(column: Any) -> str:
    """"patient_age" as "patient age", for a title a person reads."""
    return re.sub(r"\s+", " ", str(column or "").replace("_", " ")).strip()


def next_steps(doc: Dict[str, Any], context: Dict[str, Any], limit: int = 4) -> List[Dict[str, Any]]:
    """
    What the owner might do next with this report, from what DIG computed and
    the report does not use yet. No model is asked; the page words them. A
    chart step carries the title the chart would get, in the report's language.
    """
    known = catalog((context or {}).get("digest") or {}, _requested(context or {}))
    used = {i for ins in doc.get("insights") or [] for i in (ins.get("restsOn") or [])}
    shown = _shown(doc)
    room = MAX_REPORT_CHARTS - len(doc.get("charts") or [])
    language = str(((doc.get("facts") or {}).get("language")) or "en")
    insight_steps, chart_steps = [], []
    for rid, entry in known.items():
        if rid in used:
            continue
        about, chart, what = _about(entry.get("kind", ""), entry)
        if not about:
            continue
        if len(insight_steps) < 2 and not any(s["about"] == about for s in insight_steps):
            insight_steps.append({"kind": "ask", "what": "insight", "about": about})
        if (chart and room > len(chart_steps) and len(chart_steps) < 2
                and (chart["x"], chart.get("y")) not in shown
                and not any(s["chart"] == chart for s in chart_steps)):
            chart_steps.append({"kind": "chart", "what": what, "about": about, "chart": chart,
                                "label": chart_label(what, chart, language)})
    steps = [*insight_steps, *chart_steps]
    summary = (doc.get("text") or {}).get("executiveSummary") or ""
    if len(summary.split()) > 90:
        steps.append({"kind": "ask", "what": "shorten", "section": "executiveSummary"})
    return steps[:limit]
