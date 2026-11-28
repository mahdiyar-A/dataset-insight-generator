"""
The report as a document a person can edit.

An analysis ends with a report whose words used to live only inside the PDF,
Word and PowerPoint files. This module turns the report into a plain JSON
document that is saved with the analysis, edited in DIG, and turned back into
the same files without asking any model.

The document has four kinds of content:

  text             report title, introduction, summary, conclusion, the
                   data-quality section and the user's assumptions. Editable.
  insights         each with a fixed id, an editable title and body, and the
                   computed results it rests on, which are not editable.
                   Their order is editable and one can be removed.
  charts           each picture is fixed; its title, caption and the insight it
                   sits under are editable, and one can be removed.
  questionAnswers  the user's own questions are fixed; the answers are editable.
  facts            what DIG measured: rows, columns, confidence, cleaning
                   notes, the headline figures, who the report is for and
                   the look its files are made in. Never editable.

An edit is applied to the ORIGINAL document, version 1, never to whatever the
person sent: only the editable parts are taken from the edit, every fixed part
is copied from the original. Ids come from the original too, so going back to
an older version can bring back an insight a later version removed, while no
edit can add an insight that rests on nothing.

The one way in for something new is DIG itself. When the owner applies a
change the assistant suggested (report_changes), an insight it added, resting
on a computed result, or a chart DIG drew, goes into `added`: a list that only
grows, is carried from version to version by the server, and is never read
from an edit. An edit may place, reword or remove what is in it, exactly as
for what DIG first wrote.
"""
from __future__ import annotations

import base64
import copy
import json
from typing import Any, Dict, Iterable, List, Optional, Tuple

from ai_engine.llm.guard import clean_user_text, one_line, ungrounded_numbers
from ai_engine.models.models import DomainResult, LLMReport

SCHEMA = 1

# The report's free text, in the order a reader meets it.
TEXT_FIELDS = ("reportTitle", "introduction", "executiveSummary", "conclusion",
               "dataQualitySection", "assumptions")

# Longest text kept for each kind of field. Generous: a model writes a few
# hundred words per section, and a person may write more.
MAX_TITLE = 300
MAX_PARAGRAPH = 12_000
MAX_CAPTION = 1_000

# Charts an analysis draws: the backend stores at most this many from a run.
MAX_CHARTS = 5

# Charts a report can show once the owner adds some, and the picture files an
# analysis can hold (chart_0.png to chart_19.png). A removed chart keeps its
# file, so a later version can put it back.
MAX_REPORT_CHARTS = 8
MAX_CHART_FILES = 20


