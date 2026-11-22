"""
PowerPoint (.pptx) Report Builder  —  DIG AI Engine

Converts an LLMReport into a presentation using python-pptx, in the report's
look (ai_engine/design/looks.py): the theme's colours, its office fonts, and
its decoration (Signature's heavy rules and hard offset shadows). A deck is
shown on a screen, so a dark theme stays dark here.

Slides:
  Cover            → what the data is, the title, three key numbers
  The short version, beside the findings' headlines
  One slide per finding: how firm it is, the one figure that makes it, the
                   words, and its chart beside them
  Your questions   → answers to the brief's questions, if any were asked
  What it means    → the conclusion, on the theme's highlight colour
  How we know      → the numbers behind each finding, notes on the data and
                     the confidence
  Any chart not tied to a finding, one per slide

Text is never cut short. A body too long for one slide continues on the next
("… continued"), and every slide's speaker notes carry its full text, so the
presenter has all of it. Labels come from report_labels in the report's
language; Persian and Arabic slides run right to left.

Returns: bytes  (the .pptx contents, ready for base64 encoding)
"""

import base64
import io
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from ai_engine.design.looks import Look, Theme
from ai_engine.report_labels import confidence_word, is_rtl, labels_for

try:
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
    from pptx.util import Inches, Pt
    PPTX_AVAILABLE = True
except ImportError:
    PPTX_AVAILABLE = False


# Slide dimensions — widescreen 16:9. Guarded: python-pptx is optional, and
# calling into it at import time used to take the whole AI service down when
# it was missing.
SLIDE_W = Inches(13.333) if PPTX_AVAILABLE else None
SLIDE_H = Inches(7.5) if PPTX_AVAILABLE else None
MARGIN_IN = 0.6
CONTENT_IN = 13.333 - 2 * MARGIN_IN

# How much text fits in a body box before it continues on the next slide,
# in characters at the body font size. Conservative: a slide should be read
# from across a room, and bullet lines waste the end of each line.
FULL_WIDTH_CHARS = 1000
BESIDE_CHART_CHARS = 480
NOTES_CHARS = 1700
_BULLET = re.compile(r"^\s*(?:[•\-\*·▪◦]|\d+[.)])\s+")
_SENTENCE_END = re.compile(r"(?<=[.!?。！？؟])\s+")

_STRENGTH_KEYS = {"strong": "strength_strong", "clear": "strength_clear", "weak": "strength_weak",
                  "fact": "strength_fact"}

_METHOD_EXPLANATIONS = {
    "remove_empty_rows": "Fully empty rows were removed: they carry no information.",
    "remove_duplicates": "Exact duplicate rows were removed, so nothing is counted twice.",
    "remove_infinity": "Infinite values, which break the arithmetic, were treated as missing.",
}
_METHOD_TEMPLATES = {
    "impute_median": lambda col: f"Missing values in {col} were filled with the column's middle value (median).",
    "impute_mode": lambda col: f"Missing values in {col} were filled with its most common value.",
    "impute_zero": lambda col: f"Missing values in {col} were filled with zero.",
    "cap_outliers": lambda col: f"Extreme values in {col} were capped, so a few outliers do not swamp the rest.",
    "drop_column": lambda col: f"{col} was left out of the analysis.",
}


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


def _number(value: Any) -> str:
    return f"{value:,}" if isinstance(value, int) else str(value)


def _rgb(colour: str):
    return RGBColor.from_string(colour.lstrip("#").upper())


# ─────────────────────────────────────────────────────────────────────────────
# Shape helpers
# ─────────────────────────────────────────────────────────────────────────────

