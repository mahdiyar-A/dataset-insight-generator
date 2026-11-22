"""
The PDF report, made in a look (ai_engine/design/looks.py).

It used to be one dark navy page after another in Helvetica, whatever the data
and whoever read it, and its first page after the cover quoted p-values. Now
the pages run in the order a reader wants them:

  1. Cover        what the data is, the title, three key numbers and the short
                  version: everything someone needs if they read nothing else
  2. What we found  each finding as a headline, the one figure that makes it,
                  how firm it is in a word, the words, then its chart
  3. Your questions, when the person asked some
  4. What it means  the conclusion, set apart
  5. How we know  the statistics behind each finding, notes on the data,
                  cleaning and the confidence score, for anyone who checks

The look's fonts are embedded, so the file looks the same everywhere. Letters
those fonts lack (Greek in a statistic, a Persian column name) come from
DejaVu Sans, and Chinese from a CJK font on the system. Persian and Arabic
reports are set in DejaVu with HarfBuzz shaping, right to left.
"""

from __future__ import annotations

import base64
import datetime as _dt
import io
import os
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fpdf import FPDF

from ai_engine.design.looks import Look, Theme
from ai_engine.fonts import cjk_font_file, dejavu_dir, has_rtl, starts_rtl
from ai_engine.models.models import DomainResult, LLMReport
from ai_engine.report_labels import confidence_word, is_rtl, labels_for

# The confidence score is computed by ai_engine/core/confidence.py from the
# statistics, not by a model. Credits used to be hardcoded and went on naming
# Gemini 2.5 Flash and Llama 3.3 70B long after both had stopped running.
CONFIDENCE_CREDIT = "DIG's statistical engine"
SITE = "datainsightgen.com"

MARGIN = 18.0          # mm, left and right
TOP = 22.0             # where text starts on a page with the running head
BOTTOM = 20.0          # page break this far above the bottom edge


# ── Text for a font that only has Latin-1 ─────────────────────────────────────
# Used only when the look's font files are missing and the PDF falls back to
# Helvetica. Kept for the tests and for that fallback.

_LATIN_REPLACEMENTS = {
    "—": "-", "–": "-", "‒": "-",
    "‘": "'", "’": "'",
    "“": '"', "”": '"',
    "•": "-", "‣": "-",
    "…": "...",
    "·": "-", "×": "x", "÷": "/",
    "→": "->", "←": "<-",
    "↑": "^",  "↓": "v",
    "⇒": "=>",
    "≥": ">=", "≤": "<=",
    "≠": "!=",
    "⚠": "(!)",
    "✓": "OK", "✔": "OK",
    "✗": "X",  "✘": "X",
    "±": "+/-",
    "²": "^2", "³": "^3",
    "€": "EUR", "œ": "oe", "Œ": "OE", "−": "-",
    " ": " ", " ": " ", "​": "",
}


def _latin(text: str) -> str:
    for char, rep in _LATIN_REPLACEMENTS.items():
        text = text.replace(char, rep)
    return text


def _s(text: str) -> str:
    """Sanitize to latin-1 safe for FPDF Helvetica."""
    if not text:
        return ""
    return _latin(str(text)).encode("latin-1", errors="replace").decode("latin-1")


_GREEK = (("η²", "eta²"), ("η", "eta"), ("ρ", "rho"))


def _spelled(text: str) -> str:
    """The Greek in a statistic spelled out, for a font without Greek."""
    for char, rep in _GREEK:
        text = text.replace(char, rep)
    return text


def needs_unicode(*texts) -> bool:
    """True when some text has characters Helvetica cannot draw."""
    return any(ord(ch) > 255 for t in texts if t for ch in _latin(str(t)))


def _has_cjk(texts: Iterable[str]) -> bool:
    return any("⺀" <= ch <= "鿿" or "가" <= ch <= "힯" or "＀" <= ch <= "￯"
               for t in texts if t for ch in str(t))


# Languages whose letters the look's fonts do not have: set in DejaVu.
RTL_FONT_LANGUAGES = {"fa", "ar"}


def _number(value: Any) -> str:
    try:
        return f"{int(value):,}"
    except (TypeError, ValueError):
        return str(value if value is not None else "?")


def _words(text: str) -> str:
    """A domain or column name as words: "real_estate" -> "Real estate"."""
    raw = str(text or "").replace("_", " ").strip()
    return raw[:1].upper() + raw[1:]


# ─────────────────────────────────────────────────────────────────────────────
# The document
# ─────────────────────────────────────────────────────────────────────────────

