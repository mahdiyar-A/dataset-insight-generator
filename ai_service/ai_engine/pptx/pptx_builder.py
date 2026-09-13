"""
PowerPoint (.pptx) Report Builder  —  DIG AI Engine

Converts an LLMReport into a clean presentation using python-pptx.
Called by the pipeline when outputFormat.pptx = true in the user's customization.

Slide layout:
  Slide 1  — Title slide (report title, date, domain)
  Slide 2  — Executive Summary (3-4 bullet points)
  Slides 3…N  — One slide per insight (title + body + insight number badge)
  Slide N+1   — Conclusion
  Slide N+2   — Data Quality & Methodology (summary bullets)

Returns: bytes  (the .pptx contents, ready for base64 encoding)
"""

import io
from datetime import datetime
from typing import List

try:
    from pptx import Presentation
    from pptx.util import Inches, Pt, Emu
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    PPTX_AVAILABLE = True
except ImportError:
    PPTX_AVAILABLE = False


# ── Brand palette ─────────────────────────────────────────────────────────────
C_NAVY    = RGBColor(0x1A, 0x1A, 0x2E) if PPTX_AVAILABLE else None
C_INDIGO  = RGBColor(0x4F, 0x46, 0xE5) if PPTX_AVAILABLE else None
C_WHITE   = RGBColor(0xFF, 0xFF, 0xFF) if PPTX_AVAILABLE else None
C_LIGHT   = RGBColor(0xF1, 0xF5, 0xF9) if PPTX_AVAILABLE else None   # slate-100
C_MUTED   = RGBColor(0x64, 0x74, 0x8B) if PPTX_AVAILABLE else None   # slate-500
C_BODY    = RGBColor(0x1F, 0x2D, 0x3D) if PPTX_AVAILABLE else None

# Slide dimensions — widescreen 16:9.
# Guarded like every other constant above: python-pptx is an optional
# dependency, and these two lines were the only ones calling into it
# unconditionally. Without the package the module raised NameError at import,
# which propagated through pipeline.py to main.py — so a missing optional
# export library took down the entire AI service rather than just disabling
# PowerPoint output. build_pptx() already raises a clear ImportError when
# actually called without the package.
SLIDE_W = Inches(13.33) if PPTX_AVAILABLE else None
SLIDE_H = Inches(7.5) if PPTX_AVAILABLE else None


def _new_prs() -> "Presentation":
    prs = Presentation()
    prs.slide_width  = SLIDE_W
    prs.slide_height = SLIDE_H
    return prs


def _blank_slide(prs: "Presentation"):
    """Add a completely blank slide (no placeholder boxes)."""
    blank_layout = prs.slide_layouts[6]   # index 6 = blank
    return prs.slides.add_slide(blank_layout)


def _add_rect(slide, left, top, width, height, fill_rgb):
    """Add a filled rectangle shape (used for backgrounds and accent bars)."""
    from pptx.util import Emu
    shape = slide.shapes.add_shape(
        1,  # MSO_SHAPE_TYPE.RECTANGLE
        left, top, width, height
    )
    shape.line.fill.background()   # no border
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_rgb
    return shape


def _add_text_box(slide, left, top, width, height,
                  text: str, font_size: int,
                  bold: bool = False, italic: bool = False,
                  color=None, align=None,
                  word_wrap: bool = True) -> None:
    """Add a text box with consistent styling."""
    # align defaults to None rather than PP_ALIGN.LEFT: a default argument is
    # evaluated at import time, so naming the optional dependency here crashed
    # the module — and with it the whole service — whenever python-pptx was
    # absent. Resolved at call time instead, by which point the package is
    # guaranteed present (build_pptx refuses to run without it).
    if align is None:
        align = PP_ALIGN.LEFT
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = word_wrap
    para = tf.paragraphs[0]
    para.alignment = align
    run = para.add_run()
    run.text = text
    run.font.size  = Pt(font_size)
    run.font.bold  = bold
    run.font.italic = italic
    if color:
        run.font.color.rgb = color


