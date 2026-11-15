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
                   notes. Never editable.

An edit is applied to the ORIGINAL document, version 1, never to whatever the
person sent: only the editable parts are taken from the edit, every fixed part
is copied from the original. Ids come from the original too, so going back to
an older version can bring back an insight a later version removed, while no
edit can add an insight that rests on nothing.
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

# What the files can hold: the backend keeps at most this many chart pictures.
MAX_CHARTS = 5


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


def build(report: LLMReport, charts: List[Dict[str, Any]], *, stats: Any, domain: Optional[DomainResult],
          was_cleaned: bool, dropped_columns: Optional[List[str]], file_name: str, language: str,
          confidence_score: int, confidence_level: str) -> Dict[str, Any]:
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
        })

    # Position i is the picture the backend stores as chart_{i}.png.
    chart_list = [{
        "file": i,
        "type": str(ch.get("type") or ""),
        "label": str(ch.get("label") or ""),
        "desc": str(ch.get("desc") or ""),
        "color": str(ch.get("color") or ""),
        "insight": owner.get(_int(ch.get("insight_index"))),
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
            },
            "confidenceScore": _int(confidence_score) or 6,
            "confidenceLevel": str(confidence_level or "MEDIUM"),
            "confidenceNote": str(report.confidenceNote or ""),
            "writerModel": str(getattr(report, "writerModel", "") or ""),
            "writerScore": _int(getattr(report, "geminiConfidenceScore", 0)),
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


def apply_edits(original: Dict[str, Any], edited: Any) -> Dict[str, Any]:
    """
    The document `edited` describes, built on `original` (version 1).

    Takes only what a person may change from `edited`; anything missing,
    malformed or unknown is left as the original had it. A required field left
    empty (the report title, an insight's title or text) keeps the original's.
    """
    doc = copy.deepcopy(original)
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
    known = {i["id"]: i for i in original.get("insights") or []}
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
    pictures = {c["file"]: c for c in original.get("charts") or []}
    sent = _list(edited.get("charts"))
    if sent is not None:
        kept, seen = [], set()
        for item in sent:
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
                         "basedOn": list(ins.get("basedOn") or [])})
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
    )
    return report, charts


def _domain(facts: Dict[str, Any]) -> DomainResult:
    d = facts.get("domain") or {}
    return DomainResult(domain=d.get("domain") or "general", confidence=0.0, is_analyzable=True,
                        analysis_focus=[], key_questions=[], column_decisions={},
                        attribute_interpretations={}, key_issues=list(d.get("keyIssues") or []),
                        cleaning_methods=list(d.get("cleaningMethods") or []))


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

    out: Dict[str, Optional[str]] = {"pdf": None, "word": None, "pptx": None}
    out["pdf"] = build_pdf(
        report=report, charts=charts,
        stats_summary={"rowCount": facts.get("rowCount", "?"), "columnCount": facts.get("columnCount", "?"),
                       "detectedIssues": list(facts.get("detectedIssues") or [])},
        was_cleaned=bool(facts.get("wasCleaned")), file_name=file_name, domain=domain,
        judge_confidence_score=score, judge_confidence_level=facts.get("confidenceLevel") or "MEDIUM",
        dropped_columns=list(facts.get("droppedColumns") or []), language=language,
    )
    if want_word:
        from ai_engine.word.word_builder import build_word_doc
        out["word"] = base64.b64encode(build_word_doc(
            report, file_name=file_name, domain=domain.domain, charts=charts,
            language=language, confidence_score=score)).decode("ascii")
    if want_pptx:
        from ai_engine.pptx.pptx_builder import build_pptx
        out["pptx"] = base64.b64encode(build_pptx(
            report, file_name=file_name, domain=domain.domain, charts=charts,
            language=language, confidence_score=score)).decode("ascii")
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