class _Deck:
    def __init__(self, look: Look, rtl: bool, labels: Dict[str, str], title: str):
        self.prs = Presentation()
        self.prs.slide_width = SLIDE_W
        self.prs.slide_height = SLIDE_H
        self.look = look
        self.th: Theme = look.t
        self.head_font = look.f.office_heading
        self.body_font = look.f.office_body
        self.rtl = rtl
        self.labels = labels
        self.title = title
        self.count = 0

    # ── Colours ───────────────────────────────────────────────────────────
    def c(self, name: str):
        return _rgb(getattr(self.th, name, name))

    def faint(self) -> str:
        ink, paper = self.th.rgb("ink"), self.th.rgb("paper")
        return "#" + "".join(f"{round(p + (i - p) * 0.2):02X}" for i, p in zip(ink, paper))

    @property
    def shadow(self) -> str:
        return "accent" if self.th.dark else "ink"

    # ── Slides ────────────────────────────────────────────────────────────
    def slide(self, notes: str = "", ground: str = "paper", chrome: bool = True, ink: str = "muted"):
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])   # 6 = blank
        self.count += 1
        fill = slide.background.fill
        fill.solid()
        fill.fore_color.rgb = self.c(ground)
        if notes:
            slide.notes_slide.notes_text_frame.text = notes[:NOTES_CHARS * 4]
        if chrome:
            self._chrome(slide, ink)
        return slide

    def _chrome(self, slide, ink: str) -> None:
        """The running head (DIG and the report's title) and the foot (credit and page)."""
        brand_ink = "accent" if ink == "muted" else ink
        self.text(slide, MARGIN_IN, 0.32, 2.0, 0.4, "DIG", 13, bold=True, color=brand_ink, head=True,
                  shrink=False, align="start")
        self.text(slide, 3.0, 0.34, CONTENT_IN - 2.4, 0.4, self.title, 10, color=ink, shrink=False,
                  align="end")
        self.line(slide, MARGIN_IN, 0.8, CONTENT_IN,
                  ink if ink != "muted" else ("ink" if self.th.heavy_rules else "rule"),
                  2.0 if self.th.heavy_rules else 0.75)
        self.text(slide, MARGIN_IN, 7.0, 8.0, 0.3, f"{self.labels['made_with']} · datainsightgen.com", 9,
                  color=ink, shrink=False, align="start")
        self.text(slide, 13.333 - MARGIN_IN - 2.0, 7.0, 2.0, 0.3, str(self.count), 9, color=ink, shrink=False,
                  align="end")

    def line(self, slide, left: float, top: float, width: float, color: str, weight_pt: float) -> None:
        shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(left), Inches(top), Inches(width),
                                       Pt(weight_pt))
        shape.line.fill.background()
        shape.fill.solid()
        shape.fill.fore_color.rgb = self.c(color)

    # ── Boxes ─────────────────────────────────────────────────────────────
    def rect(self, slide, left: float, top: float, width: float, height: float, fill: str,
             border: Optional[str] = None, border_pt: float = 0.0, rounded: bool = False):
        kind = MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE
        shape = slide.shapes.add_shape(kind, Inches(left), Inches(top), Inches(width), Inches(height))
        if rounded:
            # About an eighth of an inch of corner, whatever the box's size.
            shape.adjustments[0] = min(0.5, 0.12 / max(0.1, min(width, height)))
        shape.shadow.inherit = False
        shape.fill.solid()
        shape.fill.fore_color.rgb = self.c(fill)
        if border:
            shape.line.color.rgb = self.c(border)
            shape.line.width = Pt(border_pt)
        else:
            shape.line.fill.background()
        return shape

    def card(self, slide, left: float, top: float, width: float, height: float, fill: str = "panel"):
        """A box in the theme's way: an inked card with a hard shadow, or a soft rounded panel."""
        if self.th.heavy_rules:
            self.rect(slide, left + 0.08, top + 0.08, width, height, self.shadow)
            return self.rect(slide, left, top, width, height, fill, border="ink", border_pt=2.0)
        return self.rect(slide, left, top, width, height, fill, border="rule", border_pt=0.75, rounded=True)

    def chip(self, slide, left: float, top: float, text: str, kind: str) -> None:
        fills = {"strong": ("accent", "on_accent"), "clear": ("accent", "on_accent"),
                 "weak": (self.faint(), "ink"), "fact": ("mark", "on_mark"), "mark": ("mark", "on_mark")}
        fill, ink = fills.get(kind, fills["mark"])
        width = 0.3 + 0.085 * _weight(text)
        if self.rtl:
            left = left - width
        shape = self.rect(slide, left, top, width, 0.32, fill, rounded=not self.th.heavy_rules)
        frame = shape.text_frame
        frame.margin_left = frame.margin_right = Inches(0.08)
        frame.margin_top = frame.margin_bottom = Inches(0.02)
        frame.vertical_anchor = MSO_ANCHOR.MIDDLE
        para = frame.paragraphs[0]
        para.alignment = PP_ALIGN.CENTER
        if self.rtl:
            para._p.get_or_add_pPr().set("rtl", "1")
        run = para.add_run()
        run.text = text
        self._font(run, 10, bold=True, color=ink)

    # ── Text ──────────────────────────────────────────────────────────────
    def _font(self, run, size: float, bold: bool = False, italic: bool = False, color: str = "ink",
              head: bool = False, spacing: float = 0.0) -> None:
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.name = self.head_font if head else self.body_font
        run.font.color.rgb = self.c(color)
        if spacing:
            run.font._rPr.set("spc", str(int(spacing * 100)))

    def text(self, slide, left: float, top: float, width: float, height: float, paragraphs, size: float,
             bold: bool = False, italic: bool = False, color: str = "ink", head: bool = False,
             align: str = "start", shrink: bool = True, caps: bool = False, spacing: float = 0.0,
             gap: float = 0.45):
        """
        A text box. `paragraphs` is a string, or a list of strings and
        (text, {"size", "bold", "color", "head"}) pairs for mixed styles.
        """
        if isinstance(paragraphs, str):
            paragraphs = [paragraphs]
        box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
        frame = box.text_frame
        frame.word_wrap = True
        frame.margin_left = frame.margin_right = Inches(0.02)
        if shrink:
            # A safety net only: chunk_text already keeps bodies within a slide.
            frame.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE
        aligns = {"start": PP_ALIGN.RIGHT if self.rtl else PP_ALIGN.LEFT,
                  "end": PP_ALIGN.LEFT if self.rtl else PP_ALIGN.RIGHT, "center": PP_ALIGN.CENTER}
        for i, item in enumerate(paragraphs):
            line, style = (item if isinstance(item, tuple) else (item, {}))
            para = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
            para.alignment = aligns.get(align, aligns["start"])
            if self.rtl:
                para._p.get_or_add_pPr().set("rtl", "1")
            p_size = style.get("size", size)
            if i:
                para.space_before = Pt(style.get("gap", gap) * p_size)
            run = para.add_run()
            run.text = line
            self._font(run, p_size, bold=style.get("bold", bold), italic=italic, color=style.get("color", color),
                       head=style.get("head", head), spacing=spacing)
            if caps:
                # Shown in capitals; the words themselves keep their case.
                run.font._rPr.set("cap", "all")
        return box

    def x(self, left: float, width: float) -> float:
        """A box's left edge, mirrored for right-to-left slides."""
        return 13.333 - left - width if self.rtl else left

    def picture(self, slide, image_b64: str, left: float, top: float, max_w: float, max_h: float) -> bool:
        try:
            data = base64.b64decode(image_b64)
            from PIL import Image
            with Image.open(io.BytesIO(data)) as img:
                px_w, px_h = img.size
            scale = min(max_w / px_w, max_h / px_h)
            w, h = px_w * scale, px_h * scale
            slide.shapes.add_picture(io.BytesIO(data), Inches(left + (max_w - w) / 2), Inches(top + (max_h - h) / 2),
                                     Inches(w), Inches(h))
            return True
        except Exception as e:   # a bad image must not lose the deck
            print(f"[PPTX] chart skipped: {e}", flush=True)
            return False

    def framed_chart(self, slide, chart: Dict[str, Any], left: float, top: float, width: float,
                     height: float) -> bool:
        """A chart in a card, its caption under it."""
        caption = chart.get("desc") or chart.get("label") or ""
        box_h = height - (0.4 if caption else 0)
        self.card(slide, left, top, width, box_h, fill="panel")
        pad = 0.12
        if not self.picture(slide, chart["image_base64"], left + pad, top + pad, width - 2 * pad, box_h - 2 * pad):
            return False
        if caption:
            self.text(slide, left, top + box_h + 0.12, width, 0.3, caption, 10, color="muted", shrink=False)
        return True

    def continued(self, title: str, page: int) -> str:
        return title if page == 0 else f"{title} ({self.labels['continued']})"

    def heading(self, slide, title: str, kicker: str = "", top: float = 1.05, color: str = "ink",
                kicker_color: str = "accent", size: float = 30) -> float:
        """A slide's kicker and headline; returns where the content starts."""
        if kicker:
            self.text(slide, MARGIN_IN, top, CONTENT_IN, 0.35, kicker, 11, bold=True, color=kicker_color,
                      caps=True, spacing=1.5, shrink=False)
            top += 0.38
        lines = 1 if _weight(title) * size * 0.0075 < CONTENT_IN else 2
        height = 0.62 * lines * size / 30
        self.text(slide, MARGIN_IN, top, CONTENT_IN, height, title, size, bold=True, color=color, head=True)
        return top + height + 0.25