class DigReport(FPDF):
    def __init__(self, look: Optional[Look] = None, language: str = "en", texts: Iterable[str] = (),
                 title: str = ""):
        self.look = look or Look()
        self.th: Theme = self.look.t
        width, height = self.look.page
        super().__init__(orientation="P", unit="mm", format=(width, height))
        self.W, self.H = width, height
        self.CW = width - 2 * MARGIN                      # content width
        self.set_margins(MARGIN, TOP, MARGIN)
        self.set_auto_page_break(auto=True, margin=BOTTOM)
        self.language = (language or "en")[:2].lower()
        self.labels = labels_for(language)
        self.rtl = is_rtl(language)
        self.running_title = title
        self.cover = True                                 # the first page has no running head
        texts = [str(t) for t in texts if t]
        self.core = not self._load_fonts(texts)
        if self.core and self.language in RTL_FONT_LANGUAGES | {"zh"}:
            # Without fonts for its letters the report would print "?": its
            # headings fall back to English.
            self.labels = labels_for("en")
            self.rtl = False

    # ── Fonts ─────────────────────────────────────────────────────────────
    def _add_face(self, name: str, files: Dict[str, str]) -> None:
        for style in ("", "B", "I", "BI"):
            path = files.get(style) or files.get(style.replace("I", "")) or files.get("")
            self.add_font(name, style, path)

    def _load_fonts(self, texts: List[str]) -> bool:
        """Register the look's fonts, and fallbacks for letters they lack. False if none could be."""
        folder = dejavu_dir()
        dejavu = None
        if folder:
            dejavu = {"": os.path.join(folder, "DejaVuSans.ttf"), "B": os.path.join(folder, "DejaVuSans-Bold.ttf")}
            if not self.rtl:
                dejavu["I"] = os.path.join(folder, "DejaVuSans-Oblique.ttf")
                dejavu["BI"] = os.path.join(folder, "DejaVuSans-BoldOblique.ttf")
        try:
            if self.language in RTL_FONT_LANGUAGES:
                if not dejavu:
                    print("[PDF] DejaVu Sans not found — Persian and Arabic text cannot be set", flush=True)
                    return False
                self._add_face("dighead", dejavu)
                self._add_face("digbody", dejavu)
            else:
                pair = self.look.f
                self._add_face("dighead", pair.heading.files)
                self._add_face("digbody", pair.body.files)
        except Exception as e:
            print(f"[PDF] the look's fonts are unusable, using Helvetica: {e}", flush=True)
            return False

        covered = set(getattr(self.fonts.get("digbody"), "cmap", {}) or {})
        covered &= set(getattr(self.fonts.get("dighead"), "cmap", {}) or {}) or covered
        wanted = {ord(ch) for t in texts for ch in t if ord(ch) > 32}
        fallbacks = []
        if dejavu and (not covered or wanted - covered):
            try:
                self.add_font("digfallback", "", dejavu[""])
                fallbacks.append("digfallback")
            except Exception as e:
                print(f"[PDF] DejaVu Sans unusable as a fallback: {e}", flush=True)
        if _has_cjk(texts):
            cjk = cjk_font_file()
            if cjk:
                try:
                    self.add_font("digcjk", "", cjk)
                    fallbacks.append("digcjk")
                except Exception as e:
                    print(f"[PDF] CJK font {cjk} unusable: {e}", flush=True)
        if fallbacks:
            self.set_fallback_fonts(fallbacks, exact_match=False)
        if self.rtl or has_rtl(*texts):
            try:
                import uharfbuzz  # noqa: F401  — the shaping engine fpdf2 uses
                self.set_text_shaping(use_shaping_engine=True)
            except ImportError:
                print("[PDF] uharfbuzz missing — Arabic-script text will not join", flush=True)
        return True

    def font(self, kind: str = "body", style: str = "", size: float = 10) -> None:
        """kind: "head" for headings and figures, "body" for text."""
        if self.core:
            self.set_font("Helvetica", style, size)
            return
        family = "dighead" if kind == "head" else "digbody"
        if kind == "head" and not self.look.f.heading_bold:
            style = style.replace("B", "")
        self.set_font(family, style, size)

    def t(self, text: Any) -> str:
        """Text made safe for the fonts in use."""
        if self.core:
            return _s(_spelled(str(text or "")))
        # fpdf2's bidi pass drops zero-width non-joiners before shaping, so the
        # Persian half-space vanished and the letters either side joined. A
        # narrow no-break space keeps them apart, as the half-space is set.
        return str(text or "").replace("‌", " ")

    # ── Colour ────────────────────────────────────────────────────────────
    def ink(self, name: str) -> None:
        self.set_text_color(*self.th.rgb(name))

    def fill(self, name: str) -> None:
        self.set_fill_color(*self.th.rgb(name))

    def faint(self) -> Tuple[int, int, int]:
        """The ink a fifth of the way from the paper: empty boxes, quiet lines."""
        ink, paper = self.th.rgb("ink"), self.th.rgb("paper")
        return tuple(round(p + (i - p) * 0.2) for i, p in zip(ink, paper))

    def draw(self, name: str) -> None:
        self.set_draw_color(*self.th.rgb(name))

    @property
    def shadow(self) -> str:
        return "accent" if self.th.dark else "ink"

    # ── Text that reads right to left aligns right unless told otherwise ──
    def multi_cell(self, w, h=None, text="", *args, **kwargs):
        if not self.core and not args and "align" not in kwargs:
            kwargs["align"] = "R" if starts_rtl(text) else "L"
        kwargs.setdefault("new_x", "LMARGIN")
        kwargs.setdefault("new_y", "NEXT")
        return super().multi_cell(w, h, text, *args, **kwargs)

    def cell(self, w=None, h=None, text="", *args, **kwargs):
        if not self.core and not args and "align" not in kwargs and starts_rtl(text):
            kwargs["align"] = "R"
        return super().cell(w, h, text, *args, **kwargs)

    def height_of(self, text: str, w: float, lh: float) -> float:
        """How tall `text` will be in the current font, without drawing it."""
        if not text:
            return 0.0
        return float(self.multi_cell(w, lh, self.t(text), dry_run=True, output="HEIGHT"))

    def room(self) -> float:
        return self.page_break_trigger - self.get_y()

    def ensure(self, needed: float) -> None:
        if needed > self.room():
            self.add_page()

    @property
    def al(self) -> str:
        return "R" if self.rtl else "L"

    # ── Page furniture ────────────────────────────────────────────────────
    def header(self):
        if self.th.paper.upper() != "#FFFFFF":
            self.fill("paper")
            self.rect(0, 0, self.W, self.H, "F")
        if self.cover:
            self.set_xy(MARGIN, MARGIN)
            return
        self.set_y(8)
        self.font("head", "B", 10)
        self.ink("accent")
        self.set_x(MARGIN)
        self.cell(self.CW, 6, "DIG", align="R" if self.rtl else "L")
        self.font("body", "", 7.5)
        self.ink("muted")
        title = self.running_title if len(self.running_title) <= 70 else self.running_title[:67].rstrip() + "..."
        self.set_x(MARGIN)
        self.cell(self.CW, 6, self.t(title), align="L" if self.rtl else "R")
        self.rule(15, heavy=False)
        self.set_xy(MARGIN, TOP)

    def footer(self):
        self.set_y(-12)
        self.font("body", "", 7.5)
        self.ink("muted")
        made = self.t(f"{self.labels['made_with']} · {SITE}")
        page = self.t(f"{self.labels['page']} {self.page_no()}")
        self.set_x(MARGIN)
        self.cell(self.CW, 5, made, align="R" if self.rtl else "L")
        self.set_x(MARGIN)
        self.cell(self.CW, 5, page, align="L" if self.rtl else "R")

    def rule(self, y: float, heavy: Optional[bool] = None) -> None:
        heavy = self.th.heavy_rules if heavy is None else heavy
        self.draw("ink" if heavy else "rule")
        self.set_line_width(0.6 if heavy else 0.25)
        self.line(MARGIN, y, self.W - MARGIN, y)

    def card(self, x: float, y: float, w: float, h: float, fill: str = "panel") -> None:
        """A box: on themes with heavy rules, an inked border and a hard offset shadow."""
        if self.th.heavy_rules:
            self.fill(self.shadow)
            self.rect(x + 1.4, y + 1.4, w, h, "F")
            self.fill(fill)
            self.draw("ink")
            self.set_line_width(0.5)
            self.rect(x, y, w, h, "DF")
        else:
            self.fill(fill)
            self.draw("rule")
            self.set_line_width(0.25)
            self.rect(x, y, w, h, "DF", round_corners=True, corner_radius=2)

    def chip(self, x: float, y: float, text: str, kind: str) -> float:
        """A small label; returns its width. kind: strong | clear | weak | fact | mark."""
        fills = {"strong": ("accent", "on_accent", None), "clear": ("mark", "on_mark", None),
                 "weak": ("paper", "muted", "rule"), "fact": ("panel", "ink", "rule"), "mark": ("mark", "on_mark", None)}
        bg, fg, border = fills.get(kind, fills["fact"])
        self.font("body", "B", 7.5)
        label = self.t(text)
        w = self.get_string_width(label) + 6
        if self.rtl:
            x = x - w
        self.fill(bg)
        if border:
            self.draw(border)
            self.set_line_width(0.25)
        self.rect(x, y, w, 5.6, "DF" if border else "F", round_corners=True, corner_radius=2.8)
        self.ink(fg)
        self.set_xy(x, y + 0.3)
        super().cell(w, 5, label, align="C")
        return w

    def kicker(self, text: str, color: str = "accent") -> None:
        self.font("body", "B", 8)
        self.ink(color)
        if not self.core:
            self.set_char_spacing(0.6 if not self.rtl and self.language != "zh" else 0)
        self.set_x(MARGIN)
        self.multi_cell(self.CW, 4.5, self.t(text.upper() if self.language not in ("zh",) else text), align=self.al)
        if not self.core:
            self.set_char_spacing(0)

    def section(self, title: str, kicker: str = "") -> None:
        """A section's heading: a small kicker, a large title and a rule."""
        self.ensure(30)
        if kicker:
            self.kicker(kicker)
            self.ln(1)
        self.font("head", "B", 22)
        self.ink("ink")
        self.set_x(MARGIN)
        self.multi_cell(self.CW, 10, self.t(title), align=self.al)
        self.rule(self.get_y() + 2)
        self.ln(7)

    def para(self, text: str, size: float = 10.5, color: str = "ink", lh: float = 5.6, style: str = "",
             x: Optional[float] = None, w: Optional[float] = None, kind: str = "body") -> None:
        if not text:
            return
        self.font(kind, style, size)
        self.ink(color)
        self.set_x(MARGIN if x is None else x)
        self.multi_cell(self.CW if w is None else w, lh, self.t(text))

    def bullet(self, text: str, size: float = 9, color: str = "muted") -> None:
        text = self.t(text)
        self.font("body", "", size)
        self.ink(color)
        y = self.get_y()
        if starts_rtl(text):
            self.set_xy(self.W - MARGIN - 5, y)
            super().cell(5, 4.8, "•" if not self.core else "-")
            self.set_x(MARGIN)
            self.multi_cell(self.CW - 6, 4.8, text)
        else:
            self.set_xy(MARGIN, y)
            super().cell(5, 4.8, "•" if not self.core else "-")
            self.set_x(MARGIN + 5)
            self.multi_cell(self.CW - 5, 4.8, text)
        self.ln(0.8)

    # ── A chart ───────────────────────────────────────────────────────────
    def _chart_box(self, data: bytes) -> Tuple[float, float, float]:
        """(image width, image height, padding) for a chart picture."""
        try:
            from PIL import Image as _PIL
            with _PIL.open(io.BytesIO(data)) as im:
                px_w, px_h = im.size
            ratio = px_h / px_w if px_w else 0.56
        except Exception:
            ratio = 0.56
        pad = 3.0 if self.th.heavy_rules else 0.0
        w = self.CW - (2 * pad + 1.4 if self.th.heavy_rules else 0)
        img_h = min(w * ratio, self.H * 0.42)
        return (img_h / ratio if ratio else w), img_h, pad

    def chart_height(self, img_b64: str, caption: str) -> float:
        """The height a chart and its caption will take."""
        try:
            _, img_h, pad = self._chart_box(base64.b64decode(img_b64))
        except Exception:
            return 0.0
        self.font("body", "", 8.5)
        return img_h + 2 * pad + (self.height_of(caption, self.CW, 4.4) + 2 if caption else 0) + 6

    def chart(self, img_b64: str, caption: str) -> None:
        try:
            data = base64.b64decode(img_b64)
            w, img_h, pad = self._chart_box(data)
            framed = self.th.heavy_rules
            self.ensure(self.chart_height(img_b64, caption))
            y = self.get_y() + 1
            x = MARGIN + (self.CW - 1.4 - (w + 2 * pad)) / 2 if framed else MARGIN + (self.CW - w) / 2
            if framed:
                self.card(x, y, w + 2 * pad, img_h + 2 * pad)
            self.image(io.BytesIO(data), x=x + pad, y=y + pad, w=w, h=img_h)
            self.set_y(y + img_h + 2 * pad + (3.5 if framed else 2))
            if caption:
                self.para(caption, size=8.5, color="muted", lh=4.4)
            self.ln(4)
        except Exception as e:
            print(f"[PDF] Failed to embed a chart: {e}", flush=True)


