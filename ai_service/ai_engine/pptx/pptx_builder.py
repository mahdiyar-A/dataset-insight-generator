"""
PowerPoint (.pptx) Report Builder  —  DIG AI Engine

Converts an LLMReport into a presentation using python-pptx. Called by the
pipeline when outputFormat.pptx = true in the user's customization.

Slides:
  Title
  Executive summary
  One slide per insight, its chart beside the text when it has one
  Your questions        — answers to the brief's questions, if any were asked
  Conclusion
  Data quality & methodology — the user's assumptions and the confidence score
  Any chart not tied to an insight, one per slide

Text is never cut short. A body too long for one slide continues on the next
("… continued"), and every slide's speaker notes carry its full text, so the
presenter has all of it. Section titles come from report_labels in the
report's language; Persian and Arabic slides run right to left.

Returns: bytes  (the .pptx contents, ready for base64 encoding)
"""

import base64
import io
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ai_engine.report_labels import confidence_word, is_rtl, labels_for

try:
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.text import MSO_AUTO_SIZE, PP_ALIGN
    from pptx.util import Inches, Pt
    PPTX_AVAILABLE = True
except ImportError:
    PPTX_AVAILABLE = False


# ── Brand palette ─────────────────────────────────────────────────────────────
C_NAVY   = RGBColor(0x1A, 0x1A, 0x2E) if PPTX_AVAILABLE else None
C_INDIGO = RGBColor(0x4F, 0x46, 0xE5) if PPTX_AVAILABLE else None
C_WHITE  = RGBColor(0xFF, 0xFF, 0xFF) if PPTX_AVAILABLE else None
C_LIGHT  = RGBColor(0xF1, 0xF5, 0xF9) if PPTX_AVAILABLE else None   # slate-100
C_MUTED  = RGBColor(0x64, 0x74, 0x8B) if PPTX_AVAILABLE else None   # slate-500
C_BODY   = RGBColor(0x1F, 0x2D, 0x3D) if PPTX_AVAILABLE else None

# Slide dimensions — widescreen 16:9. Guarded like every constant above:
# python-pptx is optional, and calling into it at import time used to take the
# whole AI service down when it was missing.
SLIDE_W = Inches(13.33) if PPTX_AVAILABLE else None
SLIDE_H = Inches(7.5) if PPTX_AVAILABLE else None

# How much text fits in a body box before it continues on the next slide,
# in characters at the body font size. Conservative: a slide should be read
# from across a room, and bullet lines waste the end of each line.
FULL_WIDTH_CHARS = 1000
BESIDE_CHART_CHARS = 480
_BULLET = re.compile(r"^\s*(?:[•\-\*·▪◦]|\d+[.)])\s+")
_SENTENCE_END = re.compile(r"(?<=[.!?。！？؟])\s+")


# ─────────────────────────────────────────────────────────────────────────────
# Text helpers
# ─────────────────────────────────────────────────────────────────────────────

def _weight(text: str) -> int:
    """Length with wide (CJK) characters counted twice: they take twice the room."""
    return len(text) + sum(1 for ch in text if "⺀" <= ch <= "鿿" or "가" <= ch <= "힯")


def _lines(text: str) -> List[str]:
    """Paragraphs of a body, bullets normalised to a leading "• "."""
    out = []
    for line in (text or "").split("\n"):
        line = line.strip()
        if not line:
            continue
        out.append("• " + _BULLET.sub("", line) if _BULLET.match(line) else line)
    return out


def _split_long(line: str, limit: int) -> List[str]:
    if _weight(line) <= limit:
        return [line]
    pieces, current = [], ""
    for sentence in _SENTENCE_END.split(line):
        candidate = f"{current} {sentence}".strip()
        if current and _weight(candidate) > limit:
            pieces.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        pieces.append(current)
    # A single sentence longer than a slide: break between words.
    final = []
    for piece in pieces:
        while _weight(piece) > limit:
            cut = piece[:limit].rsplit(" ", 1)[0] or piece[:limit]
            final.append(cut)
            piece = piece[len(cut):].strip()
        if piece:
            final.append(piece)
    return final