# ─────────────────────────────────────────────────────────────────────────────
# Slides
# ─────────────────────────────────────────────────────────────────────────────

def _key_numbers(report, stats: Dict[str, Any], L: Dict[str, str]) -> List[Dict[str, str]]:
    picked = [k for k in getattr(report, "keyNumbers", None) or [] if k.get("value")][:3]
    if len(picked) >= 2:
        return picked
    own = [{"value": _number(stats.get("rowCount", "?")), "label": L["rows"]},
           {"value": _number(stats.get("columnCount", "?")), "label": L["columns"]},
           {"value": str(len(report.insights or [])), "label": L["findings_count"]}]
    return (picked + own)[:3]


def _cover(deck: _Deck, report, file_name: str, domain: str, description: str, stats: Dict[str, Any]) -> None:
    L = deck.labels
    slide = deck.slide(report.introduction or "", chrome=False)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    deck.text(slide, MARGIN_IN, 0.45, 3.0, 0.5, "DIG", 18, bold=True, color="accent", head=True, shrink=False)
    deck.text(slide, 13.333 - MARGIN_IN - 3.0, 0.5, 3.0, 0.4, date, 11, color="muted", shrink=False, align="end")
    deck.line(slide, MARGIN_IN, 1.0, CONTENT_IN, "ink" if deck.th.heavy_rules else "rule",
              2.0 if deck.th.heavy_rules else 0.75)

    deck.text(slide, MARGIN_IN, 1.45, CONTENT_IN, 0.4, description or domain.replace("_", " ") or L["report"], 12,
              bold=True, color="accent", caps=True, spacing=1.5, shrink=False)
    title = report.reportTitle or L["report"]
    size = 44 if _weight(title) <= 45 else 36 if _weight(title) <= 80 else 30
    deck.text(slide, MARGIN_IN, 1.9, CONTENT_IN, 1.75, title, size, bold=True, color="ink", head=True)
    meta = [file_name]
    if stats.get("rowCount") is not None:
        meta.append(f"{_number(stats['rowCount'])} {L['rows']}")
    if stats.get("columnCount") is not None:
        meta.append(f"{_number(stats['columnCount'])} {L['columns']}")
    deck.text(slide, MARGIN_IN, 3.7, CONTENT_IN, 0.35, " · ".join(meta), 12, color="muted", shrink=False)

    numbers = _key_numbers(report, stats, L)
    gap = 0.35
    width = (CONTENT_IN - 0.08 - gap * (len(numbers) - 1)) / max(1, len(numbers))
    for k, n in enumerate(numbers):
        left = deck.x(MARGIN_IN + k * (width + gap), width)
        first = k == 0
        deck.card(slide, left, 4.55, width, 1.95, fill="mark" if first else "panel")
        value = str(n.get("value", ""))
        deck.text(slide, left + 0.3, 4.75, width - 0.6, 0.9, value, 40 if _weight(value) <= 8 else 30, bold=True,
                  color="on_mark" if first else "accent", head=True)
        deck.text(slide, left + 0.3, 5.7, width - 0.6, 0.7, str(n.get("label", "")), 13,
                  color="on_mark" if first else "muted")
    deck.text(slide, MARGIN_IN, 7.0, 8.0, 0.3, f"{L['made_with']} · datainsightgen.com", 9, color="muted",
              shrink=False)