# ─────────────────────────────────────────────────────────────────────────────
# The pages
# ─────────────────────────────────────────────────────────────────────────────

def _key_numbers(report: LLMReport, stats_summary: Dict, L: Dict[str, str]) -> List[Dict[str, str]]:
    """The three figures on the cover: the writer's, checked, or the file's own size."""
    picked = [k for k in getattr(report, "keyNumbers", None) or [] if k.get("value")][:3]
    if len(picked) >= 2:
        return picked
    own = [{"value": _number(stats_summary.get("rowCount", "?")), "label": L["rows"]},
           {"value": _number(stats_summary.get("columnCount", "?")), "label": L["columns"]},
           {"value": str(len(report.insights or [])), "label": L["findings_count"]}]
    return (picked + own)[:3]


def _cover(pdf: DigReport, report: LLMReport, stats_summary: Dict, file_name: str,
           domain: Optional[DomainResult]) -> bool:
    """The first page. Returns whether the short version fitted on it."""
    L = pdf.labels
    # Brand row
    pdf.set_xy(MARGIN, 16)
    pdf.font("head", "B", 15)
    pdf.ink("accent")
    pdf.cell(pdf.CW, 8, "DIG", align=pdf.al)
    pdf.set_xy(MARGIN, 16)
    pdf.font("body", "", 8)
    pdf.ink("muted")
    pdf.cell(pdf.CW, 8, pdf.t(_dt.date.today().isoformat()), align="L" if pdf.rtl else "R")
    pdf.rule(27)

    # What the data is, then the title
    pdf.set_y(38)
    described = (getattr(domain, "description", "") or "") if domain else ""
    pdf.kicker(described or _words(domain.domain if domain else "") or L["report"])
    pdf.ln(3)
    title = report.reportTitle or L["report"]
    size = 30 if len(title) <= 48 else 25 if len(title) <= 80 else 21
    pdf.font("head", "B", size)
    pdf.ink("ink")
    pdf.set_x(MARGIN)
    pdf.multi_cell(pdf.CW, size * 0.45, pdf.t(title), align=pdf.al)
    pdf.ln(3)
    meta = f"{file_name} · {_number(stats_summary.get('rowCount', '?'))} {L['rows']} · " \
           f"{_number(stats_summary.get('columnCount', '?'))} {L['columns']}"
    pdf.para(meta, size=8.5, color="muted", lh=4.5)
    pdf.ln(4)
    if report.introduction:
        pdf.para(report.introduction, size=11.5, color="muted", lh=6.2)
        pdf.ln(4)

    # Three key numbers
    numbers = _key_numbers(report, stats_summary, L)
    gap = 6.0
    card_w = (pdf.CW - 1.4 - gap * (len(numbers) - 1)) / max(1, len(numbers))
    pdf.font("body", "", 8.5)
    label_h = max([pdf.height_of(n.get("label", ""), card_w - 10, 4.2) for n in numbers] + [4.2])
    card_h = 12 + 11 + label_h
    pdf.ensure(card_h + 8)
    y = pdf.get_y() + 2
    order = list(range(len(numbers)))
    for slot, k in enumerate(reversed(order) if pdf.rtl else order):
        n = numbers[k]
        x = MARGIN + slot * (card_w + gap)
        first = k == 0
        pdf.card(x, y, card_w, card_h, fill="mark" if first else "panel")
        value = pdf.t(n.get("value", ""))
        vsize = 24 if len(value) <= 7 else 19 if len(value) <= 11 else 15
        pdf.font("head", "B", vsize)
        pdf.ink("on_mark" if first else "accent")
        pdf.set_xy(x + 5, y + 5)
        pdf.cell(card_w - 10, 11, value, align=pdf.al)
        pdf.font("body", "", 8.5)
        pdf.ink("on_mark" if first else "muted")
        pdf.set_xy(x + 5, y + 17)
        pdf.multi_cell(card_w - 10, 4.2, pdf.t(n.get("label", "")), align=pdf.al)
    pdf.set_y(y + card_h + 10)

    # The short version, if it fits on this page
    summary = report.executiveSummary or ""
    fitted = True
    if summary:
        pdf.font("body", "", 10.5)
        # Measured at the width it is written in: measured wider, the text
        # can wrap to a line more than the box was made for.
        text_w = pdf.CW - 15.4
        text_h = pdf.height_of(summary, text_w, 5.6)
        box_h = text_h + 22
        if box_h > pdf.room() - 4:
            fitted = False
        else:
            y = pdf.get_y()
            pdf.card(MARGIN, y, pdf.CW - 1.4, box_h)
            pdf.chip(pdf.W - MARGIN - 7 if pdf.rtl else MARGIN + 7, y + 6, L["short_version"], "mark")
            pdf.set_xy(MARGIN + 7, y + 15)
            pdf.para(summary, size=10.5, color="ink", lh=5.6, x=MARGIN + 7, w=text_w)
            pdf.set_y(y + box_h + 8)
    _inside(pdf, report)
    return fitted


