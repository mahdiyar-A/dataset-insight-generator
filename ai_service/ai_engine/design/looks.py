"""
How a report looks: five themes, five font pairs and two page sizes.

Every report used to come out the same: a dark navy PDF in Helvetica, Word in
Calibri, one PowerPoint template, whatever the data and whoever would read it.
A café's sales and a lab's measurements were dressed identically.

A Look is a theme (colours and decoration), a font pair (headings and text)
and a page size. The free plan always gets DIG's own look, Signature, so a
free report still looks designed and carries the brand. Pro chooses any of
the five, or "auto", which takes the theme that fits the data (see
ai_engine/reading.py, where the data is read for who the report is for).

The PDF embeds its fonts, so it looks the same everywhere. Word and
PowerPoint name fonts the reader's computer already has, because a font the
computer lacks is silently swapped for another.

Font files: Bricolage Grotesque and Work Sans (SIL Open Font License, see the
OFL files beside them) were converted from the website's own copies into
static weights. STIX and DejaVu come with matplotlib.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Tuple

RGB = Tuple[int, int, int]

FONT_DIR = os.path.join(os.path.dirname(__file__), "fonts")


def _rgb(hex_colour: str) -> RGB:
    h = hex_colour.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


@dataclass(frozen=True)
class Theme:
    id: str
    name: str
    paper: str          # page background
    ink: str            # main text
    muted: str          # secondary text
    rule: str           # lines and borders
    accent: str         # the theme's main colour: cover band, numbers, headings
    on_accent: str      # text set on the accent
    mark: str           # a second colour for highlights and chips
    on_mark: str        # text set on the mark
    panel: str          # cards and boxes
    charts: Tuple[str, ...]
    font: str           # the font pair it comes with
    heavy_rules: bool = False    # 2px ink rules and offset shadows, the DIG way
    dark: bool = False           # light text on a dark page: best read on screen

    def rgb(self, name: str) -> RGB:
        return _rgb(getattr(self, name))


THEMES: Dict[str, Theme] = {
    # DIG's own look, the site's "Atlas": paper, ink, cobalt and lime, heavy
    # rules, hard offset shadows and oversized figures.
    "signature": Theme(
        id="signature", name="DIG Signature",
        paper="#F2EFE9", ink="#12121A", muted="#55525F", rule="#12121A",
        accent="#2536E0", on_accent="#FFFFFF", mark="#D6F24A", on_mark="#12121A",
        panel="#FFFFFF",
        charts=("#2536E0", "#12121A", "#8FA31F", "#E4572E", "#7B5EA7"),
        font="signature", heavy_rules=True),
    # White space, a single teal, thin grey lines. For data teams and anything
    # that will be printed in quantity.
    "clean": Theme(
        id="clean", name="Clean",
        paper="#FFFFFF", ink="#1E293B", muted="#64748B", rule="#D9E1EA",
        accent="#0F766E", on_accent="#FFFFFF", mark="#CCFBF1", on_mark="#134E4A",
        panel="#F6F8FA",
        charts=("#0F766E", "#2563EB", "#F59E0B", "#E11D48", "#64748B"),
        font="modern"),
    # Cream paper, espresso ink, terracotta and sage. Cafés, shops,
    # restaurants, and anything personal.
    "warm": Theme(
        id="warm", name="Warm",
        paper="#FBF6EE", ink="#2B1D14", muted="#7A6656", rule="#E3D3BF",
        accent="#B5532E", on_accent="#FFFFFF", mark="#F3D9A4", on_mark="#2B1D14",
        panel="#FFFFFF",
        charts=("#B5532E", "#6B8F71", "#D9A441", "#5C4033", "#C97C5D"),
        font="storybook"),
    # Navy and burgundy on white, serif type. Boards, investors, research.
    "classic": Theme(
        id="classic", name="Classic",
        paper="#FFFFFF", ink="#14213D", muted="#5C677D", rule="#14213D",
        accent="#7A1F2B", on_accent="#FFFFFF", mark="#EFE6D2", on_mark="#14213D",
        panel="#F8F6F1",
        charts=("#14213D", "#7A1F2B", "#B08D57", "#5C677D", "#3E7CB1"),
        font="classic"),
    # DIG's dark mode: lime on near-black. Made for screens and presenting.
    "midnight": Theme(
        id="midnight", name="Midnight",
        paper="#111318", ink="#F4F1EA", muted="#A3A7B3", rule="#3A3F4B",
        accent="#D6F24A", on_accent="#12121A", mark="#2536E0", on_mark="#FFFFFF",
        panel="#1B1E26",
        charts=("#D6F24A", "#8C9BFF", "#FF8A5B", "#4FD1C5", "#E8E6E1"),
        font="signature", heavy_rules=True, dark=True),
}


@dataclass(frozen=True)
class FontFace:
    family: str                       # the name the PDF registers
    files: Dict[str, str]             # style ("", "B", "I", "BI") -> file
    chart_family: str                 # matplotlib's name for it


@dataclass(frozen=True)
class FontPair:
    id: str
    name: str
    heading: FontFace
    body: FontFace
    office_heading: str               # Word and PowerPoint: fonts readers already have
    office_body: str
    heading_bold: bool = True         # whether headings use the bold face


def _matplotlib_ttf(name: str) -> str:
    try:
        import matplotlib
        return os.path.join(matplotlib.get_data_path(), "fonts", "ttf", name)
    except Exception:
        return name


def _own(name: str) -> str:
    return os.path.join(FONT_DIR, name)


_BRICOLAGE = FontFace("Bricolage", {"": _own("BricolageGrotesque-Bold.ttf"),
                                    "B": _own("BricolageGrotesque-ExtraBold.ttf")},
                      "Bricolage Grotesque")
_WORK = FontFace("WorkSans", {"": _own("WorkSans-Regular.ttf"), "B": _own("WorkSans-SemiBold.ttf"),
                              "I": _own("WorkSans-Regular.ttf"), "BI": _own("WorkSans-SemiBold.ttf")},
                 "Work Sans")
_WORK_HEAD = FontFace("WorkSansHead", {"": _own("WorkSans-Medium.ttf"), "B": _own("WorkSans-Bold.ttf")},
                      "Work Sans")
_STIX = FontFace("STIX", {"": _matplotlib_ttf("STIXGeneral.ttf"), "B": _matplotlib_ttf("STIXGeneralBol.ttf"),
                          "I": _matplotlib_ttf("STIXGeneralItalic.ttf"),
                          "BI": _matplotlib_ttf("STIXGeneralBolIta.ttf")},
                 "STIXGeneral")
_MONO = FontFace("DejaVuMono", {"": _matplotlib_ttf("DejaVuSansMono.ttf"),
                                "B": _matplotlib_ttf("DejaVuSansMono-Bold.ttf")},
                 "DejaVu Sans Mono")
_DEJAVU = FontFace("DejaVuText", {"": _matplotlib_ttf("DejaVuSans.ttf"), "B": _matplotlib_ttf("DejaVuSans-Bold.ttf"),
                                  "I": _matplotlib_ttf("DejaVuSans-Oblique.ttf"),
                                  "BI": _matplotlib_ttf("DejaVuSans-BoldOblique.ttf")},
                   "DejaVu Sans")

FONTS: Dict[str, FontPair] = {
    "signature": FontPair("signature", "Signature (Bricolage + Work Sans)", _BRICOLAGE, _WORK,
                          "Arial Black", "Calibri"),
    "modern":    FontPair("modern", "Modern (Work Sans)", _WORK_HEAD, _WORK, "Calibri", "Calibri"),
    "classic":   FontPair("classic", "Classic serif (STIX)", _STIX, _STIX, "Georgia", "Georgia"),
    "storybook": FontPair("storybook", "Storybook (serif headings, sans text)", _STIX, _WORK,
                          "Georgia", "Calibri"),
    "technical": FontPair("technical", "Technical (mono headings)", _MONO, _DEJAVU, "Consolas", "Calibri"),
}

# Millimetres, portrait.
PAGE_SIZES: Dict[str, Tuple[float, float]] = {
    "a4": (210.0, 297.0),
    "letter": (215.9, 279.4),
}

FREE_THEME = "signature"


@dataclass
class Look:
    theme: str = FREE_THEME
    font: str = ""              # empty: the theme's own pair
    page_size: str = "a4"
    # "chosen" when the person picked the theme, "fits" when DIG picked it for
    # the data, "free" for the free plan's fixed look.
    picked: str = "free"

    @property
    def t(self) -> Theme:
        return THEMES.get(self.theme, THEMES[FREE_THEME])

    @property
    def f(self) -> FontPair:
        return FONTS.get(self.font, FONTS[self.t.font])

    @property
    def page(self) -> Tuple[float, float]:
        return PAGE_SIZES.get(self.page_size, PAGE_SIZES["a4"])

    def chart_style(self) -> Dict[str, object]:
        """What the chart generator needs to draw in this look."""
        t, f = self.t, self.f
        # A theme with heavy rules frames each chart in a card, so the chart
        # is drawn on the card's colour; the others sit on the page itself.
        ground = t.panel if t.heavy_rules else t.paper
        return {"paper": ground, "ink": t.ink, "muted": t.muted, "colors": list(t.charts), "dark": t.dark,
                "body_files": [p for p in (f.body.files.get(""), f.body.files.get("B")) if p],
                "heading_files": [p for p in (f.heading.files.get("B"), f.heading.files.get("")) if p]}

    def to_dict(self) -> Dict[str, str]:
        return asdict(self)


def _choice(value: Optional[str], allowed) -> str:
    v = str(value or "").strip().lower().replace("-", "").replace(" ", "")
    return v if v in allowed else ""


def settle_look(theme: Optional[str] = None, font: Optional[str] = None, page_size: Optional[str] = None,
                fits: Optional[str] = None) -> Look:
    """
    The look a report is made in.

    theme:  one of THEMES, "auto" for the one that fits the data, or nothing
            for the free plan's Signature.
    font:   one of FONTS, or "auto"/nothing for the theme's own pair.
    fits:   the theme the data suggests (Reading.theme), used by "auto".
    """
    wanted = _choice(theme, set(THEMES) | {"auto"})
    if wanted == "auto":
        chosen, picked = (_choice(fits, THEMES) or FREE_THEME), "fits"
    elif wanted:
        chosen, picked = wanted, "chosen"
    else:
        chosen, picked = FREE_THEME, "free"
    pair = _choice(font, FONTS) or THEMES[chosen].font
    size = _choice(page_size, PAGE_SIZES) or "a4"
    return Look(theme=chosen, font=pair, page_size=size, picked=picked)


def look_from_dict(data) -> Look:
    """A stored look, checked: anything unknown falls back to Signature, A4."""
    if not isinstance(data, dict):
        return Look()
    theme = _choice(data.get("theme"), THEMES) or FREE_THEME
    return Look(theme=theme, font=_choice(data.get("font"), FONTS) or THEMES[theme].font,
                page_size=_choice(data.get("page_size") or data.get("pageSize"), PAGE_SIZES) or "a4",
                picked=str(data.get("picked") or "free")[:10])


def office_theme(look: Look) -> Theme:
    """
    The theme for a Word document, which gets printed and edited. A dark theme
    is turned onto white paper: its page colour becomes the ink, and its two
    colours trade places so the headings stay readable on white.
    """
    t = look.t
    if not t.dark:
        return t
    from dataclasses import replace
    return replace(t, paper="#FFFFFF", ink=t.paper, muted="#55525F", rule="#C9C6CF", accent=t.mark,
                   on_accent=t.on_mark, mark=t.accent, on_mark=t.on_accent, panel="#F4F3F0", dark=False)


def missing_font_files() -> List[str]:
    """Font files a look needs that are missing on this machine (empty when all are there)."""
    missing = []
    for pair in FONTS.values():
        for face in (pair.heading, pair.body):
            missing += [p for p in face.files.values() if not os.path.exists(p)]
    return sorted(set(missing))