def chunk_text(text: str, limit: int) -> List[List[str]]:
    """Split a body into slides' worth of paragraphs, keeping paragraphs whole when they fit."""
    pages: List[List[str]] = []
    page: List[str] = []
    used = 0
    for line in _lines(text):
        for piece in _split_long(line, limit):
            cost = _weight(piece) + 40   # a paragraph break costs most of a line
            if page and used + cost > limit:
                pages.append(page)
                page, used = [], 0
            page.append(piece)
            used += cost
    if page:
        pages.append(page)
    return pages or [[]]


# ─────────────────────────────────────────────────────────────────────────────
# Shape helpers
# ─────────────────────────────────────────────────────────────────────────────

class _Deck:
    def __init__(self, rtl: bool, labels: Dict[str, str]):
        self.prs = Presentation()
        self.prs.slide_width = SLIDE_W
        self.prs.slide_height = SLIDE_H
        self.rtl = rtl
        self.labels = labels

    def slide(self, notes: str = ""):
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])   # 6 = blank
        if notes:
            slide.notes_slide.notes_text_frame.text = notes
        return slide

    @staticmethod
    def rect(slide, left, top, width, height, fill):
        shape = slide.shapes.add_shape(1, left, top, width, height)   # 1 = rectangle
        shape.line.fill.background()
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
        return shape

    def text(self, slide, left, top, width, height, paragraphs, size: int,
             bold: bool = False, italic: bool = False, color=None, align=None,
             shrink: bool = True):
        if isinstance(paragraphs, str):
            paragraphs = [paragraphs]
        box = slide.shapes.add_textbox(left, top, width, height)
        frame = box.text_frame
        frame.word_wrap = True
        if shrink:
            # A safety net only: chunk_text already keeps bodies within a slide.
            frame.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE
        for i, line in enumerate(paragraphs):
            para = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
            para.alignment = align if align is not None else (PP_ALIGN.RIGHT if self.rtl else PP_ALIGN.LEFT)
            if self.rtl:
                para._p.get_or_add_pPr().set("rtl", "1")
            if i:
                para.space_before = Pt(size * 0.45)
            run = para.add_run()
            run.text = line
            run.font.size = Pt(size)
            run.font.bold = bold
            run.font.italic = italic
            if color is not None:
                run.font.color.rgb = color
        return box

    @staticmethod
    def picture(slide, image_b64: str, left, top, max_w, max_h) -> bool:
        try:
            data = base64.b64decode(image_b64)
            from PIL import Image
            with Image.open(io.BytesIO(data)) as img:
                px_w, px_h = img.size
            scale = min(max_w / px_w, max_h / px_h)
            w, h = int(px_w * scale), int(px_h * scale)
            slide.shapes.add_picture(io.BytesIO(data), left + (max_w - w) // 2, top + (max_h - h) // 2, w, h)
            return True
        except Exception as e:   # a bad image must not lose the deck
            print(f"[PPTX] chart skipped: {e}", flush=True)
            return False

    def header_slide(self, title: str, notes: str, dark_header=None):
        """Light slide with a coloured title bar. Returns the slide."""
        slide = self.slide(notes)
        self.rect(slide, 0, 0, SLIDE_W, SLIDE_H, C_LIGHT)
        self.rect(slide, 0, 0, SLIDE_W, Inches(1.1), dark_header or C_INDIGO)
        self.text(slide, Inches(0.5), Inches(0.2), Inches(12.3), Inches(0.75), title,
                  24, bold=True, color=C_WHITE, shrink=False)
        return slide

    def continued(self, title: str, page: int) -> str:
        return title if page == 0 else f"{title} ({self.labels['continued']})"


# ─────────────────────────────────────────────────────────────────────────────
# Slides
# ─────────────────────────────────────────────────────────────────────────────

def _title_slide(deck: _Deck, title: str, domain: str, file_name: str, intro: str) -> None:
    slide = deck.slide(intro)
    deck.rect(slide, 0, 0, SLIDE_W, SLIDE_H, C_NAVY)
    deck.rect(slide, SLIDE_W - Inches(0.12) if deck.rtl else 0, 0, Inches(0.12), SLIDE_H, C_INDIGO)
    deck.text(slide, Inches(0.5), Inches(0.4), Inches(12.3), Inches(0.5),
              "DIG — Dataset Insight Generator", 11, italic=True, color=C_INDIGO, shrink=False)
    deck.text(slide, Inches(0.5), Inches(1.6), Inches(12.2), Inches(1.9), title, 34, bold=True, color=C_WHITE)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    deck.text(slide, Inches(0.5), Inches(3.7), Inches(12), Inches(0.5),
              f"{domain.title()}  ·  {date}", 13, italic=True, color=C_MUTED, shrink=False)
    deck.text(slide, Inches(0.5), Inches(4.25), Inches(12), Inches(0.45),
              f"{deck.labels['source_file']}: {file_name}", 11, color=C_MUTED, shrink=False)


def _text_slides(deck: _Deck, title: str, body: str, size: int = 16, dark: bool = False,
                 header=None) -> None:
    """A titled body over as many slides as it needs."""
    pages = chunk_text(body, FULL_WIDTH_CHARS)
    for i, page in enumerate(pages):
        notes = body if i == 0 else ""
        heading = deck.continued(title, i)
        if dark:
            # A closing slide: a heading that reads as one (indigo on navy
            # was hard to see), and larger text when the body is short.
            slide = deck.slide(notes)
            deck.rect(slide, 0, 0, SLIDE_W, SLIDE_H, C_NAVY)
            deck.rect(slide, SLIDE_W - Inches(0.12) if deck.rtl else 0, 0, Inches(0.12), SLIDE_H, C_INDIGO)
            deck.text(slide, Inches(0.5), Inches(0.5), Inches(12.3), Inches(0.9), heading,
                      28, bold=True, color=C_WHITE, shrink=False)
            deck.rect(slide, Inches(11.33) if deck.rtl else Inches(0.5), Inches(1.45), Inches(1.5),
                      Inches(0.05), C_INDIGO)
            deck.text(slide, Inches(0.5), Inches(1.75), Inches(12.3), Inches(5.3), page,
                      size + 4 if len(pages) == 1 and _weight(body) < 600 else size, color=C_WHITE)
        else:
            slide = deck.header_slide(heading, notes, header)
            deck.text(slide, Inches(0.6), Inches(1.4), Inches(12.1), Inches(5.6), page, size, color=C_BODY)


def _insight_slides(deck: _Deck, insight: Dict[str, Any], total: int,
                    charts: List[Dict[str, Any]]) -> None:
    rank = insight.get("rank", "")
    title = str(insight.get("title") or "")
    body = str(insight.get("body") or "")
    chart = next((c for c in charts if c.get("image_base64")), None)
    limit = BESIDE_CHART_CHARS if chart else FULL_WIDTH_CHARS
    pages = chunk_text(body, limit)
    for i, page in enumerate(pages):
        notes = body
        if chart and i == 0 and chart.get("desc"):
            notes += f"\n\n{chart.get('label', '')}: {chart['desc']}"
        slide = deck.slide(notes if i == 0 else "")
        deck.rect(slide, 0, 0, SLIDE_W, SLIDE_H, C_WHITE)
        side_left = SLIDE_W - Inches(0.9) if deck.rtl else 0
        deck.rect(slide, side_left, 0, Inches(0.9), SLIDE_H, C_NAVY)
        deck.text(slide, side_left, Inches(3.1), Inches(0.9), Inches(0.6), str(rank), 28,
                  bold=True, color=C_INDIGO, align=PP_ALIGN.CENTER, shrink=False)
        deck.text(slide, side_left, Inches(3.7), Inches(0.9), Inches(0.4), f"{deck.labels['of']} {total}", 10,
                  color=C_MUTED, align=PP_ALIGN.CENTER, shrink=False)
        content_left = Inches(0.3) if deck.rtl else Inches(1.1)
        deck.text(slide, content_left, Inches(0.45), Inches(11.9), Inches(1.3), deck.continued(title, i), 22,
                  bold=True, color=C_NAVY)
        deck.rect(slide, content_left if not deck.rtl else content_left + Inches(10.4), Inches(1.8),
                  Inches(1.5), Inches(0.04), C_INDIGO)
        with_chart = chart is not None and i == 0
        text_w = Inches(5.5) if with_chart else Inches(11.9)
        text_left = content_left + (Inches(6.4) if (deck.rtl and with_chart) else 0)
        deck.text(slide, text_left, Inches(2.05), text_w, Inches(5.0), page, 15, color=C_BODY)
        if with_chart:
            chart_left = content_left if deck.rtl else content_left + Inches(5.7)
            if deck.picture(slide, chart["image_base64"], chart_left, Inches(2.0), Inches(6.2), Inches(4.6)):
                if chart.get("label"):
                    deck.text(slide, chart_left, Inches(6.65), Inches(6.2), Inches(0.5), chart["label"], 10,
                              italic=True, color=C_MUTED, align=PP_ALIGN.CENTER, shrink=False)


def _chart_slide(deck: _Deck, chart: Dict[str, Any]) -> None:
    label = chart.get("label") or deck.labels["charts"]
    slide = deck.header_slide(label, chart.get("desc", ""))
    deck.picture(slide, chart["image_base64"], Inches(1.2), Inches(1.35), Inches(10.9), Inches(5.0))
    if chart.get("desc"):
        deck.text(slide, Inches(0.8), Inches(6.45), Inches(11.7), Inches(0.8), chart["desc"], 12,
                  italic=True, color=C_MUTED, align=PP_ALIGN.CENTER)


def _question_slides(deck: _Deck, answers: List[Dict[str, Any]]) -> None:
    for qa in answers:
        body = str(qa.get("answer") or "")
        if not qa.get("answerable", True):
            body += f"\n{deck.labels['not_answerable']}."
        question = str(qa.get("question") or "")
        pages = chunk_text(body, FULL_WIDTH_CHARS - 150)
        for i, page in enumerate(pages):
            slide = deck.header_slide(deck.continued(deck.labels["your_questions"], i), f"{question}\n\n{body}" if i == 0 else "")
            deck.text(slide, Inches(0.6), Inches(1.35), Inches(12.1), Inches(1.1), question, 20,
                      bold=True, color=C_NAVY)
            deck.text(slide, Inches(0.6), Inches(2.5), Inches(12.1), Inches(4.6), page, 16, color=C_BODY)


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def build_pptx(
    report,
    file_name: str = "dataset.csv",
    domain: str = "general",
    charts: Optional[List[Dict[str, Any]]] = None,
    language: str = "en",
    confidence_score: Optional[int] = None,
) -> bytes:
    """
    Build a .pptx presentation from an LLMReport.

    Args:
        report:           LLMReport dataclass
        file_name:        original uploaded filename (shown on the title slide)
        domain:           domain string
        charts:           generate_charts output; each sits beside its insight
        language:         report language, for labels and text direction
        confidence_score: the statistical confidence score, 1-10

    Returns:
        bytes — the .pptx file contents
    """
    if not PPTX_AVAILABLE:
        raise ImportError("python-pptx is not installed. Run: pip install python-pptx")

    labels = labels_for(language)
    deck = _Deck(is_rtl(language), labels)
    title = report.reportTitle or labels["report"]
    deck.prs.core_properties.title = title
    deck.prs.core_properties.author = "DIG — Dataset Insight Generator"
    deck.prs.core_properties.subject = f"{domain.title()} analysis of {file_name}"
    deck.prs.core_properties.language = language

    _title_slide(deck, title, domain, file_name, report.introduction or "")

    if report.executiveSummary:
        _text_slides(deck, labels["executive_summary"], report.executiveSummary)

    charts = [c for c in (charts or []) if c.get("image_base64")]
    by_insight: Dict[int, List[Dict[str, Any]]] = {}
    for chart in charts:
        by_insight.setdefault(int(chart.get("insight_index") or 0), []).append(chart)
    used = set()
    insights = report.insights or []
    for insight in insights:
        index = int(insight.get("insight_index") or insight.get("rank") or 0)
        own = by_insight.get(index, [])
        _insight_slides(deck, insight, len(insights), own)
        if own:
            used.add(id(own[0]))
    # Charts with no insight, and an insight's second chart, get slides of their own.
    for chart in charts:
        if id(chart) not in used:
            _chart_slide(deck, chart)

    answers = getattr(report, "questionAnswers", None) or []
    if answers:
        _question_slides(deck, answers)

    if report.conclusion:
        _text_slides(deck, labels["conclusion"], report.conclusion, dark=True)

    parts = []
    assumptions = getattr(report, "assumptions", "") or ""
    if assumptions:
        parts.append(f"{labels['assumptions']}: {assumptions}")
    if report.dataQualitySection:
        parts.append(report.dataQualitySection)
    if confidence_score:
        parts.append(f"{labels['confidence']}: {confidence_score}/10 ({confidence_word(confidence_score, labels)})")
    if parts:
        _text_slides(deck, labels["methodology"], "\n".join(parts), size=14, header=C_MUTED)

    buf = io.BytesIO()
    deck.prs.save(buf)
    return buf.getvalue()