class EditRejected(ValueError):
    """An edit that cannot become a report. `code` is what the backend shows."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


# ─────────────────────────────────────────────────────────────────────────────
# From the analysis
# ─────────────────────────────────────────────────────────────────────────────

def _int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _strings(values: Any) -> List[str]:
    return [str(v) for v in (values or []) if v is not None and str(v) != ""]


def _figure(value: Any) -> Optional[Dict[str, str]]:
    if not isinstance(value, dict) or not str(value.get("value") or "").strip():
        return None
    return {"value": one_line(str(value.get("value")), 24), "label": one_line(str(value.get("label") or ""), 60)}


def build(report: LLMReport, charts: List[Dict[str, Any]], *, stats: Any, domain: Optional[DomainResult],
          was_cleaned: bool, dropped_columns: Optional[List[str]], file_name: str, language: str,
          confidence_score: int, confidence_level: str, look: Any = None, reading: Any = None) -> Dict[str, Any]:
    """The document for a report the pipeline has just written: version 1."""
    insights, owner = [], {}
    for k, ins in enumerate(report.insights or []):
        iid = f"i{k + 1}"
        # A chart names the insight it illustrates by that insight's index,
        # or by its rank when the model gave none: the same rule the builders use.
        owner.setdefault(_int(ins.get("insight_index") or ins.get("rank")), iid)
        insights.append({
            "id": iid,
            "title": str(ins.get("title") or ""),
            "body": str(ins.get("body") or ""),
            "restsOn": _strings(ins.get("restsOn")),
            "basedOn": _strings(ins.get("basedOn")),
            **({"strength": str(ins["strength"])} if ins.get("strength") else {}),
            **({"highlight": _figure(ins.get("highlight"))} if _figure(ins.get("highlight")) else {}),
            # The kind of finding it rests on. When someone deletes or rewrites
            # the insight, the backend counts it against this kind, and nothing
            # else (llm/feedback.py).
            **({"kind": str(ins["findingKind"])} if ins.get("findingKind") else {}),
        })

    # Position i is the picture the backend stores as chart_{i}.png.
    chart_list = [{
        "file": i,
        "type": str(ch.get("type") or ""),
        "label": str(ch.get("label") or ""),
        "desc": str(ch.get("desc") or ""),
        "color": str(ch.get("color") or ""),
        "insight": owner.get(_int(ch.get("insight_index"))),
        # The columns it was drawn from, so it can be drawn again as another kind.
        **({"spec": dict(ch["spec"])} if isinstance(ch.get("spec"), dict) else {}),
    } for i, ch in enumerate((charts or [])[:MAX_CHARTS])]

    answers = [{
        "id": f"q{k + 1}",
        "question": str(qa.get("question") or ""),
        "answer": str(qa.get("answer") or ""),
        "answerable": bool(qa.get("answerable", True)),
    } for k, qa in enumerate(getattr(report, "questionAnswers", None) or [])]

    return {
        "schema": SCHEMA,
        "text": {f: str(getattr(report, f, "") or "") for f in TEXT_FIELDS},
        "insights": insights,
        "charts": chart_list,
        "questionAnswers": answers,
        "facts": {
            "fileName": file_name,
            "language": language,
            "rowCount": getattr(stats, "rowCount", None),
            "columnCount": getattr(stats, "columnCount", None),
            "detectedIssues": _strings(getattr(stats, "detectedIssues", None)),
            "wasCleaned": bool(was_cleaned),
            "droppedColumns": _strings(dropped_columns),
            "domain": {
                "domain": (domain.domain if domain else "") or "general",
                "keyIssues": _strings(domain.key_issues if domain else None),
                "cleaningMethods": _strings(domain.cleaning_methods if domain else None),
                "description": str(getattr(domain, "description", "") or "")[:300] if domain else "",
            },
            "confidenceScore": _int(confidence_score) or 6,
            "confidenceLevel": str(confidence_level or "MEDIUM"),
            "confidenceNote": str(report.confidenceNote or ""),
            "writerModel": str(getattr(report, "writerModel", "") or ""),
            "writerScore": _int(getattr(report, "geminiConfidenceScore", 0)),
            "keyNumbers": [f for f in (_figure(k) for k in getattr(report, "keyNumbers", None) or []) if f],
            **({"look": look.to_dict()} if look is not None else {}),
            **({"reading": reading.to_dict()} if reading is not None else {}),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# An edit
# ─────────────────────────────────────────────────────────────────────────────

def _paragraph(value: Any) -> Optional[str]:
    return clean_user_text(value, MAX_PARAGRAPH) if isinstance(value, str) else None


def _line(value: Any, max_len: int) -> Optional[str]:
    return one_line(value, max_len) if isinstance(value, str) else None


def _list(value: Any) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(value, list):
        return None
    return [x for x in value if isinstance(x, dict)]


def added_of(document: Any) -> Dict[str, List[Dict[str, Any]]]:
    """What DIG added to a report since it was written, from a stored version."""
    added = document.get("added") if isinstance(document, dict) else None
    added = added if isinstance(added, dict) else {}
    return {"insights": _list(added.get("insights")) or [], "charts": _list(added.get("charts")) or []}


def apply_edits(original: Dict[str, Any], edited: Any,
                added: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    The document `edited` describes, built on `original` (version 1).

    Takes only what a person may change from `edited`; anything missing,
    malformed or unknown is left as the original had it. A required field left
    empty (the report title, an insight's title or text) keeps the original's.

    `added` is what DIG added since (see added_of), from the server's newest
    version. Its insights and charts may be placed like the original's; an
    `added` inside `edited` is ignored.
    """
    extra = added_of({"added": added})
    doc = copy.deepcopy(original)
    if extra["insights"] or extra["charts"]:
        doc["added"] = copy.deepcopy(extra)
    if not isinstance(edited, dict):
        return doc

    # ── Free text ────────────────────────────────────────────────────────────
    text = edited.get("text") if isinstance(edited.get("text"), dict) else {}
    for field_name in TEXT_FIELDS:
        cleaned = (_line(text.get(field_name), MAX_TITLE) if field_name == "reportTitle"
                   else _paragraph(text.get(field_name)))
        if cleaned is None:
            continue
        if field_name == "reportTitle" and not cleaned:
            continue
        doc["text"][field_name] = cleaned

    # ── Insights: order, removal, title and body ─────────────────────────────
    known = {i["id"]: i for i in [*(original.get("insights") or []), *extra["insights"]]
             if isinstance(i.get("id"), str)}
    sent = _list(edited.get("insights"))
    if sent is not None:
        kept, seen = [], set()
        for item in sent:
            iid = item.get("id")
            if iid not in known or iid in seen:
                continue
            seen.add(iid)
            base = known[iid]
            title = _line(item.get("title"), MAX_TITLE)
            body = _paragraph(item.get("body"))
            kept.append({**copy.deepcopy(base),
                         "title": title or base["title"],
                         "body": body or base["body"]})
        if known and not kept:
            raise EditRejected("no_insights")
        doc["insights"] = kept
    present = {i["id"] for i in doc["insights"]}

    # ── Charts: removal, title, caption and the insight each sits under ──────
    pictures = {c["file"]: c for c in [*(original.get("charts") or []), *extra["charts"]]
                if isinstance(c.get("file"), int) and not isinstance(c.get("file"), bool)}
    sent = _list(edited.get("charts"))
    if sent is not None:
        kept, seen = [], set()
        for item in sent:
            if len(kept) >= MAX_REPORT_CHARTS:
                break
            file_no = item.get("file")
            if isinstance(file_no, bool) or file_no not in pictures or file_no in seen:
                continue
            seen.add(file_no)
            base = pictures[file_no]
            label = _line(item.get("label"), MAX_TITLE)
            desc = _line(item.get("desc"), MAX_CAPTION)
            owner = item["insight"] if "insight" in item else base["insight"]
            kept.append({**copy.deepcopy(base),
                         "label": base["label"] if label is None else label,
                         "desc": base["desc"] if desc is None else desc,
                         "insight": owner if isinstance(owner, str) else None})
        doc["charts"] = kept
    # A chart under an insight that is gone joins the other charts.
    for chart in doc["charts"]:
        if chart.get("insight") not in present:
            chart["insight"] = None

    # ── Answers to the user's questions ──────────────────────────────────────
    sent = _list(edited.get("questionAnswers"))
    if sent is not None:
        answers = {qa.get("id"): _paragraph(qa.get("answer")) for qa in sent}
        for qa in doc["questionAnswers"]:
            answer = answers.get(qa["id"])
            if answer:
                qa["answer"] = answer

    return doc