def _inside(pdf: DigReport, report: LLMReport) -> None:
    """The findings' headlines, numbered, when the cover has room for all of them."""
    titles = [str(ins.get("title") or "") for ins in report.insights or [] if ins.get("title")]
    if not titles:
        return
    pdf.font("body", "", 10)
    rows = [max(6.0, pdf.height_of(t, pdf.CW - 12, 5) + 1.5) for t in titles]
    if 10 + sum(rows) > pdf.room() - 2:
        return
    pdf.kicker(pdf.labels["what_we_found"], color="muted")
    pdf.ln(2)
    for k, (t, h) in enumerate(zip(titles, rows), 1):
        y = pdf.get_y()
        pdf.font("head", "B", 10)
        pdf.ink("accent")
        pdf.set_xy(pdf.W - MARGIN - 8 if pdf.rtl else MARGIN, y)
        pdf.cell(8, 5, f"{k:02d}", align="R" if pdf.rtl else "L")
        pdf.font("body", "", 10)
        pdf.ink("ink")
        pdf.set_xy(MARGIN if pdf.rtl else MARGIN + 10, y)
        pdf.multi_cell(pdf.CW - 10, 5, pdf.t(t), align=pdf.al)
        pdf.set_y(y + h)


_STRENGTH_KEYS = {"strong": "strength_strong", "clear": "strength_clear", "weak": "strength_weak",
                  "fact": "strength_fact"}