def _wrap_text(text: str, max_chars: int = 320) -> str:
    """Truncate body text to a reasonable slide length."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit(" ", 1)[0] + "…"


# ─────────────────────────────────────────────────────────────────────────────
# Individual slide builders
# ─────────────────────────────────────────────────────────────────────────────

def _build_title_slide(prs, title: str, domain: str, file_name: str):
    slide = _blank_slide(prs)

    # Navy background
    _add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, C_NAVY)

    # Indigo accent bar on the left
    _add_rect(slide, 0, 0, Inches(0.12), SLIDE_H, C_INDIGO)

    # DIG wordmark
    _add_text_box(
        slide,
        left=Inches(0.5), top=Inches(0.4),
        width=Inches(4), height=Inches(0.5),
        text="DIG — Dataset Insight Generator",
        font_size=11, color=C_INDIGO, italic=True,
    )

    # Report title
    _add_text_box(
        slide,
        left=Inches(0.5), top=Inches(1.6),
        width=Inches(12), height=Inches(1.8),
        text=title or "Dataset Insight Report",
        font_size=34, bold=True, color=C_WHITE,
    )

    # Domain + date
    _add_text_box(
        slide,
        left=Inches(0.5), top=Inches(3.6),
        width=Inches(8), height=Inches(0.5),
        text=f"{domain.title()} Analysis  ·  {datetime.utcnow().strftime('%B %d, %Y')}",
        font_size=13, color=C_MUTED, italic=True,
    )

    # Source file
    _add_text_box(
        slide,
        left=Inches(0.5), top=Inches(4.2),
        width=Inches(8), height=Inches(0.4),
        text=f"Source: {file_name}",
        font_size=11, color=C_MUTED,
    )


def _build_summary_slide(prs, executive_summary: str):
    slide = _blank_slide(prs)

    # Light background
    _add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, C_LIGHT)

    # Indigo header bar
    _add_rect(slide, 0, 0, SLIDE_W, Inches(1.1), C_INDIGO)

    _add_text_box(
        slide,
        left=Inches(0.5), top=Inches(0.2),
        width=Inches(12), height=Inches(0.7),
        text="Executive Summary",
        font_size=24, bold=True, color=C_WHITE,
    )

    _add_text_box(
        slide,
        left=Inches(0.6), top=Inches(1.4),
        width=Inches(11.8), height=Inches(5.5),
        text=_wrap_text(executive_summary, 480),
        font_size=16, color=C_BODY,
    )


def _build_insight_slide(prs, rank: int, title: str, body: str, total: int):
    slide = _blank_slide(prs)

    # White background
    _add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, C_WHITE)

    # Navy sidebar
    _add_rect(slide, 0, 0, Inches(0.9), SLIDE_H, C_NAVY)

    # Rank number in sidebar
    _add_text_box(
        slide,
        left=Inches(0), top=Inches(3.1),
        width=Inches(0.9), height=Inches(0.6),
        text=str(rank),
        font_size=28, bold=True, color=C_INDIGO,
        align=PP_ALIGN.CENTER,
    )

    # "of N" label
    _add_text_box(
        slide,
        left=Inches(0), top=Inches(3.7),
        width=Inches(0.9), height=Inches(0.4),
        text=f"of {total}",
        font_size=10, color=C_MUTED,
        align=PP_ALIGN.CENTER,
    )

    # Insight title
    _add_text_box(
        slide,
        left=Inches(1.1), top=Inches(0.6),
        width=Inches(11.5), height=Inches(1.2),
        text=title,
        font_size=22, bold=True, color=C_NAVY,
    )

    # Indigo underline accent
    _add_rect(slide, Inches(1.1), Inches(1.85), Inches(1.5), Inches(0.04), C_INDIGO)

    # Insight body
    _add_text_box(
        slide,
        left=Inches(1.1), top=Inches(2.05),
        width=Inches(11.5), height=Inches(5),
        text=_wrap_text(body, 420),
        font_size=15, color=C_BODY,
    )


def _build_conclusion_slide(prs, conclusion: str):
    slide = _blank_slide(prs)
    _add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, C_NAVY)
    _add_rect(slide, 0, 0, Inches(0.12), SLIDE_H, C_INDIGO)

    _add_text_box(
        slide,
        left=Inches(0.5), top=Inches(0.5),
        width=Inches(4), height=Inches(0.5),
        text="Conclusion",
        font_size=14, color=C_INDIGO, italic=True,
    )

    _add_text_box(
        slide,
        left=Inches(0.5), top=Inches(1.3),
        width=Inches(12), height=Inches(5.5),
        text=_wrap_text(conclusion, 480),
        font_size=16, color=C_WHITE,
    )


def _build_methodology_slide(prs, data_quality_section: str):
    slide = _blank_slide(prs)
    _add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, C_LIGHT)
    _add_rect(slide, 0, 0, SLIDE_W, Inches(1.1), C_MUTED)

    _add_text_box(
        slide,
        left=Inches(0.5), top=Inches(0.2),
        width=Inches(12), height=Inches(0.7),
        text="Data Quality & Methodology",
        font_size=22, bold=True, color=C_WHITE,
    )

    _add_text_box(
        slide,
        left=Inches(0.6), top=Inches(1.4),
        width=Inches(11.8), height=Inches(5.5),
        text=_wrap_text(data_quality_section, 480),
        font_size=14, color=C_BODY,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def build_pptx(report, file_name: str = "dataset.csv", domain: str = "general") -> bytes:
    """
    Build a .pptx presentation from an LLMReport object.

    Args:
        report:    LLMReport dataclass
        file_name: original uploaded filename (shown on title slide)
        domain:    domain string

    Returns:
        bytes — the .pptx file contents
    """
    if not PPTX_AVAILABLE:
        raise ImportError(
            "python-pptx is not installed. Run: pip install python-pptx"
        )

    prs = _new_prs()

    # Title slide
    _build_title_slide(prs, report.reportTitle, domain, file_name)

    # Executive summary
    if report.executiveSummary:
        _build_summary_slide(prs, report.executiveSummary)

    # Insight slides
    insights = report.insights or []
    for insight in insights:
        rank  = insight.get("rank", "—")
        title = insight.get("title", f"Insight {rank}")
        body  = insight.get("body", "")
        _build_insight_slide(prs, rank, title, body, len(insights))

    # Conclusion
    if report.conclusion:
        _build_conclusion_slide(prs, report.conclusion)

    # Methodology
    if report.dataQualitySection:
        _build_methodology_slide(prs, report.dataQualitySection)

    # Serialize
    buf = io.BytesIO()
    prs.save(buf)
    buf.seek(0)
    return buf.read()