# ─────────────────────────────────────────────────────────────────────────────
# Two people's saves
# ─────────────────────────────────────────────────────────────────────────────

class SamePart(ValueError):
    """Two saves made from the same version changed the same part differently."""

    def __init__(self, parts: List[Dict[str, Any]]):
        super().__init__("same_part")
        self.parts = parts


_MISSING = object()


def _parts(doc: Dict[str, Any]) -> Dict[tuple, Any]:
    """
    Every part of a document a person may change, by where it sits, read as an
    edit would leave it: a version DIG wrote and the same words sent back
    untouched compare equal.
    """
    parts: Dict[tuple, Any] = {}
    text = doc.get("text") if isinstance(doc.get("text"), dict) else {}
    for field_name in TEXT_FIELDS:
        value = text.get(field_name)
        parts[("text", field_name)] = (_line(value, MAX_TITLE) if field_name == "reportTitle"
                                       else _paragraph(value)) or ""
    insights = _list(doc.get("insights")) or []
    parts[("insights",)] = tuple(i.get("id") for i in insights)
    for ins in insights:
        parts[("insight", ins.get("id"), "title")] = _line(ins.get("title"), MAX_TITLE) or ""
        parts[("insight", ins.get("id"), "body")] = _paragraph(ins.get("body")) or ""
    charts = _list(doc.get("charts")) or []
    parts[("charts",)] = tuple(c.get("file") for c in charts)
    for chart in charts:
        parts[("chart", chart.get("file"), "label")] = _line(chart.get("label"), MAX_TITLE) or ""
        parts[("chart", chart.get("file"), "desc")] = _line(chart.get("desc"), MAX_CAPTION) or ""
        owner = chart.get("insight")
        parts[("chart", chart.get("file"), "insight")] = owner if isinstance(owner, str) else None
    for qa in _list(doc.get("questionAnswers")) or []:
        parts[("answer", qa.get("id"))] = _paragraph(qa.get("answer")) or ""
    return parts