# The labels a PDF can print, so their letters are known before the fonts are
# chosen. The templates for "Based on" lines are not here: the lines arrive
# already written.
_SHOWN_LABELS = ("report", "made_with", "page", "rows", "columns", "findings_count", "short_version",
                 "what_we_found", "more_charts", "your_questions", "not_answerable", "what_it_means",
                 "how_we_know", "how_we_know_intro", "methodology", "data_notes", "assumptions", "issues_found",
                 "preparation", "excluded", "not_cleaned_note", "confidence", "low_confidence_note", "high",
                 "medium", "low", *_STRENGTH_KEYS.values())


def _finding(pdf: DigReport, number: int, ins: Dict[str, Any], charts: List[Dict[str, Any]], last: bool) -> None:
    L = pdf.labels
    title, body = str(ins.get("title") or ""), str(ins.get("body") or "")
    highlight = ins.get("highlight") if isinstance(ins.get("highlight"), dict) else None
    strength = str(ins.get("strength") or "")

    badge = 10.0
    title_w = pdf.CW - badge - 4
    pdf.font("head", "B", 15)
    title_h = max(badge, pdf.height_of(title, title_w, 7))
    pdf.font("body", "", 10.5)
    body_h = pdf.height_of(body, pdf.CW, 5.6)
    head_h = title_h + 3 + (15 if highlight else 0) + (8.5 if strength else 0)
    pictures = [ch for ch in charts if ch.get("image_base64")]
    whole = head_h + body_h + 4 + (pdf.chart_height(pictures[0]["image_base64"], pictures[0].get("desc") or "")
                                   if pictures else 0)
    usable = pdf.page_break_trigger - TOP
    # A finding starts on a new page when it would fit there whole but not
    # here, so its chart is not parted from its words; a long one only needs
    # its headline and first lines together.
    if whole > pdf.room() and whole <= usable:
        pdf.add_page()
    else:
        pdf.ensure(head_h + min(body_h, 3 * 5.6) + 6)

    # Number badge and headline
    y = pdf.get_y()
    bx = pdf.W - MARGIN - badge if pdf.rtl else MARGIN
    pdf.fill("accent")
    pdf.rect(bx, y, badge, badge, "F")
    pdf.font("head", "B", 13)
    pdf.ink("on_accent")
    pdf.set_xy(bx, y + 1.5)
    pdf.cell(badge, 7, str(number), align="C")
    pdf.font("head", "B", 15)
    pdf.ink("ink")
    pdf.set_xy(MARGIN if pdf.rtl else MARGIN + badge + 4, y + 1.2)
    pdf.multi_cell(title_w, 7, pdf.t(title), align=pdf.al)
    pdf.set_y(max(pdf.get_y(), y + badge) + 3)

    # How firm it is, in a word
    if strength in _STRENGTH_KEYS:
        y = pdf.get_y()
        pdf.chip(pdf.W - MARGIN if pdf.rtl else MARGIN, y, L[_STRENGTH_KEYS[strength]], strength)
        pdf.set_y(y + 8.5)

    # The one figure that makes it
    if highlight and highlight.get("value"):
        y = pdf.get_y()
        value = pdf.t(highlight["value"])
        pdf.font("head", "B", 20)
        vw = pdf.get_string_width(value) + 3
        pdf.fill("accent")
        bar_x = pdf.W - MARGIN - 1.2 if pdf.rtl else MARGIN
        pdf.rect(bar_x, y, 1.2, 11, "F")
        pdf.ink("accent")
        if pdf.rtl:
            pdf.set_xy(pdf.W - MARGIN - 4 - vw, y)
        else:
            pdf.set_xy(MARGIN + 4, y)
        pdf.cell(vw, 11, value)
        label = highlight.get("label", "")
        if label:
            pdf.font("body", "", 9.5)
            pdf.ink("muted")
            lw = pdf.CW - vw - 8
            pdf.font("body", "", 9.5)
            lh = pdf.height_of(label, lw, 4.6)
            if pdf.rtl:
                pdf.set_xy(MARGIN, y + max(0.0, (11 - lh) / 2))
            else:
                pdf.set_xy(MARGIN + 6 + vw, y + max(0.0, (11 - lh) / 2))
            pdf.multi_cell(lw, 4.6, pdf.t(label), align=pdf.al)
        pdf.set_y(y + 15)

    pdf.para(body, size=10.5, color="ink", lh=5.6)
    pdf.ln(4)
    for ch in charts:
        if ch.get("image_base64"):
            pdf.chart(ch["image_base64"], ch.get("desc", "") or "")
    if not last:
        pdf.ln(1)
        pdf.ensure(8)
        pdf.draw("rule")
        pdf.set_line_width(0.25)
        pdf.line(MARGIN, pdf.get_y(), pdf.W - MARGIN, pdf.get_y())
        pdf.ln(7)


