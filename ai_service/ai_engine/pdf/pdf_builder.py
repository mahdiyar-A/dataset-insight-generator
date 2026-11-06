"""
PDF Report Builder  —  Phase 7

Page structure:
  1. Cover page
  2. Executive Summary  (+ inline confidence note)
  3. Key Insights  (insight blocks interleaved with their charts)
  4. Conclusion
  5. Data Quality & Methodology  (last page — confidence score badge, writer's assessment,
                                   cleaning details, dropped columns, judge verdict)
"""

import io
import base64
import tempfile
import os
from typing import List, Dict, Any, Optional
from fpdf import FPDF
from ai_engine.models.models import LLMReport, DomainResult
from ai_engine.fonts import cjk_font_file, dejavu_dir, has_rtl, starts_rtl
from ai_engine.report_labels import confidence_word, is_rtl, labels_for


# ── Brand palette ─────────────────────────────────────────────────────────────
BRAND_DARK  = (15,  23,  42)
BRAND_MID   = (30,  41,  59)
BRAND_BLUE  = (59, 130, 246)
BRAND_TEXT  = (255, 255, 255)
BRAND_MUTED = (148, 163, 184)
WHITE       = (255, 255, 255)
ACCENT_GOLD = (251, 191, 36)
GREEN_RGB   = (16,  185, 129)
ORANGE_RGB  = (249, 115,  22)
RED_RGB     = (239,  68,  68)

INSIGHT_COLORS = [
    (59,  130, 246),
    (168,  85, 247),
    (16,  185, 129),
    (249, 115,  22),
    (236,  72, 153),
]

PAGE_BOTTOM = 268   # mm — safe lower bound before footer


# ── Text sanitizer ────────────────────────────────────────────────────────────

# The confidence score is computed by ai_engine/core/confidence.py from the
# statistics, not by a model. Credits used to be hardcoded and went on naming
# Gemini 2.5 Flash and Llama 3.3 70B long after both had stopped running.
CONFIDENCE_CREDIT = "DIG's statistical engine"