def _where(key: tuple) -> Dict[str, Any]:
    """A part's place, as the page names it."""
    if key[0] == "text":
        return {"section": key[1]}
    if key == ("insights",):
        return {"section": "insightOrder"}
    if key == ("charts",):
        return {"section": "chartOrder"}
    if key[0] == "insight":
        return {"section": "insight", "id": key[1], "field": key[2]}
    if key[0] == "chart":
        return {"section": "chart", "file": key[1], "field": key[2]}
    return {"section": "answer", "id": key[1]}


def merge(base: Dict[str, Any], theirs: Dict[str, Any], mine: Dict[str, Any]) -> Dict[str, Any]:
    """
    One document from two saves made to the same version `base`: `theirs`, the
    newest version, saved by someone else since, and `mine`, being saved now
    (already through apply_edits).

    Each part takes the side that changed it. A part both sides changed to
    different things is refused with SamePart, naming every such part, so
    nobody's words are silently lost. Removing an insight and changing it is
    such a clash; so is putting the insights (or the charts) in two different
    orders. Everything fixed, and what DIG added, comes from theirs.
    """
    b_parts, t_parts, m_parts = _parts(base), _parts(theirs), _parts(mine)
    t_ids = set(t_parts[("insights",)])
    m_ids = set(m_parts[("insights",)])

    take: Dict[tuple, str] = {}
    clashes: List[tuple] = []
    for key in dict.fromkeys([*b_parts, *t_parts, *m_parts]):
        b = b_parts.get(key, _MISSING)
        t = t_parts.get(key, _MISSING)
        m = m_parts.get(key, _MISSING)
        if key[0] == "chart" and key[2] == "insight" and isinstance(b, str):
            # A chart whose insight one side removed joined the other charts:
            # that side did not move it.
            if t is None and b not in t_ids:
                t = b
            if m is None and b not in m_ids:
                m = b
        if m == b:
            take[key] = "theirs"
        elif t == b or t == m:
            take[key] = "mine"
        else:
            clashes.append(key)
    if clashes:
        raise SamePart([_where(k) for k in clashes])

    def side(key: tuple) -> Dict[tuple, Any]:
        return m_parts if take.get(key) == "mine" else t_parts

    doc = copy.deepcopy(theirs)
    doc.setdefault("text", {})
    for field_name in TEXT_FIELDS:
        if take.get(("text", field_name)) == "mine":
            doc["text"][field_name] = (mine.get("text") or {}).get(field_name, "")

    def by(document: Dict[str, Any], section: str, key: str) -> Dict[Any, Dict[str, Any]]:
        return {item.get(key): item for item in _list(document.get(section)) or []}

    t_ins, m_ins = by(theirs, "insights", "id"), by(mine, "insights", "id")
    insights = []
    for iid in side(("insights",))[("insights",)]:
        item = copy.deepcopy(t_ins.get(iid) or m_ins[iid])
        for field_name in ("title", "body"):
            mine_wins = take.get(("insight", iid, field_name)) == "mine" and iid in m_ins
            source = m_ins if mine_wins or iid not in t_ins else t_ins
            item[field_name] = source[iid][field_name]
        insights.append(item)
    if not insights and (base.get("insights") or theirs.get("insights")):
        raise EditRejected("no_insights")
    doc["insights"] = insights
    present = {i["id"] for i in insights}

    t_charts, m_charts = by(theirs, "charts", "file"), by(mine, "charts", "file")
    charts = []
    for file_no in side(("charts",))[("charts",)]:
        item = copy.deepcopy(t_charts.get(file_no) or m_charts[file_no])
        for field_name in ("label", "desc", "insight"):
            mine_wins = take.get(("chart", file_no, field_name)) == "mine" and file_no in m_charts
            source = m_charts if mine_wins or file_no not in t_charts else t_charts
            item[field_name] = source[file_no].get(field_name)
        if item.get("insight") not in present:
            item["insight"] = None
        charts.append(item)
    doc["charts"] = charts

    m_answers = by(mine, "questionAnswers", "id")
    for qa in _list(doc.get("questionAnswers")) or []:
        if take.get(("answer", qa.get("id"))) == "mine" and qa.get("id") in m_answers:
            qa["answer"] = m_answers[qa["id"]].get("answer", qa.get("answer"))
    return doc


# ─────────────────────────────────────────────────────────────────────────────
# Back to a report, and to files
# ─────────────────────────────────────────────────────────────────────────────