def _meaning(pdf: DigReport, conclusion: str) -> None:
    """The conclusion, set apart on the theme's highlight colour."""
    L = pdf.labels
    pdf.font("body", "", 11)
    text_w = pdf.CW - 17.4          # the width it is written in, below
    text_h = pdf.height_of(conclusion, text_w, 6)
    box_h = text_h + 26
    usable = pdf.page_break_trigger - TOP
    if box_h > usable:
        pdf.section(L["what_it_means"])
        pdf.para(conclusion, size=11, lh=6)
        return
    pdf.ensure(box_h + 6)
    y = pdf.get_y() + 2
    pdf.card(MARGIN, y, pdf.CW - 1.4, box_h, fill="mark")
    pdf.font("head", "B", 17)
    pdf.ink("on_mark")
    pdf.set_xy(MARGIN + 8, y + 7)
    pdf.cell(pdf.CW - 17.4, 8, pdf.t(L["what_it_means"]), align=pdf.al)
    pdf.font("body", "", 11)
    pdf.ink("on_mark")
    pdf.set_xy(MARGIN + 8, y + 18)
    pdf.multi_cell(text_w, 6, pdf.t(conclusion))
    pdf.set_y(y + box_h + 8)


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


def _how_we_know(pdf: DigReport, report: LLMReport, stats_summary: Dict, was_cleaned: bool,
                 domain: Optional[DomainResult], dropped_columns: List[str], score: int) -> None:
    L = pdf.labels
    pdf.add_page()
    pdf.section(L["how_we_know"], kicker=L["methodology"])
    pdf.para(L["how_we_know_intro"], size=9.5, color="muted", lh=5)
    pdf.ln(4)

    # The statistics behind each finding
    for k, ins in enumerate(report.insights or [], 1):
        lines = [str(x) for x in ins.get("basedOn") or [] if x]
        if not lines:
            continue
        pdf.ensure(16)
        pdf.para(f"{k}. {ins.get('title', '')}", size=9.5, color="ink", lh=5, style="B")
        strength = str(ins.get("strength") or "")
        if strength in _STRENGTH_KEYS:
            pdf.para(L[_STRENGTH_KEYS[strength]], size=8, color="accent", lh=4.4, style="B")
        for line in lines:
            pdf.bullet(line, size=8.8)
        pdf.ln(2.5)

    # Notes on the data
    assumptions = getattr(report, "assumptions", "") or ""
    key_issues = list((domain.key_issues if domain else None) or [])
    detected = list(stats_summary.get("detectedIssues") or [])
    issues = key_issues + [i for i in detected if i not in key_issues]
    if report.dataQualitySection or assumptions or issues or was_cleaned:
        pdf.ensure(24)
        pdf.ln(2)
        pdf.font("head", "B", 13)
        pdf.ink("ink")
        pdf.set_x(MARGIN)
        pdf.multi_cell(pdf.CW, 7, pdf.t(L["data_notes"]), align=pdf.al)
        pdf.ln(1.5)
    if assumptions:
        pdf.para(L["assumptions"], size=9.5, color="accent", lh=5, style="B")
        pdf.para(assumptions, size=9.5, color="ink", lh=5)
        pdf.ln(2)
    if report.dataQualitySection:
        pdf.para(report.dataQualitySection, size=9.5, color="ink", lh=5)
        pdf.ln(2)
    if issues:
        pdf.para(f"{L['issues_found']}:", size=9.5, color="ink", lh=5, style="B")
        pdf.ln(0.5)
        for issue in issues:
            pdf.bullet(issue)
        pdf.ln(2)
    if was_cleaned:
        pdf.para(f"{L['preparation']}:", size=9.5, color="ink", lh=5, style="B")
        pdf.ln(0.5)
        english = pdf.labels.get("rows") == "rows"
        for m in (domain.cleaning_methods if domain else None) or []:
            if m in _METHOD_EXPLANATIONS:
                pdf.bullet(_METHOD_EXPLANATIONS[m] if english else m.replace("_", " "))
            elif ":" in m:
                name, col = m.split(":", 1)
                template = _METHOD_TEMPLATES.get(name)
                if template:
                    pdf.bullet(template(col) if english else f"{name.replace('_', ' ')}: {col}")
        if dropped_columns:
            pdf.ln(1)
            pdf.para(f"{L['excluded']}: {', '.join(dropped_columns)}", size=9, color="muted", lh=4.8)
        pdf.ln(2)
    elif issues:
        pdf.para(L["not_cleaned_note"], size=9, color="muted", lh=4.8)
        pdf.ln(2)

    # Confidence
    pdf.ensure(26)
    pdf.ln(2)
    pdf.rule(pdf.get_y(), heavy=False)
    pdf.ln(5)
    word = confidence_word(score, L)
    label, value = pdf.t(f"{L['confidence']}:"), pdf.t(f"{score}/10 ({word})")
    pdf.font("body", "B", 9.5)
    lw, vw = pdf.get_string_width(label) + 3, pdf.get_string_width(value) + 4
    y = pdf.get_y()
    if pdf.rtl:
        lx, vx = pdf.W - MARGIN - lw, pdf.W - MARGIN - lw - vw
        bar_x = vx - 4 - 10 * 6
    else:
        lx, vx = MARGIN, MARGIN + lw
        bar_x = vx + vw + 4
    pdf.ink("muted")
    pdf.set_xy(lx, y)
    pdf.cell(lw, 5, label)
    pdf.ink("accent")
    pdf.set_xy(vx, y)
    pdf.cell(vw, 5, value)
    for i in range(10):
        bx = bar_x + (9 - i if pdf.rtl else i) * 6
        if i < score:
            pdf.fill("accent")
        else:
            pdf.set_fill_color(*pdf.faint())
        pdf.rect(bx, y + 1, 5, 3, "F")
    pdf.set_y(y + 8)
    if score <= 4:
        pdf.para(L["low_confidence_note"].format(score=score), size=8.8, color="muted", lh=4.6)
        pdf.ln(2)

    writer = getattr(report, "writerModel", "") or ""
    g_score = getattr(report, "geminiConfidenceScore", None)
    note = (f"Confidence assessed by {CONFIDENCE_CREDIT} from sample size, completeness and the strength of "
            f"the statistical evidence ({score}/10). It rates the data, not the writing.")
    if writer:
        note += f" Written by {writer}" + (f", which rated its own report {g_score}/10." if g_score else ".")
    elif str(getattr(report, "rawResponse", "") or "").startswith("[fallback"):
        note += " No AI writer was available: this is a statistics-only report."
    pdf.para(note, size=7.5, color="muted", lh=4)