def _short_version(deck: _Deck, report) -> None:
    L = deck.labels
    summary = report.executiveSummary or ""
    titles = [str(i.get("title") or "") for i in report.insights or [] if i.get("title")]
    beside = titles and _weight(summary) <= 640
    pages = chunk_text(summary, 640 if beside else 900)
    for i, page in enumerate(pages):
        slide = deck.slide(summary if i == 0 else "")
        top = deck.heading(slide, deck.continued(L["short_version"], i))
        text_w = 7.3 if beside else CONTENT_IN
        deck.text(slide, deck.x(MARGIN_IN, text_w), top, text_w, 6.75 - top, page, 18, color="ink", gap=0.5)
        if beside and i == 0:
            left = deck.x(8.4, 4.33)
            height = min(6.75 - top, 0.7 + 0.42 * len(titles))
            deck.card(slide, left, top, 4.33, height, fill="panel")
            items = [(L["what_we_found"], {"size": 11, "bold": True, "color": "accent"})]
            items += [(f"{k:02d}   {t}", {"size": 13, "color": "ink"}) for k, t in enumerate(titles, 1)]
            deck.text(slide, left + 0.25, top + 0.2, 4.33 - 0.5, height - 0.35, items, 13, gap=0.55)


def _finding_slides(deck: _Deck, number: int, insight: Dict[str, Any], total: int,
                    charts: List[Dict[str, Any]]) -> None:
    L = deck.labels
    title = str(insight.get("title") or "")
    body = str(insight.get("body") or "")
    strength = str(insight.get("strength") or "")
    highlight = insight.get("highlight") if isinstance(insight.get("highlight"), dict) else None
    chart = next((c for c in charts if c.get("image_base64")), None)
    pages = chunk_text(body, BESIDE_CHART_CHARS if chart else FULL_WIDTH_CHARS)
    based = [str(x) for x in insight.get("basedOn") or [] if x]
    for i, page in enumerate(pages):
        notes = body
        if based:
            notes += f"\n\n{L['based_on']}: " + "; ".join(based)
        if chart and chart.get("desc"):
            notes += f"\n\n{chart.get('label', '')}: {chart['desc']}"
        slide = deck.slide(notes if i == 0 else "")
        # Number badge and headline
        badge = 0.62
        deck.rect(slide, deck.x(MARGIN_IN, badge), 1.08, badge, badge, "accent")
        deck.text(slide, deck.x(MARGIN_IN, badge), 1.1, badge, badge - 0.04, str(number), 22, bold=True,
                  color="on_accent", head=True, align="center", shrink=False)
        title_w = CONTENT_IN - badge - 0.25
        two_lines = _weight(title) * 26 * 0.0075 > title_w
        deck.text(slide, deck.x(MARGIN_IN + badge + 0.25, title_w), 1.02, title_w, 0.95 if two_lines else 0.6,
                  deck.continued(title, i), 26 if not two_lines else 22, bold=True, color="ink", head=True)
        top = 1.95 if two_lines else 1.88
        with_chart = chart is not None and i == 0
        col_w = 5.75 if with_chart else CONTENT_IN
        if i == 0 and strength in _STRENGTH_KEYS:
            deck.chip(slide, 13.333 - MARGIN_IN if deck.rtl else MARGIN_IN, top, L[_STRENGTH_KEYS[strength]],
                      strength)
            top += 0.5
        if i == 0 and highlight and highlight.get("value"):
            bar_left = deck.x(MARGIN_IN, 0.07)
            deck.rect(slide, bar_left, top + 0.05, 0.07, 1.1, "accent")
            deck.text(slide, deck.x(MARGIN_IN + 0.25, col_w - 0.25), top - 0.05, col_w - 0.25, 0.75,
                      str(highlight["value"]), 40, bold=True, color="accent", head=True)
            if highlight.get("label"):
                deck.text(slide, deck.x(MARGIN_IN + 0.25, col_w - 0.25), top + 0.72, col_w - 0.25, 0.45,
                          str(highlight["label"]), 13, color="muted")
            top += 1.45
        deck.text(slide, deck.x(MARGIN_IN, col_w), top, col_w, 6.8 - top, page, 15 if with_chart else 17,
                  color="ink", gap=0.5)
        if with_chart:
            deck.framed_chart(slide, chart, deck.x(MARGIN_IN + col_w + 0.4, CONTENT_IN - col_w - 0.48), 1.88,
                              CONTENT_IN - col_w - 0.48, 4.95)