def to_report(doc: Dict[str, Any]) -> Tuple[LLMReport, List[Dict[str, Any]]]:
    """The report and its charts (without pictures) in the builders' terms."""
    facts = doc.get("facts") or {}
    text = doc.get("text") or {}
    position = {}
    insights = []
    for k, ins in enumerate(doc.get("insights") or []):
        position[ins["id"]] = k + 1
        insights.append({"rank": k + 1, "insight_index": k + 1,
                         "title": ins.get("title", ""), "body": ins.get("body", ""),
                         "restsOn": list(ins.get("restsOn") or []),
                         "basedOn": list(ins.get("basedOn") or []),
                         **({"strength": ins["strength"]} if ins.get("strength") else {}),
                         **({"highlight": _figure(ins.get("highlight"))} if _figure(ins.get("highlight")) else {})})
    charts = [{"file": c.get("file"), "type": c.get("type", ""), "label": c.get("label", ""),
               "desc": c.get("desc", ""), "color": c.get("color", ""),
               "insight_index": position.get(c.get("insight"), 0)}
              for c in doc.get("charts") or []]
    report = LLMReport(
        reportTitle=text.get("reportTitle", ""),
        introduction=text.get("introduction", ""),
        executiveSummary=text.get("executiveSummary", ""),
        insights=insights,
        chartInstructions=[],
        dataQualitySection=text.get("dataQualitySection", ""),
        geminiConfidenceScore=_int(facts.get("writerScore")),
        confidenceNote=facts.get("confidenceNote", ""),
        conclusion=text.get("conclusion", ""),
        rawResponse="",
        writerModel=facts.get("writerModel", ""),
        questionAnswers=[{"question": qa.get("question", ""), "answer": qa.get("answer", ""),
                          "answerable": qa.get("answerable", True)}
                         for qa in doc.get("questionAnswers") or []],
        assumptions=text.get("assumptions", ""),
        keyNumbers=[f for f in (_figure(k) for k in facts.get("keyNumbers") or []) if f],
    )
    return report, charts


def _domain(facts: Dict[str, Any]) -> DomainResult:
    d = facts.get("domain") or {}
    return DomainResult(domain=d.get("domain") or "general", confidence=0.0, is_analyzable=True,
                        analysis_focus=[], key_questions=[], column_decisions={},
                        attribute_interpretations={}, key_issues=list(d.get("keyIssues") or []),
                        cleaning_methods=list(d.get("cleaningMethods") or []),
                        description=str(d.get("description") or ""))


def office_details(domain: Optional[DomainResult], stats: Dict[str, Any], was_cleaned: bool,
                   dropped_columns: List[str], language: str = "en") -> Dict[str, Any]:
    """What Word and PowerPoint print on the cover and under "Notes on the data", as the PDF does."""
    from ai_engine.report_labels import labels_for, printed_issues
    # The description is English, from the file-reading model; as on the PDF,
    # another language gets "Report" on the cover instead.
    described = str(getattr(domain, "description", "") or "") if domain else ""
    if (language or "en")[:2].lower() != "en":
        described = labels_for(language)["report"]
    return {"description": described,
            "stats": {"rowCount": stats.get("rowCount"), "columnCount": stats.get("columnCount")},
            "was_cleaned": bool(was_cleaned),
            "cleaning": list((domain.cleaning_methods if domain else None) or []),
            "dropped_columns": list(dropped_columns or []),
            "issues": printed_issues(domain.key_issues if domain else None,
                                     stats.get("detectedIssues"), language)}


