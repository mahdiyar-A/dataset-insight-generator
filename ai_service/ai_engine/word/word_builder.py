"""
Word (.docx) Report Builder  —  DIG AI Engine

Converts an LLMReport into a .docx file using python-docx. Called by the
pipeline when the user's customization includes outputFormat.word = true.

Structure mirrors the PDF report:
  Title block       → title, date, domain, source file
  Executive summary
  Key insights      → one section per insight, each followed by its charts
  Your questions    → answers to the questions asked in the brief, if any
  Conclusion
  Data quality      → the user's assumptions, the methodology text, confidence

Headings use Word's built-in Heading styles, so the navigation pane and a
table of contents work. Section titles come from report_labels in the report's
language, and Persian and Arabic reports are laid out right to left.

Returns: bytes  (the .docx file contents, ready for base64 encoding)
"""

import base64
import io
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ai_engine.report_labels import confidence_word, is_rtl, labels_for

try:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Inches, Pt, RGBColor
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False


# ── Brand colours (matching PDF palette) ─────────────────────────────────────
COLOR_PRIMARY = RGBColor(0x1A, 0x1A, 0x2E) if DOCX_AVAILABLE else None  # deep navy
COLOR_ACCENT  = RGBColor(0x4F, 0x46, 0xE5) if DOCX_AVAILABLE else None  # indigo
COLOR_BODY    = RGBColor(0x1F, 0x2D, 0x3D) if DOCX_AVAILABLE else None  # dark slate
COLOR_MUTED   = RGBColor(0x64, 0x74, 0x8B) if DOCX_AVAILABLE else None  # slate-500

_BULLET = re.compile(r"^\s*(?:[•\-\*·▪◦]|\d+[.)])\s+")
CHART_WIDTH_IN = 6.0

# WordprocessingML requires a fixed child order inside w:pPr and w:rPr, and
# Word reports a file as damaged when it is broken. These are the elements
# that may follow the ones added here, so each lands in its proper place.
_AFTER_JC = ("w:textDirection", "w:textAlignment", "w:textboxTightWrap", "w:outlineLvl",
             "w:divId", "w:cnfStyle", "w:rPr", "w:sectPr", "w:pPrChange")
_AFTER_BIDI = ("w:adjustRightInd", "w:snapToGrid", "w:spacing", "w:ind", "w:contextualSpacing",
               "w:mirrorIndents", "w:suppressOverlap", "w:jc") + _AFTER_JC
_AFTER_PBDR = ("w:shd", "w:tabs", "w:suppressAutoHyphens", "w:kinsoku", "w:wordWrap",
               "w:overflowPunct", "w:topLinePunct", "w:autoSpaceDE", "w:autoSpaceDN",
               "w:bidi") + _AFTER_BIDI
_AFTER_RTL = ("w:cs", "w:em", "w:lang", "w:eastAsianLayout", "w:specVanish", "w:oMath")


def _insert(parent, tag: str, successors) -> None:
    if parent.find(qn(tag)) is None:
        parent.insert_element_before(OxmlElement(tag), *successors)


class _Writer:
    """Paragraph helpers that know the report's direction."""

    def __init__(self, doc, rtl: bool):
        self.doc = doc
        self.rtl = rtl

    def _direction(self, para) -> None:
        if not self.rtl:
            return
        para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        _insert(para._p.get_or_add_pPr(), "w:bidi", _AFTER_BIDI)
        for run in para.runs:
            _insert(run._r.get_or_add_rPr(), "w:rtl", _AFTER_RTL)

    def heading(self, text: str, level: int = 1):
        para = self.doc.add_heading(text, level=level)
        self._direction(para)
        return para

    def paragraph(self, text: str, italic: bool = False, size: float = 11,
                  color=None, bold: bool = False, space_after: float = 6):
        para = self.doc.add_paragraph()
        para.paragraph_format.space_after = Pt(space_after)
        run = para.add_run(text)
        run.font.size = Pt(size)
        run.italic = italic
        run.bold = bold
        run.font.color.rgb = color or COLOR_BODY
        self._direction(para)
        return para

    def body(self, text: str) -> None:
        """Text that may hold "• " bullet lines: real list items for those."""
        for line in (text or "").split("\n"):
            line = line.strip()
            if not line:
                continue
            if _BULLET.match(line):
                para = self.doc.add_paragraph(style="List Bullet")
                run = para.add_run(_BULLET.sub("", line))
                run.font.size = Pt(11)
                run.font.color.rgb = COLOR_BODY
                self._direction(para)
            else:
                self.paragraph(line)

    def rule(self) -> None:
        para = self.doc.add_paragraph()
        para.paragraph_format.space_before = Pt(4)
        para.paragraph_format.space_after = Pt(4)
        p_pr = para._p.get_or_add_pPr()
        _insert(p_pr, "w:pBdr", _AFTER_PBDR)
        borders = p_pr.find(qn("w:pBdr"))
        bottom = OxmlElement("w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), "6")
        bottom.set(qn("w:space"), "1")
        bottom.set(qn("w:color"), "CBD5E1")   # slate-300
        borders.append(bottom)

    def chart(self, chart: Dict[str, Any]) -> None:
        img = chart.get("image_base64")
        if not img:
            return
        try:
            self.doc.add_picture(io.BytesIO(base64.b64decode(img)), width=Inches(CHART_WIDTH_IN))
        except Exception as e:  # a bad image must not lose the report
            print(f"[Word] chart skipped: {e}", flush=True)
            return
        self.doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        caption = " — ".join(x for x in (chart.get("label"), chart.get("desc")) if x)
        if caption:
            self.paragraph(caption, italic=True, size=9, color=COLOR_MUTED, space_after=10)


def _style_document(doc, rtl: bool) -> None:
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)
    if rtl:
        # The font Word uses for Arabic script ("complex script" text).
        normal.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:cs"), "Tahoma")
    for name, size, color in (("Title", 26, COLOR_PRIMARY), ("Heading 1", 17, COLOR_PRIMARY),
                              ("Heading 2", 13, COLOR_ACCENT), ("Heading 3", 12, COLOR_BODY)):
        style = doc.styles[name]
        style.font.name = "Calibri"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = color