def _chart_slide(deck: _Deck, chart: Dict[str, Any]) -> None:
    label = chart.get("label") or deck.labels["charts"]
    slide = deck.slide(chart.get("desc", ""))
    top = deck.heading(slide, label, size=24)
    deck.framed_chart(slide, chart, 1.6, top, 13.333 - 3.2, 6.8 - top)


def _question_slides(deck: _Deck, answers: List[Dict[str, Any]]) -> None:
    for qa in answers:
        body = str(qa.get("answer") or "")
        if not qa.get("answerable", True):
            body += f"\n{deck.labels['not_answerable']}."
        question = str(qa.get("question") or "")
        pages = chunk_text(body, FULL_WIDTH_CHARS - 150)
        for i, page in enumerate(pages):
            slide = deck.slide(f"{question}\n\n{body}" if i == 0 else "")
            top = deck.heading(slide, question, kicker=deck.continued(deck.labels["your_questions"], i), size=24)
            deck.text(slide, MARGIN_IN, top, CONTENT_IN, 6.8 - top, page, 17, color="ink", gap=0.5)


def _meaning_slides(deck: _Deck, conclusion: str) -> None:
    """The conclusion on the theme's highlight colour."""
    L = deck.labels
    pages = chunk_text(conclusion, 760)
    for i, page in enumerate(pages):
        slide = deck.slide(conclusion if i == 0 else "", ground="mark", ink="on_mark")
        top = deck.heading(slide, deck.continued(L["what_it_means"], i), top=1.3, color="on_mark", size=40)
        size = 22 if len(pages) == 1 and _weight(conclusion) < 520 else 19
        deck.text(slide, MARGIN_IN, top + 0.1, CONTENT_IN, 6.75 - top, page, size, color="on_mark", gap=0.5)