def build_files(doc: Dict[str, Any], pictures: Dict[int, bytes], want_word: bool = False,
                want_pptx: bool = False) -> Dict[str, Optional[str]]:
    """
    The PDF, and the Word and PowerPoint files when asked for, as base64.

    `pictures` maps a chart's file number to its PNG. A chart whose picture is
    missing is left out of the files but stays in the document.
    """
    from ai_engine.pdf.pdf_builder import build_pdf

    report, charts = to_report(doc)
    for chart in charts:
        png = pictures.get(chart["file"])
        chart["image_base64"] = base64.b64encode(png).decode("ascii") if png else None
    charts = [c for c in charts if c["image_base64"]]

    facts = doc.get("facts") or {}
    domain = _domain(facts)
    language = facts.get("language") or "en"
    file_name = facts.get("fileName") or "dataset.csv"
    score = _int(facts.get("confidenceScore")) or 6
    # The look the report was first made in. A report from before looks were
    # stored is rebuilt in the free plan's look.
    from ai_engine.design.looks import look_from_dict
    from ai_engine.reading import from_dict as reading_from_dict
    look = look_from_dict(facts.get("look"))
    reading = reading_from_dict(facts.get("reading"), domain.domain) if facts.get("reading") else None

    out: Dict[str, Optional[str]] = {"pdf": None, "word": None, "pptx": None}
    out["pdf"] = build_pdf(
        report=report, charts=charts,
        stats_summary={"rowCount": facts.get("rowCount", "?"), "columnCount": facts.get("columnCount", "?"),
                       "detectedIssues": list(facts.get("detectedIssues") or [])},
        was_cleaned=bool(facts.get("wasCleaned")), file_name=file_name, domain=domain,
        judge_confidence_score=score, judge_confidence_level=facts.get("confidenceLevel") or "MEDIUM",
        dropped_columns=list(facts.get("droppedColumns") or []), language=language,
        look=look, reading=reading,
    )
    office = office_details(domain, {"rowCount": facts.get("rowCount"), "columnCount": facts.get("columnCount"),
                                     "detectedIssues": list(facts.get("detectedIssues") or [])},
                            bool(facts.get("wasCleaned")), list(facts.get("droppedColumns") or []), language)
    if want_word:
        from ai_engine.word.word_builder import build_word_doc
        out["word"] = base64.b64encode(build_word_doc(
            report, file_name=file_name, domain=domain.domain, charts=charts,
            language=language, confidence_score=score, look=look, **office)).decode("ascii")
    if want_pptx:
        from ai_engine.pptx.pptx_builder import build_pptx
        out["pptx"] = base64.b64encode(build_pptx(
            report, file_name=file_name, domain=domain.domain, charts=charts,
            language=language, confidence_score=score, look=look, **office)).decode("ascii")
    return out


# ─────────────────────────────────────────────────────────────────────────────
# The chat, and numbers nobody computed
# ─────────────────────────────────────────────────────────────────────────────

def report_for_chat(report: LLMReport) -> Dict[str, Any]:
    """The report's words as the chat reads them."""
    return {
        "title": report.reportTitle,
        "summary": report.executiveSummary,
        # With what each insight rests on, so "where does that come from?"
        # is answered from the same result the report named.
        "insights": [{"rank": i.get("rank"), "title": i.get("title"), "body": i.get("body"),
                      **({"basedOn": i["basedOn"]} if i.get("basedOn") else {})}
                     for i in report.insights],
        "conclusion": report.conclusion,
        "questionAnswers": report.questionAnswers,
        "assumptions": report.assumptions,
        "writer": report.writerModel,
    }


def with_chat(chat_context: Any, doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """The chat context with the report's words replaced by the edited ones."""
    if not isinstance(chat_context, dict):
        return None
    updated = copy.deepcopy(chat_context)
    updated["report"] = {**report_for_chat(to_report(doc)[0]), "editedByOwner": True}
    return updated


def _pieces(doc: Dict[str, Any]) -> Iterable[Tuple[Dict[str, str], str]]:
    """Every piece of text a reader takes as fact, with where it sits."""
    for field_name in TEXT_FIELDS:
        yield {"section": field_name}, (doc.get("text") or {}).get(field_name, "")
    for ins in doc.get("insights") or []:
        yield {"section": "insight", "id": ins["id"], "field": "title"}, ins.get("title", "")
        yield {"section": "insight", "id": ins["id"], "field": "body"}, ins.get("body", "")
    for chart in doc.get("charts") or []:
        yield {"section": "chart", "file": chart["file"], "field": "label"}, chart.get("label", "")
        yield {"section": "chart", "file": chart["file"], "field": "desc"}, chart.get("desc", "")
    for qa in doc.get("questionAnswers") or []:
        yield {"section": "answer", "id": qa["id"]}, qa.get("answer", "")


def number_warnings(doc: Dict[str, Any], before: Optional[Dict[str, Any]],
                    chat_context: Any, original: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Figures a person typed that the analysis never produced.

    Only text that changed since `before` is read, so a number warned about
    once is not warned about on every save. A warning, never a refusal: the
    person may know something the analysis does not.
    """
    if not isinstance(before, dict):
        return []
    sources = [json.dumps(chat_context, ensure_ascii=False, default=str) if chat_context else ""]
    sources += [text for _, text in _pieces(original or before)]
    old = {json.dumps(where, sort_keys=True): text for where, text in _pieces(before)}

    warnings = []
    for where, text in _pieces(doc):
        if not text or old.get(json.dumps(where, sort_keys=True)) == text:
            continue
        found = [f"{v:,.10g}" for v in ungrounded_numbers(text, sources)]
        if found:
            warnings.append({**where, "numbers": list(dict.fromkeys(found))})
    return warnings