# ─────────────────────────────────────────────────────────────────────────────
# Main build function
# ─────────────────────────────────────────────────────────────────────────────

def build_pdf(
    report:                 LLMReport,
    charts:                 List[Dict[str, Any]],
    stats_summary:          Dict,
    was_cleaned:            bool,
    file_name:              str,
    domain:                 Optional[DomainResult] = None,
    judge_confidence_score: int = 6,
    judge_confidence_level: str = "MEDIUM",
    dropped_columns:        Optional[List[str]] = None,
    language:               str = "en",
    look:                   Optional[Look] = None,
    reading:                Any = None,
) -> str:
    """The report as a PDF in `look` (the free plan's Signature when none), base64."""
    dropped_columns = list(dropped_columns or [])
    texts = [report.reportTitle, report.introduction, report.executiveSummary, report.confidenceNote,
             report.conclusion, report.dataQualitySection, getattr(report, "assumptions", ""), file_name,
             getattr(domain, "description", "") if domain else ""]
    for ins in report.insights or []:
        texts += [ins.get("title"), ins.get("body")] + [str(x) for x in ins.get("basedOn") or []]
        if isinstance(ins.get("highlight"), dict):
            texts += [ins["highlight"].get("value"), ins["highlight"].get("label")]
    for k in getattr(report, "keyNumbers", None) or []:
        texts += [k.get("value"), k.get("label")]
    for qa in getattr(report, "questionAnswers", None) or []:
        texts += [qa.get("question"), qa.get("answer")]
    for ch in charts or []:
        texts += [ch.get("label"), ch.get("desc")]
    texts += dropped_columns + list(stats_summary.get("detectedIssues") or [])
    texts += list((domain.key_issues if domain else None) or [])
    labels = labels_for(language)
    texts += [labels[k] for k in _SHOWN_LABELS]

    pdf = DigReport(look, language, texts=[str(t) for t in texts if t], title=report.reportTitle or "")
    L = pdf.labels
    pdf.add_page()

    # 1. Cover
    fitted = _cover(pdf, report, stats_summary, file_name, domain)

    # 2. What we found
    pdf.cover = False
    pdf.add_page()
    if not fitted and report.executiveSummary:
        pdf.section(L["short_version"])
        pdf.para(report.executiveSummary, size=10.5, lh=5.6)
        pdf.ln(8)
    pdf.section(L["what_we_found"])
    by_insight: Dict[int, List[Dict[str, Any]]] = {}
    for ch in charts or []:
        by_insight.setdefault(int(ch.get("insight_index") or 0), []).append(ch)
    insights = list(report.insights or [])
    shown = set()
    for k, ins in enumerate(insights, 1):
        idx = int(ins.get("insight_index") or ins.get("rank") or k)
        mine = by_insight.get(idx, []) if idx not in shown else []
        shown.add(idx)
        _finding(pdf, k, ins, mine, last=k == len(insights))
    left_over = [ch for i, chs in by_insight.items() if i not in shown for ch in chs]
    if left_over:
        pdf.ln(4)
        pdf.section(L["more_charts"])
        for ch in left_over:
            if ch.get("image_base64"):
                pdf.chart(ch["image_base64"], ch.get("desc", "") or "")

    # 3. Your questions
    answers = getattr(report, "questionAnswers", None) or []
    if answers:
        pdf.ln(4)
        pdf.section(L["your_questions"])
        for qa in answers:
            pdf.ensure(22)
            pdf.para(qa.get("question", ""), size=12, color="ink", lh=6, style="B", kind="head")
            pdf.ln(1)
            pdf.para(qa.get("answer", ""), size=10.5, lh=5.6)
            if not qa.get("answerable", True):
                pdf.para(L["not_answerable"], size=9, color="muted", lh=4.8)
            pdf.ln(4)

    # 4. What it means
    if report.conclusion:
        pdf.ln(2)
        _meaning(pdf, report.conclusion)

    # 5. How we know
    _how_we_know(pdf, report, stats_summary, was_cleaned, domain, dropped_columns,
                 int(judge_confidence_score or 6))

    out = pdf.output()
    return base64.b64encode(bytes(out)).decode("utf-8")