def _how_we_know_slides(deck: _Deck, report, was_cleaned: bool, cleaning: List[str], dropped: List[str],
                        issues: List[str], confidence_score: Optional[int]) -> None:
    L = deck.labels
    items: List[Tuple[str, Dict[str, Any]]] = []
    for k, ins in enumerate(report.insights or [], 1):
        lines = [str(x) for x in ins.get("basedOn") or [] if x]
        if not lines:
            continue
        strength = str(ins.get("strength") or "")
        tag = f"   ·   {L[_STRENGTH_KEYS[strength]]}" if strength in _STRENGTH_KEYS else ""
        items.append((f"{k}. {ins.get('title', '')}{tag}", {"bold": True, "size": 13, "gap": 0.9}))
        items += [(f"•  {line}", {"size": 11.5, "color": "muted", "gap": 0.3}) for line in lines]

    notes: List[str] = []
    assumptions = getattr(report, "assumptions", "") or ""
    if assumptions:
        notes.append(f"{L['assumptions']}: {assumptions}")
    if report.dataQualitySection:
        notes += _lines(report.dataQualitySection)
    notes += [f"• {issue}" for issue in issues]
    english = L.get("rows") == "rows"
    if was_cleaned:
        for m in cleaning:
            if m in _METHOD_EXPLANATIONS:
                notes.append("• " + (_METHOD_EXPLANATIONS[m] if english else m.replace("_", " ")))
            elif ":" in m:
                name, col = m.split(":", 1)
                template = _METHOD_TEMPLATES.get(name)
                if template:
                    notes.append("• " + (template(col) if english else f"{name.replace('_', ' ')}: {col}"))
    if dropped:
        notes.append(f"{L['excluded']}: {', '.join(dropped)}")
    if notes:
        items.append((L["data_notes"], {"bold": True, "size": 13, "gap": 1.1, "head": True}))
        items += [(n, {"size": 11.5, "color": "ink", "gap": 0.35}) for n in notes]
    if confidence_score:
        score = max(0, min(10, int(confidence_score)))
        items.append((f"{L['confidence']}: {score}/10 ({confidence_word(score, L)})   " + "■" * score + "□" * (10 - score),
                      {"bold": True, "size": 13, "color": "accent", "gap": 1.1}))

    if not items:
        return
    # Pages by lines: about 21 lines of small text a slide, a line holding
    # some 150 characters across the slide.
    pages: List[List[Tuple[str, Dict[str, Any]]]] = [[]]
    used = 0.0
    for item in items:
        cost = -(-_weight(item[0]) // 150) + item[1].get("gap", 0.3)
        if pages[-1] and used + cost > 21:
            pages.append([])
            used = 0
        pages[-1].append(item)
        used += cost
    full = "\n".join(text for text, _ in items)
    for i, page in enumerate(pages):
        slide = deck.slide(full if i == 0 else "")
        top = deck.heading(slide, deck.continued(L["how_we_know"], i), kicker=L["methodology"], size=28)
        if i == 0:
            deck.text(slide, MARGIN_IN, top - 0.1, CONTENT_IN, 0.35, L["how_we_know_intro"], 12, color="muted",
                      shrink=False)
            top += 0.35
        deck.text(slide, MARGIN_IN, top, CONTENT_IN, 6.85 - top, page, 12)


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
    look: Optional[Look] = None,
    description: str = "",
    stats: Optional[Dict[str, Any]] = None,
    was_cleaned: bool = False,
    cleaning: Optional[List[str]] = None,
    dropped_columns: Optional[List[str]] = None,
    issues: Optional[List[str]] = None,
) -> bytes:
    """
    Build a .pptx presentation from an LLMReport, in `look` (Signature when none).

    Args:
        report:           LLMReport dataclass
        file_name:        original uploaded filename (shown on the cover)
        domain:           domain string
        charts:           generate_charts output; each sits beside its finding
        language:         report language, for labels and text direction
        confidence_score: the statistical confidence score, 1-10
        look:             theme, fonts (page size does not apply to slides)
        description:      what the data is, in a line, for the cover
        stats:            rowCount and columnCount, for the cover
        was_cleaned, cleaning, dropped_columns, issues: notes on the data

    Returns:
        bytes — the .pptx file contents
    """
    if not PPTX_AVAILABLE:
        raise ImportError("python-pptx is not installed. Run: pip install python-pptx")

    labels = labels_for(language)
    title = report.reportTitle or labels["report"]
    deck = _Deck(look or Look(), is_rtl(language), labels, title)
    deck.prs.core_properties.title = title
    deck.prs.core_properties.author = "DIG — Dataset Insight Generator"
    deck.prs.core_properties.subject = f"{domain.replace('_', ' ').title()} analysis of {file_name}"
    deck.prs.core_properties.language = language

    _cover(deck, report, file_name, domain, description, dict(stats or {}))

    if report.executiveSummary:
        _short_version(deck, report)

    charts = [c for c in (charts or []) if c.get("image_base64")]
    by_insight: Dict[int, List[Dict[str, Any]]] = {}
    for chart in charts:
        by_insight.setdefault(int(chart.get("insight_index") or 0), []).append(chart)
    used = set()
    insights = report.insights or []
    for k, insight in enumerate(insights, 1):
        index = int(insight.get("insight_index") or insight.get("rank") or k)
        own = [c for c in by_insight.get(index, []) if id(c) not in used]
        _finding_slides(deck, k, insight, len(insights), own)
        if own:
            used.add(id(own[0]))
    # Charts with no finding, and a finding's second chart, get slides of their own.
    for chart in charts:
        if id(chart) not in used:
            _chart_slide(deck, chart)

    answers = getattr(report, "questionAnswers", None) or []
    if answers:
        _question_slides(deck, answers)

    if report.conclusion:
        _meaning_slides(deck, report.conclusion)

    _how_we_know_slides(deck, report, was_cleaned, list(cleaning or []), list(dropped_columns or []),
                        list(issues or []), confidence_score)

    buf = io.BytesIO()
    deck.prs.save(buf)
    return buf.getvalue()