def _page_number_footer(doc, labels: Dict[str, str], rtl: bool) -> None:
    for section in doc.sections:
        para = section.footer.paragraphs[0]
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = para.add_run(f"DIG — {labels['report']}  ·  {labels['page']} ")
        run.font.size = Pt(8)
        run.font.color.rgb = COLOR_MUTED
        field = OxmlElement("w:fldSimple")
        field.set(qn("w:instr"), "PAGE")
        number = OxmlElement("w:r")
        text = OxmlElement("w:t")
        text.text = "1"
        number.append(text)
        field.append(number)
        para._p.append(field)
        if rtl:
            _insert(para._p.get_or_add_pPr(), "w:bidi", _AFTER_BIDI)


def build_word_doc(
    report,
    file_name: str = "dataset.csv",
    domain: str = "general",
    charts: Optional[List[Dict[str, Any]]] = None,
    language: str = "en",
    confidence_score: Optional[int] = None,
) -> bytes:
    """
    Build a .docx Word report from an LLMReport.

    Args:
        report:           LLMReport dataclass
        file_name:        original uploaded filename (shown under the title)
        domain:           domain string (finance, hr, etc.)
        charts:           generate_charts output; each chart sits under its insight
        language:         report language, for headings and text direction
        confidence_score: the statistical confidence score, 1-10

    Returns:
        bytes — the .docx file contents
    """
    if not DOCX_AVAILABLE:
        raise ImportError("python-docx is not installed. Run: pip install python-docx")

    labels = labels_for(language)
    rtl = is_rtl(language)
    doc = Document()
    _style_document(doc, rtl)
    w = _Writer(doc, rtl)
    title = report.reportTitle or labels["report"]
    now = datetime.now(timezone.utc)

    props = doc.core_properties
    props.title = title
    props.subject = f"{domain.title()} analysis of {file_name}"
    props.author = "DIG — Dataset Insight Generator"
    props.keywords = "DIG, data analysis, report"
    props.language = language
    props.created = now.replace(tzinfo=None)

    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.1)
        section.right_margin = Inches(1.1)
    _page_number_footer(doc, labels, rtl)

    # ── Title block ───────────────────────────────────────────────────────────
    title_para = doc.add_paragraph(title, style="Title")
    w._direction(title_para)
    w.paragraph(f"{labels['generated_by']}  ·  {domain.title()}  ·  {now.strftime('%Y-%m-%d')}",
                italic=True, size=10, color=COLOR_MUTED, space_after=0)
    w.paragraph(f"{labels['source_file']}: {file_name}", size=10, color=COLOR_MUTED, space_after=12)
    if report.introduction:
        w.paragraph(report.introduction, italic=True)
    w.rule()

    # ── Executive summary ─────────────────────────────────────────────────────
    w.heading(labels["executive_summary"], 1)
    w.body(report.executiveSummary or "")
    if report.confidenceNote:
        w.paragraph(f"{labels['analyst_assessment']}: {report.confidenceNote}",
                    italic=True, size=10, color=COLOR_MUTED)

    # ── Insights, each with its charts ────────────────────────────────────────
    charts = list(charts or [])
    by_insight: Dict[int, List[Dict[str, Any]]] = {}
    for chart in charts:
        by_insight.setdefault(int(chart.get("insight_index") or 0), []).append(chart)
    placed = set()

    w.heading(labels["key_insights"], 1)
    for insight in report.insights or []:
        rank = insight.get("rank", "")
        w.heading(f"{rank}.  {insight.get('title', '')}".strip(), 2)
        w.body(insight.get("body", ""))
        index = int(insight.get("insight_index") or rank or 0)
        for chart in by_insight.get(index, []):
            w.chart(chart)
            placed.add(id(chart))

    leftover = [c for c in charts if id(c) not in placed]
    if leftover:
        w.heading(labels["more_charts"], 2)
        for chart in leftover:
            w.chart(chart)

    # ── Answers to the user's own questions ───────────────────────────────────
    answers = getattr(report, "questionAnswers", None) or []
    if answers:
        w.rule()
        w.heading(labels["your_questions"], 1)
        for qa in answers:
            w.heading(qa.get("question", ""), 3)
            w.body(qa.get("answer", ""))
            if not qa.get("answerable", True):
                w.paragraph(labels["not_answerable"], italic=True, size=9, color=COLOR_MUTED)

    # ── Conclusion ────────────────────────────────────────────────────────────
    if report.conclusion:
        w.rule()
        w.heading(labels["conclusion"], 1)
        w.body(report.conclusion)

    # ── Data quality, assumptions, confidence ─────────────────────────────────
    assumptions = getattr(report, "assumptions", "") or ""
    if report.dataQualitySection or assumptions or confidence_score:
        w.rule()
        w.heading(labels["methodology"], 1)
        if assumptions:
            w.heading(labels["assumptions"], 3)
            w.body(assumptions)
        if report.dataQualitySection:
            w.body(report.dataQualitySection)
        if confidence_score:
            w.paragraph(f"{labels['confidence']}: {confidence_score}/10 "
                        f"({confidence_word(confidence_score, labels)})",
                        bold=True, size=10, color=COLOR_ACCENT)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