_LATIN_REPLACEMENTS = {
    "\u2014": "-", "\u2013": "-", "\u2012": "-",
    "\u2018": "'", "\u2019": "'",
    "\u201c": '"', "\u201d": '"',
    "\u2022": "-", "\u2023": "-",
    "\u2026": "...",
    "\u00b7": "-", "\u00d7": "x", "\u00f7": "/",
    "\u2192": "->", "\u2190": "<-",
    "\u2191": "^",  "\u2193": "v",
    "\u21d2": "=>",
    "\u2265": ">=", "\u2264": "<=",
    "\u2260": "!=",
    "\u26a0": "(!)",
    "\u2713": "OK", "\u2714": "OK",
    "\u2717": "X",  "\u2718": "X",
    "\u00b1": "+/-",
    "\u00b2": "^2", "\u00b3": "^3",
    "\u20ac": "EUR", "\u0153": "oe", "\u0152": "OE", "\u2212": "-",
    "\u202f": " ", "\u2009": " ", "\u200b": "",
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


def needs_unicode(*texts) -> bool:
    """True when some text has characters Helvetica cannot draw."""
    return any(ord(ch) > 255 for t in texts if t for ch in _latin(str(t)))


# ── Fonts for scripts Helvetica cannot draw ───────────────────────────────────
# Helvetica covers Western European text only: a Persian, Arabic or Chinese
# report came out as rows of "?". Those languages use DejaVu Sans, which
# matplotlib already ships (Latin, Arabic and Persian in regular and bold),
# with HarfBuzz shaping so Arabic letters join and lines run right to left,
# and a CJK font found on the system for Chinese. Other languages keep
# Helvetica, so their layout is unchanged.
UNICODE_LANGUAGES = {"fa", "ar", "zh"}


def _text_units(text: str) -> int:
    """Length with wide (CJK) characters counted twice."""
    return len(text) + sum(1 for ch in text if "\u2e80" <= ch <= "\u9fff")


# ── FPDF subclass ─────────────────────────────────────────────────────────────
class DigReport(FPDF):
    def __init__(self, language: str = "en", unicode_text: bool = False, shaping: bool = False):
        """
        unicode_text: the report holds characters Helvetica cannot draw (a
                      Persian column name in an English report, say).
        shaping:      it holds right-to-left script, which HarfBuzz must join.
        """
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=20)
        self.set_margins(20, 20, 20)
        self.labels = labels_for(language)
        self.rtl = is_rtl(language)
        wanted = unicode_text or (language or "en")[:2].lower() in UNICODE_LANGUAGES
        self.unicode = wanted and self._load_unicode_fonts(shaping or self.rtl)
        if wanted and not self.unicode:
            # Without the fonts, labels in Persian or Chinese would print as
            # "?" too: the report falls back to English headings.
            self.labels = labels_for("en")
            self.rtl = False
        # DejaVu runs about a tenth wider than Helvetica; box heights are
        # estimated from character counts, so they grow to match.
        self.width_factor = 1.12 if self.unicode else 1.0

    def _load_unicode_fonts(self, shaping: bool) -> bool:
        folder = dejavu_dir()
        if folder is None:
            print("[PDF] DejaVu Sans not found — non-Latin text will not render", flush=True)
            return False
        regular, bold = os.path.join(folder, "DejaVuSans.ttf"), os.path.join(folder, "DejaVuSans-Bold.ttf")
        if self.rtl:
            # Arabic script is not set in italics, and DejaVu's oblique faces
            # have no Arabic letters: italic text stays upright.
            italic, bold_italic = regular, bold
        else:
            italic = os.path.join(folder, "DejaVuSans-Oblique.ttf")
            bold_italic = os.path.join(folder, "DejaVuSans-BoldOblique.ttf")
        try:
            for style, path in (("", regular), ("B", bold), ("I", italic), ("BI", bold_italic)):
                self.add_font("DejaVu", style, path)
            # Letters an italic face lacks come from the upright one.
            self.add_font("DejaVuUpright", "", regular)
        except Exception as e:
            print(f"[PDF] DejaVu Sans unusable: {e}", flush=True)
            return False
        fallbacks = ["DejaVuUpright"]
        cjk = cjk_font_file()
        if cjk:
            try:
                self.add_font("CJK", "", cjk)
                fallbacks.append("CJK")
            except Exception as e:
                print(f"[PDF] CJK font {cjk} unusable: {e}", flush=True)
        self.set_fallback_fonts(fallbacks, exact_match=False)
        if shaping:
            try:
                import uharfbuzz  # noqa: F401  — the shaping engine fpdf2 uses
                self.set_text_shaping(use_shaping_engine=True)
            except ImportError:
                print("[PDF] uharfbuzz missing — Arabic-script text will not join", flush=True)
        return True

    def set_font(self, family=None, style="", size=0):
        if self.unicode and family and family.lower() in ("helvetica", "arial", "times", "courier"):
            family = "DejaVu"
        return super().set_font(family, style, size)

    def t(self, text) -> str:
        """Text made safe for the current fonts."""
        if self.unicode:
            # fpdf2's bidi pass drops zero-width non-joiners before shaping, so
            # the Persian half-space in "فرض‌ها" vanished and the letters on
            # either side joined. A narrow no-break space keeps them apart, and
            # is how the half-space is usually typeset.
            return str(text or "").replace("\u200c", "\u202f")
        return _s(text)

    # Text that reads right to left is aligned to the right unless the call
    # says otherwise. Each paragraph goes by its own first letter, so English
    # issue notes stay left-aligned in a Persian report and a Persian question
    # sits on the right in an English one.
    def multi_cell(self, w, h=None, text="", *args, **kwargs):
        if self.unicode and not args and "align" not in kwargs and starts_rtl(text):
            kwargs["align"] = "R"
        return super().multi_cell(w, h, text, *args, **kwargs)

    def cell(self, w=None, h=None, text="", *args, **kwargs):
        if self.unicode and not args and "align" not in kwargs and starts_rtl(text):
            kwargs["align"] = "R"
        return super().cell(w, h, text, *args, **kwargs)

    def bullet(self, text: str, color=(180, 190, 205), size: int = 9) -> None:
        """A dash and an indented line; the dash sits on the right for right-to-left text."""
        text = self.t(text)
        self.set_font("Helvetica", "", size)
        self.set_text_color(*color)
        y = self.get_y()
        if starts_rtl(text):
            self.set_xy(182, y)
            super().cell(8, 5, "-")
            self.set_xy(20, y)
            self.multi_cell(160, 5, text)
        else:
            self.set_xy(20, y)
            super().cell(8, 5, "-")
            self.set_x(28)
            self.multi_cell(158, 5, text)

    def header(self):
        self.set_fill_color(*BRAND_DARK)
        self.rect(0, 0, 210, 297, "F")
        self.set_fill_color(*BRAND_MID)
        self.rect(0, 0, 210, 14, "F")
        self.set_y(3)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*BRAND_BLUE)
        self.cell(0, 8, "DIG  |  Dataset Insight Generator", align="L")
        self.set_y(20)

    def footer(self):
        self.set_y(-13)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*BRAND_MUTED)
        self.cell(0, 8, self.t(f"{self.labels['page']} {self.page_no()}  |  {self.labels['generated_by']}"),
                  align="C")

    def section_title(self, text: str):
        self.ln(4)
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*BRAND_BLUE)
        self.cell(0, 8, self.t(text), ln=True)
        y = self.get_y()
        self.set_draw_color(*BRAND_BLUE)
        self.set_line_width(0.4)
        self.line(20, y, 190, y)
        self.ln(3)

    def body_text(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*BRAND_TEXT)
        self.multi_cell(0, 6, self.t(text))
        self.ln(2)

    def muted_text(self, text: str):
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(*BRAND_MUTED)
        self.multi_cell(0, 5, self.t(text))
        self.ln(1)

    def _estimate_text_height(self, text: str, width_mm: float,
                               line_h: float = 5.5, char_w: float = 1.85) -> float:
        """
        Estimate rendered height of text in a multi_cell.
        char_w: average character width in mm at 10pt Helvetica (~1.85mm).
        For 11pt bold title use char_w=2.0.
        """
        chars_per_line = max(1, int(width_mm / (char_w * self.width_factor)))
        lines = max(1, _text_units(text) // chars_per_line + text.count("\n") + 1)
        return lines * line_h

    # ── Insight block ─────────────────────────────────────────────────────
    def insight_block(self, rank: int, title: str, body: str, color_rgb: tuple):
        # Use accurate per-font estimates:
        # title  = 11pt bold  → char_w≈2.0, line_h=6.0
        # body   = 10pt reg   → char_w≈1.85, line_h=5.5
        title_h = self._estimate_text_height(title, 152, line_h=6.0, char_w=2.0) + 6
        body_h  = self._estimate_text_height(body,  162, line_h=5.5, char_w=1.85)
        padding = 10
        total_h = title_h + body_h + padding

        if self.get_y() + total_h > PAGE_BOTTOM:
            self.add_page()

        ar, ag, ab = color_rgb

        bar_y = self.get_y()
        self.set_fill_color(ar, ag, ab)
        self.rect(187 if self.rtl else 20, bar_y, 3, total_h, "F")

        self.set_fill_color(*BRAND_MID)
        self.set_draw_color(ar, ag, ab)
        self.set_line_width(0.2)
        self.rect(20 if self.rtl else 23, bar_y, 167, total_h, "DF")

        y_start = bar_y + 4
        self.set_font("Helvetica", "B", 8)
        badge_color = ACCENT_GOLD if rank == 1 else (ar, ag, ab)
        self.set_text_color(*badge_color)
        if self.rtl:
            self.set_xy(173, y_start)
            self.cell(12, 5, f"#{rank}", align="R")
            self.set_xy(22, y_start)
        else:
            self.set_xy(25, y_start)
            self.cell(12, 5, f"#{rank}", ln=False)

        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*BRAND_TEXT)
        self.multi_cell(151 if self.rtl else 152, 6, self.t(title))

        self.set_x(22 if self.rtl else 25)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(180, 190, 205)
        self.multi_cell(162, 5.5, self.t(body))

        # Always advance cursor to BELOW the drawn rectangle, not wherever text ended.
        # This prevents charts from rendering inside (overlapping) the insight box.
        self.set_y(bar_y + total_h + 3)

    # ── Chart embed ───────────────────────────────────────────────────────
    def embed_chart(self, img_b64: str, title: str, desc: str, color_rgb: tuple = BRAND_BLUE):
        try:
            img_bytes = base64.b64decode(img_b64)
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp.write(img_bytes)
                tmp_path = tmp.name

            try:
                from PIL import Image as _PIL
                with _PIL.open(tmp_path) as pil_img:
                    px_w, px_h = pil_img.size
                img_rendered_h = 150.0 * (px_h / px_w) if px_w > 0 else 85.0
            except Exception:
                img_rendered_h = 85.0

            needed_h = 6 + img_rendered_h + 12
            if self.get_y() + needed_h > PAGE_BOTTOM:
                self.add_page()

            ar, ag, ab = color_rgb
            self.set_font("Helvetica", "B", 9)
            self.set_text_color(ar, ag, ab)
            self.cell(0, 6, self.t(f">> {title}"), ln=True)
            self.ln(1)
            self.image(tmp_path, x=25, w=150)
            self.ln(2)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(*BRAND_MUTED)
            self.set_x(25)
            self.multi_cell(160, 4.5, self.t(desc))
            self.ln(6)
            os.unlink(tmp_path)
        except Exception as e:
            print(f"[PDF] Failed to embed chart '{title}': {e}")



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
) -> str:
    texts = [report.reportTitle, report.introduction, report.executiveSummary, report.confidenceNote,
             report.conclusion, report.dataQualitySection, getattr(report, "assumptions", ""), file_name]
    for ins in report.insights or []:
        texts += [ins.get("title"), ins.get("body")]
    for qa in getattr(report, "questionAnswers", None) or []:
        texts += [qa.get("question"), qa.get("answer")]
    for ch in charts or []:
        texts += [ch.get("label"), ch.get("desc")]
    texts += list(dropped_columns or []) + list(stats_summary.get("detectedIssues") or [])
    texts += list((domain.key_issues if domain else None) or [])
    pdf = DigReport(language, unicode_text=needs_unicode(*texts), shaping=has_rtl(*texts))
    L = pdf.labels
    pdf.add_page()

    # ── 1. Cover page ────────────────────────────────────────────────────
    pdf.set_y(55)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(*BRAND_BLUE)
    pdf.cell(0, 14, pdf.t(L["report"].upper()), align="C", ln=True)

    pdf.ln(3)
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(*BRAND_MUTED)
    pdf.set_x(20)
    pdf.multi_cell(0, 8, pdf.t(report.reportTitle), align="C")

    pdf.ln(6)
    pdf.set_font("Helvetica", "", 10)
    rows = stats_summary.get("rowCount", "?")
    cols = stats_summary.get("columnCount", "?")
    domain_label = domain.domain.upper() if domain else "GENERAL"
    cleaned_label = L["cleaned"] if was_cleaned else L["original"]
    pdf.cell(0, 6, pdf.t(f"{rows} {L['records']}  |  {cols} {L['attributes']}  |  {domain_label}  |  {cleaned_label}"),
             align="C", ln=True)

    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(0, 5, pdf.t(file_name), align="C", ln=True)

    pdf.ln(3)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(55, 70, 90)
    writer = getattr(report, "writerModel", "")
    credit = (f"Written by {writer}  |  checked by {CONFIDENCE_CREDIT}" if writer
              else "Statistics-only report - no AI writer was available")
    pdf.cell(0, 5, pdf.t(f"Generated by DIG AI Engine  |  {credit}"), align="C", ln=True)

    # ── Intro section on cover page ───────────────────────────────────────
    if report.introduction:
        pdf.ln(10)
        pdf.set_x(30)
        pdf.set_font("Helvetica", "I", 10)
        pdf.set_text_color(*BRAND_MUTED)
        pdf.multi_cell(150, 6, pdf.t(report.introduction))

    # ── 2. Executive Summary ─────────────────────────────────────────────
    pdf.add_page()
    pdf.section_title(L["executive_summary"])
    pdf.body_text(report.executiveSummary)

    if report.confidenceNote:
        pdf.ln(2)
        note_h = 8 + max(1, len(report.confidenceNote) // 80) * 5
        if pdf.get_y() + note_h > PAGE_BOTTOM:
            pdf.add_page()
        pdf.set_fill_color(*BRAND_MID)
        pdf.set_draw_color(*ACCENT_GOLD)
        pdf.set_line_width(0.4)
        pdf.rect(20, pdf.get_y(), 170, note_h, "DF")
        pdf.set_xy(24, pdf.get_y() + 3)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*ACCENT_GOLD)
        pdf.cell(0, 5, pdf.t(L["analyst_assessment"]), ln=True)
        pdf.set_x(24)
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(200, 200, 200)
        pdf.multi_cell(162, 5, pdf.t(report.confidenceNote))
        pdf.ln(6)

    # ── 3. Key Insights + Charts ─────────────────────────────────────────
    pdf.section_title(L["key_insights"])

    charts_by_insight: Dict[int, List] = {}
    for ch in charts:
        idx = ch.get("insight_index", 0)
        charts_by_insight.setdefault(idx, []).append(ch)

    for ins in report.insights:
        rank    = ins.get("rank", 0)
        title   = ins.get("title", "")
        body    = ins.get("body", "")
        ins_idx = ins.get("insight_index", rank)
        color_rgb = INSIGHT_COLORS[(rank - 1) % len(INSIGHT_COLORS)]

        pdf.insight_block(rank, title, body, color_rgb)

        for ch in charts_by_insight.get(ins_idx, []):
            img = ch.get("image_base64")
            if img:
                chart_hex   = ch.get("color", "")
                chart_color = color_rgb
                if chart_hex and chart_hex.startswith("#") and len(chart_hex) == 7:
                    try:
                        chart_color = (
                            int(chart_hex[1:3], 16),
                            int(chart_hex[3:5], 16),
                            int(chart_hex[5:7], 16),
                        )
                    except ValueError:
                        pass
                pdf.embed_chart(img, ch.get("label", ""), ch.get("desc", ""), chart_color)

    # Unmatched charts
    unmatched = charts_by_insight.get(0, [])
    if unmatched:
        pdf.section_title(L["more_charts"])
        for i, ch in enumerate(unmatched):
            img = ch.get("image_base64")
            if img:
                pdf.embed_chart(img, ch.get("label", ""), ch.get("desc", ""),
                                INSIGHT_COLORS[i % len(INSIGHT_COLORS)])

    # ── 3b. Answers to the user's own questions ──────────────────────────
    answers = getattr(report, "questionAnswers", None) or []
    if answers:
        if pdf.get_y() + 40 > PAGE_BOTTOM:
            pdf.add_page()
        pdf.section_title(L["your_questions"])
        for qa in answers:
            if pdf.get_y() + 25 > PAGE_BOTTOM:
                pdf.add_page()
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(*BRAND_TEXT)
            pdf.multi_cell(0, 6, pdf.t(qa.get("question", "")))
            pdf.ln(1)
            pdf.body_text(qa.get("answer", ""))
            if not qa.get("answerable", True):
                pdf.muted_text(L["not_answerable"])
            pdf.ln(2)

    # ── 4. Conclusion ────────────────────────────────────────────────────
    if report.conclusion:
        if pdf.get_y() + 40 > PAGE_BOTTOM:
            pdf.add_page()
        pdf.section_title(L["conclusion"])
        pdf.body_text(report.conclusion)

    # ── 5. Data Quality & Methodology  (always last page) ────────────────
    pdf.add_page()
    pdf.section_title(L["methodology"])

    # ── What the user asked us to take as given ─────────────────────────
    assumptions = getattr(report, "assumptions", "") or ""
    if assumptions:
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*ACCENT_GOLD)
        pdf.cell(0, 6, pdf.t(L["assumptions"]), ln=True)
        pdf.body_text(assumptions)
        pdf.ln(1)

    # ── The writer model's analytical assessment (2-3 paragraphs) ───────
    if report.dataQualitySection:
        pdf.body_text(report.dataQualitySection)
        pdf.ln(2)

    # ── Critical issues Groq identified ──────────────────────────────────
    key_issues = (domain.key_issues if domain else []) or []
    detected_issues = stats_summary.get("detectedIssues", [])
    all_issues = key_issues + [i for i in detected_issues if i not in key_issues]

    if all_issues:
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*BRAND_TEXT)
        pdf.cell(0, 6, pdf.t(f"{L['issues_found']}:"), ln=True)
        pdf.ln(1)
        for issue in all_issues:
            pdf.bullet(issue, color=BRAND_MUTED)
        pdf.ln(3)

    # ── Cleaning section ─────────────────────────────────────────────────
    if was_cleaned:
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*BRAND_TEXT)
        pdf.cell(0, 6, pdf.t(f"{L['preparation']}:"), ln=True)
        pdf.ln(1)

        # What was cleaned and why — per-method explanations
        METHOD_EXPLANATIONS = {
            "remove_empty_rows":  "Fully empty rows were removed — rows with no values carry no information and inflate the record count without contributing to analysis.",
            "remove_duplicates":  "Exact duplicate records were removed to prevent double-counting in aggregations and statistical measures.",
            "remove_infinity":    "Infinite values were replaced with NaN and subsequently imputed — infinite values break statistical computations and indicate data entry errors.",
        }
        METHOD_TEMPLATES = {
            "impute_median":  lambda col: f"Missing values in {col} were imputed using the column median — median imputation is preferred for skewed or outlier-prone distributions as it is robust to extreme values.",
            "impute_mode":    lambda col: f"Missing categorical values in {col} were filled using the most frequent observed value (mode imputation) — this preserves the dominant pattern without introducing artificial variation.",
            "impute_zero":    lambda col: f"Missing values in {col} were filled with zero — appropriate where absence of a value implies a zero quantity in this domain context.",
            "cap_outliers":   lambda col: f"Extreme outliers in {col} were capped at 1.5x the interquartile range (Winsorisation) — this limits the distorting effect of extreme observations while preserving the full record.",
            "drop_column":    lambda col: f"Attribute '{col}' was excluded from analysis — classified as carrying insufficient analytical signal for the identified domain.",
        }

        if domain and domain.cleaning_methods:
            for m in domain.cleaning_methods:
                if m in METHOD_EXPLANATIONS:
                    pdf.bullet(METHOD_EXPLANATIONS[m])
                elif ":" in m:
                    mname, col = m.split(":", 1)
                    template = METHOD_TEMPLATES.get(mname)
                    if template:
                        pdf.bullet(template(col))

        # Columns dropped
        if dropped_columns:
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(*BRAND_TEXT)
            pdf.cell(0, 5, pdf.t(f"{L['excluded']}:"), ln=True)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*BRAND_MUTED)
            cols_str = ", ".join(dropped_columns)
            if L != labels_for("en"):
                pdf.multi_cell(0, 5, pdf.t(cols_str))
            else:
                pdf.multi_cell(0, 5, pdf.t(
                    f"{cols_str} — these attributes were identified as non-contributory "
                    f"to analytical objectives in the {domain.domain if domain else 'identified'} domain."
                ))
    else:
        # Not cleaned — explain what was detected and implications
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*BRAND_TEXT)
        pdf.cell(0, 6, pdf.t(f"{L['prep_status']}:"), ln=True)
        pdf.ln(1)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(180, 190, 205)
        pdf.multi_cell(0, 5, pdf.t(L["not_cleaned_note"]))
        if all_issues:
            pdf.ln(2)
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_text_color(*BRAND_MUTED)
            pdf.multi_cell(0, 5, pdf.t(L["cleaning_tip"]))

    # ── Analysis confidence ───────────────────────────────────────────────
    pdf.ln(5)
    if pdf.get_y() + 22 > PAGE_BOTTOM:
        pdf.add_page()

    # Subtle horizontal rule
    pdf.set_draw_color(*BRAND_MID)
    pdf.set_line_width(0.3)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(4)

    # Determine color based on score
    conf_rgb = GREEN_RGB if judge_confidence_score >= 8 else ORANGE_RGB if judge_confidence_score >= 5 else RED_RGB
    conf_bar_label = confidence_word(judge_confidence_score, L)

    cr, cg, cb = conf_rgb

    # Score line — subtle, not a big badge. Cells are sized to their text,
    # which runs longer in other languages, and the row reads from the right
    # in a right-to-left report.
    pdf.set_font("Helvetica", "B", 9)
    label_text = pdf.t(f"{L['confidence']}:")
    score_text = pdf.t(f"{judge_confidence_score}/10  ({conf_bar_label})")
    label_w = max(55.0, pdf.get_string_width(label_text) + 4)
    score_w = pdf.get_string_width(score_text) + 4
    row_y = pdf.get_y()
    if pdf.rtl:
        label_x, score_x = 190 - label_w, 190 - label_w - score_w
        bar_start_x = score_x - 4 - 60
    else:
        label_x, score_x = 20, 20 + label_w
        bar_start_x = score_x + score_w + 4
    pdf.set_xy(label_x, row_y)
    pdf.set_text_color(*BRAND_MUTED)
    pdf.cell(label_w, 5, label_text, align="R" if pdf.rtl else "L")
    pdf.set_xy(score_x, row_y)
    pdf.set_text_color(cr, cg, cb)
    pdf.cell(score_w, 5, score_text, align="R" if pdf.rtl else "L")

    # Inline mini bar, filled from the end the row starts at
    bar_y = row_y + 1
    for i in range(10):
        bx = bar_start_x + (9 - i if pdf.rtl else i) * 6
        pdf.set_fill_color(cr, cg, cb) if i < judge_confidence_score else pdf.set_fill_color(40, 55, 75)
        pdf.rect(bx, bar_y, 5, 3, "F")
    pdf.set_xy(20, row_y)
    pdf.ln(7)

    # Analytical note for low-confidence results
    if judge_confidence_score <= 4:
        if pdf.get_y() + 18 > PAGE_BOTTOM:
            pdf.add_page()
        pdf.ln(2)
        pdf.set_fill_color(35, 45, 65)
        pdf.set_draw_color(*BRAND_MUTED)
        pdf.set_line_width(0.3)
        low_note = L["low_confidence_note"].format(score=judge_confidence_score)
        warn_h = 10 + pdf._estimate_text_height(low_note, 160, line_h=4.5, char_w=1.5)
        pdf.rect(20, pdf.get_y(), 170, warn_h, "DF")
        pdf.set_xy(25, pdf.get_y() + 3)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*BRAND_MUTED)
        pdf.cell(0, 5, pdf.t(L["analytical_note"]), ln=True)
        pdf.set_x(25)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(180, 190, 205)
        pdf.multi_cell(160, 4.5, pdf.t(low_note))
        pdf.ln(6)

    # Judge and writer attribution
    g_score = getattr(report, "geminiConfidenceScore", None)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(*BRAND_MUTED)
    writer = getattr(report, "writerModel", "")
    note = (f"Confidence assessed by {CONFIDENCE_CREDIT} from sample size, completeness "
            f"and the strength of the statistical evidence (final: {judge_confidence_score}/10). "
            f"It rates the data, not the writing.")
    if g_score and writer:
        note += f" Initial self-assessment by {writer}: {g_score}/10."
    pdf.multi_cell(0, 4, pdf.t(note))

    # ── Output ────────────────────────────────────────────────────────────
    pdf_bytes = pdf.output(dest="S")
    if isinstance(pdf_bytes, str):
        pdf_bytes = pdf_bytes.encode("latin-1")
    return base64.b64encode(pdf_bytes).decode("utf-8")
