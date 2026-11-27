"""
Word (.docx) Report Builder  —  DIG AI Engine

Converts an LLMReport into a .docx file using python-docx, in the report's
look (ai_engine/design/looks.py): the theme's colours, its office fonts and
its page size. It follows the PDF, so the two read the same:

  Cover            → what the data is, the title, three key numbers,
                     the short version, and the findings' headlines
  What we found    → each finding: how firm it is, the one figure that makes
                     it, the words, then its charts
  Your questions   → answers to the questions asked in the brief, if any
  What it means    → the conclusion, set apart
  How we know      → the numbers behind each finding, notes on the data,
                     the cleaning in plain words, and the confidence

Word documents get printed and edited, so a dark theme (Midnight) is set on
white paper here, with its colours swapped to ones that print. Headings use
Word's built-in Heading styles, so the navigation pane and a table of contents
work. Labels come from report_labels in the report's language, and Persian
and Arabic reports run right to left.

Returns: bytes  (the .docx file contents, ready for base64 encoding)
"""

import base64
import io
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ai_engine.design.looks import Look, Theme, office_theme
from ai_engine.report_labels import confidence_word, is_rtl, labels_for

try:
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Inches, Mm, Pt, RGBColor
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False


_BULLET = re.compile(r"^\s*(?:[•\-\*·▪◦]|\d+[.)])\s+")
CHART_WIDTH_IN = 6.0

# WordprocessingML requires a fixed child order inside w:pPr, w:rPr, w:tblPr
# and w:tcPr, and Word reports a file as damaged when it is broken. These are
# the elements that may follow the ones added here, so each lands in place.
_AFTER_JC = ("w:textDirection", "w:textAlignment", "w:textboxTightWrap", "w:outlineLvl",
             "w:divId", "w:cnfStyle", "w:rPr", "w:sectPr", "w:pPrChange")
_AFTER_BIDI = ("w:adjustRightInd", "w:snapToGrid", "w:spacing", "w:ind", "w:contextualSpacing",
               "w:mirrorIndents", "w:suppressOverlap", "w:jc") + _AFTER_JC
_AFTER_PBDR = ("w:shd", "w:tabs", "w:suppressAutoHyphens", "w:kinsoku", "w:wordWrap",
               "w:overflowPunct", "w:topLinePunct", "w:autoSpaceDE", "w:autoSpaceDN",
               "w:bidi") + _AFTER_BIDI
_AFTER_RTL = ("w:cs", "w:em", "w:lang", "w:eastAsianLayout", "w:specVanish", "w:oMath")
_AFTER_RSHD = ("w:fitText", "w:vertAlign", "w:rtl") + _AFTER_RTL
_AFTER_RSPACING = ("w:w", "w:kern", "w:position", "w:sz", "w:szCs", "w:highlight", "w:u", "w:effect",
                   "w:bdr", "w:shd") + _AFTER_RSHD
_AFTER_BIDIVISUAL = ("w:tblStyleRowBandSize", "w:tblStyleColBandSize", "w:tblW", "w:jc", "w:tblCellSpacing",
                     "w:tblInd", "w:tblBorders", "w:shd", "w:tblLayout", "w:tblCellMar", "w:tblLook")
_AFTER_CELLSPACING = ("w:tblInd", "w:tblBorders", "w:shd", "w:tblLayout", "w:tblCellMar", "w:tblLook")
_AFTER_TCBORDERS = ("w:shd", "w:noWrap", "w:tcMar", "w:textDirection", "w:tcFitText", "w:vAlign", "w:hideMark")
_AFTER_TCSHD = _AFTER_TCBORDERS[1:]
_AFTER_TCMAR = _AFTER_TCBORDERS[3:]


def _insert(parent, tag: str, successors) -> Any:
    found = parent.find(qn(tag))
    if found is None:
        found = OxmlElement(tag)
        parent.insert_element_before(found, *successors)
    return found


def _hex(colour: str) -> str:
    return colour.lstrip("#").upper()


def _rgb(colour: str):
    return RGBColor.from_string(_hex(colour))


def _number(value: Any) -> str:
    return f"{value:,}" if isinstance(value, int) else str(value)


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


class _Writer:
    """Paragraph, run and box helpers that know the look and the direction."""

    def __init__(self, doc, look: Look, rtl: bool, labels: Dict[str, str]):
        self.doc = doc
        self.look = look
        self.th: Theme = office_theme(look)
        self.head_font = look.f.office_heading
        self.body_font = look.f.office_body
        self.rtl = rtl
        self.L = labels

    # ── Direction ─────────────────────────────────────────────────────────
    def direction(self, para, align=None) -> None:
        if align is not None:
            para.alignment = align
        if not self.rtl:
            return
        if align in (None, WD_ALIGN_PARAGRAPH.LEFT):
            para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        _insert(para._p.get_or_add_pPr(), "w:bidi", _AFTER_BIDI)
        for run in para.runs:
            _insert(run._r.get_or_add_rPr(), "w:rtl", _AFTER_RTL)

    # ── Runs ──────────────────────────────────────────────────────────────
    def run(self, para, text: str, size: float = 11, color: str = "ink", bold: bool = False,
            italic: bool = False, head: bool = False, caps: bool = False, spacing: float = 0,
            shade: str = ""):
        run = para.add_run(text)
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.name = self.head_font if head else self.body_font
        run.font.color.rgb = _rgb(getattr(self.th, color, color))
        if caps:
            run.font.all_caps = True
        r_pr = run._r.get_or_add_rPr()
        if spacing:
            el = _insert(r_pr, "w:spacing", _AFTER_RSPACING)
            el.set(qn("w:val"), str(int(spacing * 20)))
        if shade:
            el = _insert(r_pr, "w:shd", _AFTER_RSHD)
            el.set(qn("w:val"), "clear")
            el.set(qn("w:color"), "auto")
            el.set(qn("w:fill"), _hex(getattr(self.th, shade, shade)))
        return run

    # ── Paragraphs ────────────────────────────────────────────────────────
    def para(self, text: str = "", size: float = 11, color: str = "ink", bold: bool = False,
             italic: bool = False, head: bool = False, after: float = 6, before: float = 0,
             line: Optional[float] = None, container=None, style: Optional[str] = None, **run_kw):
        target = container if container is not None else self.doc
        para = target.add_paragraph(style=style) if style else target.add_paragraph()
        fmt = para.paragraph_format
        fmt.space_after = Pt(after)
        fmt.space_before = Pt(before)
        if line:
            fmt.line_spacing = line
        if text:
            self.run(para, text, size=size, color=color, bold=bold, italic=italic, head=head, **run_kw)
        self.direction(para)
        return para

    def heading(self, text: str, level: int = 1, kicker: str = ""):
        if kicker:
            self.kicker(kicker, after=2)
        para = self.doc.add_heading(level=level)
        self.run(para, text, size={1: 24, 2: 15, 3: 12}.get(level, 12), color="ink", bold=True, head=True)
        para.paragraph_format.space_before = Pt(4 if kicker else 14)
        para.paragraph_format.space_after = Pt(8)
        self.direction(para)
        if level == 1:
            self.border(para, "bottom", "rule" if not self.th.heavy_rules else "ink",
                        12 if self.th.heavy_rules else 6, space=6)
        return para

    def kicker(self, text: str, color: str = "accent", after: float = 4, container=None):
        return self.para(text, size=8.5, color=color, bold=True, caps=True, spacing=1.2, after=after,
                         container=container)

    def body(self, text: str, size: float = 11, color: str = "ink", container=None) -> None:
        """Text that may hold "• " bullet lines: real list items for those."""
        for line in (text or "").split("\n"):
            line = line.strip()
            if not line:
                continue
            if _BULLET.match(line):
                self.bullet(_BULLET.sub("", line), size=size, color=color, container=container)
            else:
                self.para(line, size=size, color=color, line=1.15, after=8, container=container)

    def bullet(self, text: str, size: float = 10, color: str = "ink", container=None):
        target = container if container is not None else self.doc
        para = target.add_paragraph(style="List Bullet")
        para.paragraph_format.space_after = Pt(3)
        self.run(para, text, size=size, color=color)
        self.direction(para)
        return para

    def border(self, para, side: str, color: str, size: int, space: int = 4) -> None:
        p_pr = para._p.get_or_add_pPr()
        borders = _insert(p_pr, "w:pBdr", _AFTER_PBDR)
        order = ["top", "left", "bottom", "right", "between", "bar"]
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(size))
        el.set(qn("w:space"), str(space))
        el.set(qn("w:color"), _hex(getattr(self.th, color, color)))
        later = [borders.find(qn(f"w:{s}")) for s in order[order.index(side) + 1:]]
        later = [x for x in later if x is not None]
        if later:
            later[0].addprevious(el)
        else:
            borders.append(el)

    def page_break(self) -> None:
        para = self.doc.add_paragraph()
        para.add_run().add_break(WD_BREAK.PAGE)

    # ── Boxes (tables) ────────────────────────────────────────────────────
    def table(self, cols: int, widths_in: List[float], gap_pt: float = 0):
        table = self.doc.add_table(rows=1, cols=cols)
        table.autofit = False
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl_pr = table._tbl.tblPr
        if self.rtl:
            _insert(tbl_pr, "w:bidiVisual", _AFTER_BIDIVISUAL)
        if gap_pt:
            spacing = _insert(tbl_pr, "w:tblCellSpacing", _AFTER_CELLSPACING)
            spacing.set(qn("w:w"), str(int(gap_pt * 10)))
            spacing.set(qn("w:type"), "dxa")
        for cell, w in zip(table.rows[0].cells, widths_in):
            cell.width = Inches(w)
        return table

    def box(self, cell, fill: str = "panel", heavy: Optional[bool] = None, pad_pt: float = 9) -> None:
        """A table cell as a card: the theme's border and fill."""
        heavy = self.th.heavy_rules if heavy is None else heavy
        tc_pr = cell._tc.get_or_add_tcPr()
        borders = _insert(tc_pr, "w:tcBorders", _AFTER_TCBORDERS)
        for side, extra in (("top", 0), ("left", 0), ("bottom", 1), ("right", 1)):
            el = OxmlElement(f"w:{side}")
            el.set(qn("w:val"), "single")
            # A heavy-rule theme fakes its offset shadow with thicker bottom
            # and right edges.
            el.set(qn("w:sz"), str((12 + 18 * extra) if heavy else 6))
            el.set(qn("w:space"), "0")
            el.set(qn("w:color"), _hex(self.th.ink if heavy else self.th.rule))
            borders.append(el)
        shd = _insert(tc_pr, "w:shd", _AFTER_TCSHD)
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), _hex(getattr(self.th, fill, fill)))
        mar = _insert(tc_pr, "w:tcMar", _AFTER_TCMAR)
        for side in ("top", "left", "bottom", "right"):
            el = OxmlElement(f"w:{side}")
            el.set(qn("w:w"), str(int(pad_pt * 20)))
            el.set(qn("w:type"), "dxa")
            mar.append(el)
        # A new cell holds one empty paragraph; it is used for the first line.

    def faint(self) -> str:
        """The ink a fifth of the way from the paper, as #RRGGBB."""
        ink, paper = self.th.rgb("ink"), self.th.rgb("paper")
        return "#" + "".join(f"{round(p + (i - p) * 0.2):02X}" for i, p in zip(ink, paper))

    def chip(self, para, text: str, kind: str) -> None:
        fills = {"strong": ("accent", "on_accent"), "clear": ("accent", "on_accent"),
                 "weak": (self.faint(), "ink"), "fact": ("mark", "on_mark"), "mark": ("mark", "on_mark")}
        fill, ink = fills.get(kind, fills["mark"])
        self.run(para, f" {text} ", size=8.5, color=ink, bold=True, shade=fill)

    # ── Charts ────────────────────────────────────────────────────────────
    def chart(self, chart: Dict[str, Any]) -> None:
        img = chart.get("image_base64")
        if not img:
            return
        try:
            data = io.BytesIO(base64.b64decode(img))
            if self.th.heavy_rules:
                cell = self.table(1, [CHART_WIDTH_IN + 0.3]).rows[0].cells[0]
                self.box(cell, fill="panel", pad_pt=5)
                para = cell.paragraphs[0]
                para.add_run().add_picture(data, width=Inches(CHART_WIDTH_IN))
            else:
                self.doc.add_picture(data, width=Inches(CHART_WIDTH_IN))
                para = self.doc.paragraphs[-1]
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        except Exception as e:  # a bad image must not lose the report
            print(f"[Word] chart skipped: {e}", flush=True)
            return
        caption = chart.get("desc") or chart.get("label") or ""
        self.para(caption, size=9, color="muted", before=4, after=12)


# ── The document ─────────────────────────────────────────────────────────────

def _style_document(doc, w: _Writer) -> None:
    th = w.th
    normal = doc.styles["Normal"]
    normal.font.name = w.body_font
    normal.font.size = Pt(11)
    normal.font.color.rgb = _rgb(th.ink)
    if w.rtl:
        # The font Word uses for Arabic script ("complex script" text).
        normal.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:cs"), "Tahoma")
    for name, size in (("Title", 30), ("Heading 1", 24), ("Heading 2", 15), ("Heading 3", 12)):
        style = doc.styles[name]
        style.font.name = w.head_font
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = _rgb(th.ink)
        # The template's Title is underlined in blue; the look draws its own lines.
        p_pr = style.element.pPr
        if p_pr is not None and p_pr.find(qn("w:pBdr")) is not None:
            p_pr.remove(p_pr.find(qn("w:pBdr")))
    bullets = doc.styles["List Bullet"]
    bullets.font.name = w.body_font
    bullets.font.color.rgb = _rgb(th.ink)
    # The template names its fonts by theme ("the heading font"), which Word
    # prefers over a font named outright; without this the look's fonts lose.
    theme_attrs = [qn(f"w:{a}") for a in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme")]
    for el in doc.styles.element.iter(qn("w:rFonts")):
        for attr in theme_attrs:
            el.attrib.pop(attr, None)


def _page(doc, w: _Writer) -> None:
    width, height = w.look.page
    for section in doc.sections:
        section.page_width = Mm(width)
        section.page_height = Mm(height)
        section.top_margin = Mm(20)
        section.bottom_margin = Mm(20)
        section.left_margin = Mm(20)
        section.right_margin = Mm(20)
    # The theme's paper as the page colour on screen. Word does not print a
    # page colour unless asked, so the printout stays on white paper.
    if _hex(w.th.paper) != "FFFFFF":
        bg = OxmlElement("w:background")
        bg.set(qn("w:color"), _hex(w.th.paper))
        doc.element.insert(0, bg)
        settings = doc.settings.element
        shape = OxmlElement("w:displayBackgroundShape")
        zoom = settings.find(qn("w:zoom"))
        if zoom is not None:
            zoom.addnext(shape)
        else:
            settings.insert(0, shape)


def _footer(doc, w: _Writer) -> None:
    for section in doc.sections:
        para = section.footer.paragraphs[0]
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        w.run(para, f"{w.L['made_with']} · datainsightgen.com   ·   {w.L['page']} ", size=8, color="muted")
        field = OxmlElement("w:fldSimple")
        field.set(qn("w:instr"), "PAGE")
        number = OxmlElement("w:r")
        r_pr = OxmlElement("w:rPr")
        color = OxmlElement("w:color")
        color.set(qn("w:val"), _hex(w.th.muted))
        size = OxmlElement("w:sz")
        size.set(qn("w:val"), "16")
        r_pr.append(color)
        r_pr.append(size)
        number.append(r_pr)
        text = OxmlElement("w:t")
        text.text = "1"
        number.append(text)
        field.append(number)
        para._p.append(field)
        if w.rtl:
            _insert(para._p.get_or_add_pPr(), "w:bidi", _AFTER_BIDI)


def _key_numbers(report, stats: Dict[str, Any], L: Dict[str, str]) -> List[Dict[str, str]]:
    picked = [k for k in getattr(report, "keyNumbers", None) or [] if k.get("value")][:3]
    if len(picked) >= 2:
        return picked
    own = [{"value": _number(stats.get("rowCount", "?")), "label": L["rows"]},
           {"value": _number(stats.get("columnCount", "?")), "label": L["columns"]},
           {"value": str(len(report.insights or [])), "label": L["findings_count"]}]
    return (picked + own)[:3]


def _cover(w: _Writer, report, file_name: str, domain: str, description: str, stats: Dict[str, Any],
           now: datetime) -> None:
    L = w.L
    # Brand line: DIG, then the date
    brand = w.para(after=14)
    brand.paragraph_format.tab_stops.add_tab_stop(Mm(w.look.page[0] - 40), WD_TAB_ALIGNMENT.RIGHT)
    w.run(brand, "DIG", size=16, color="accent", bold=True, head=True)
    w.run(brand, f"\t{now.strftime('%Y-%m-%d')}", size=9, color="muted")
    w.direction(brand)
    w.border(brand, "bottom", "ink" if w.th.heavy_rules else "rule", 12 if w.th.heavy_rules else 6, space=6)

    w.kicker(description or domain.replace("_", " ") or L["report"], after=6)
    title = report.reportTitle or L["report"]
    title_para = w.doc.add_paragraph(style="Title")
    w.run(title_para, title, size=30 if len(title) <= 48 else 24, color="ink", bold=True, head=True)
    title_para.paragraph_format.space_after = Pt(6)
    w.direction(title_para)

    meta = [file_name]
    if stats.get("rowCount") is not None:
        meta.append(f"{_number(stats['rowCount'])} {L['rows']}")
    if stats.get("columnCount") is not None:
        meta.append(f"{_number(stats['columnCount'])} {L['columns']}")
    w.para(" · ".join(meta), size=9, color="muted", after=10)
    if report.introduction:
        w.para(report.introduction, size=12, color="muted", line=1.2, after=14)

    # Three key numbers, side by side
    numbers = _key_numbers(report, stats, L)
    usable = (w.look.page[0] - 40) / 25.4
    width = (usable - 0.3) / max(1, len(numbers))
    table = w.table(len(numbers), [width] * len(numbers), gap_pt=8)
    for k, (cell, n) in enumerate(zip(table.rows[0].cells, numbers)):
        first = k == 0
        w.box(cell, fill="mark" if first else "panel")
        value = str(n.get("value", ""))
        top = cell.paragraphs[0]
        w.run(top, value, size=24 if len(value) <= 8 else 18, color="on_mark" if first else "accent",
              bold=True, head=True)
        top.paragraph_format.space_after = Pt(2)
        w.direction(top)
        w.para(str(n.get("label", "")), size=9, color="on_mark" if first else "muted", after=0, container=cell)
    w.para(after=6)

    # The short version, in a card
    if report.executiveSummary:
        cell = w.table(1, [usable]).rows[0].cells[0]
        w.box(cell, fill="panel", pad_pt=12)
        chip = cell.paragraphs[0]
        w.chip(chip, L["short_version"], "mark")
        chip.paragraph_format.space_after = Pt(6)
        w.direction(chip)
        w.body(report.executiveSummary, size=11, container=cell)
        w.para(after=6)

    # What is inside
    titles = [str(i.get("title") or "") for i in report.insights or [] if i.get("title")]
    if titles:
        w.kicker(L["what_we_found"], color="muted", after=4)
        for k, t in enumerate(titles, 1):
            para = w.para(after=3)
            w.run(para, f"{k:02d}   ", size=10.5, color="accent", bold=True, head=True)
            w.run(para, t, size=10.5, color="ink")
            w.direction(para)


def _finding(w: _Writer, number: int, insight: Dict[str, Any], charts: List[Dict[str, Any]]) -> None:
    L = w.L
    head = w.doc.add_heading(level=2)
    w.run(head, f"{number}  ", size=15, color="accent", bold=True, head=True)
    w.run(head, str(insight.get("title") or ""), size=15, color="ink", bold=True, head=True)
    head.paragraph_format.space_before = Pt(18)
    head.paragraph_format.space_after = Pt(6)
    head.paragraph_format.keep_with_next = True
    w.direction(head)

    strength = str(insight.get("strength") or "")
    if strength in _STRENGTH_KEYS:
        para = w.para(after=8)
        w.chip(para, L[_STRENGTH_KEYS[strength]], strength)
        para.paragraph_format.keep_with_next = True
        w.direction(para)

    highlight = insight.get("highlight") if isinstance(insight.get("highlight"), dict) else None
    if highlight and highlight.get("value"):
        para = w.para(after=10)
        w.run(para, str(highlight["value"]), size=20, color="accent", bold=True, head=True)
        if highlight.get("label"):
            w.run(para, f"   {highlight['label']}", size=10, color="muted")
        w.border(para, "right" if w.rtl else "left", "accent", 24, space=8)
        para.paragraph_format.keep_with_next = True
        w.direction(para)

    w.body(str(insight.get("body") or ""))
    for chart in charts:
        w.chart(chart)


def _meaning(w: _Writer, conclusion: str) -> None:
    usable = (w.look.page[0] - 40) / 25.4
    cell = w.table(1, [usable]).rows[0].cells[0]
    w.box(cell, fill="mark", pad_pt=14)
    head = cell.paragraphs[0]
    w.run(head, w.L["what_it_means"], size=17, color="on_mark", bold=True, head=True)
    head.paragraph_format.space_after = Pt(6)
    w.direction(head)
    w.body(conclusion, size=11.5, color="on_mark", container=cell)
    w.para(after=4)


def _how_we_know(w: _Writer, report, was_cleaned: bool, cleaning: List[str], dropped: List[str],
                 issues: List[str], confidence_score: Optional[int]) -> None:
    L = w.L
    w.page_break()
    w.heading(L["how_we_know"], 1, kicker=L["methodology"])
    w.para(L["how_we_know_intro"], size=10, color="muted", after=10)

    for k, ins in enumerate(report.insights or [], 1):
        lines = [str(x) for x in ins.get("basedOn") or [] if x]
        if not lines:
            continue
        para = w.para(f"{k}. {ins.get('title', '')}", size=10.5, bold=True, after=2, before=6)
        para.paragraph_format.keep_with_next = True
        strength = str(ins.get("strength") or "")
        if strength in _STRENGTH_KEYS:
            w.para(L[_STRENGTH_KEYS[strength]], size=8.5, color="accent", bold=True, after=2)
        for line in lines:
            w.bullet(line, size=9.5, color="muted")

    assumptions = getattr(report, "assumptions", "") or ""
    if report.dataQualitySection or assumptions or issues or was_cleaned:
        w.heading(L["data_notes"], 3)
    if assumptions:
        w.para(L["assumptions"], size=10, color="accent", bold=True, after=2)
        w.body(assumptions, size=10)
    if report.dataQualitySection:
        w.body(report.dataQualitySection, size=10)
    if issues:
        w.para(f"{L['issues_found']}:", size=10, bold=True, after=2)
        for issue in issues:
            w.bullet(issue, size=9.5, color="muted")
    english = L.get("rows") == "rows"
    if was_cleaned and cleaning:
        w.para(f"{L['preparation']}:", size=10, bold=True, after=2, before=4)
        for m in cleaning:
            if m in _METHOD_EXPLANATIONS:
                w.bullet(_METHOD_EXPLANATIONS[m] if english else m.replace("_", " "), size=9.5, color="muted")
            elif ":" in m:
                name, col = m.split(":", 1)
                template = _METHOD_TEMPLATES.get(name)
                if template:
                    w.bullet(template(col) if english else f"{name.replace('_', ' ')}: {col}", size=9.5,
                             color="muted")
    if dropped:
        w.para(f"{L['excluded']}: {', '.join(dropped)}", size=9.5, color="muted", before=4)

    if confidence_score:
        score = max(0, min(10, int(confidence_score)))
        para = w.para(before=12, after=4)
        w.border(para, "top", "rule", 6, space=8)
        w.run(para, f"{L['confidence']}:  ", size=10, color="muted", bold=True)
        w.run(para, f"{score}/10 ({confidence_word(score, L)})   ", size=10, color="accent", bold=True)
        w.run(para, "■" * score, size=10, color="accent")
        w.run(para, "■" * (10 - score), size=10, color=w.faint())
        w.direction(para)
        if score <= 4:
            w.para(L["low_confidence_note"].format(score=score), size=9, color="muted")
    # As in the PDF: the writing model is never named.
    if str(getattr(report, "rawResponse", "") or "").startswith("[fallback"):
        w.para(L["no_writer_note"], size=8, color="muted", before=4)


def build_word_doc(
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
    Build a .docx Word report from an LLMReport, in `look` (Signature when none).

    Args:
        report:           LLMReport dataclass
        file_name:        original uploaded filename (shown under the title)
        domain:           domain string (finance, hr, etc.)
        charts:           generate_charts output; each chart sits under its insight
        language:         report language, for labels and text direction
        confidence_score: the statistical confidence score, 1-10
        look:             theme, fonts and page size
        description:      what the data is, in a line, for the cover
        stats:            rowCount and columnCount, for the cover
        was_cleaned, cleaning, dropped_columns, issues: notes on the data

    Returns:
        bytes — the .docx file contents
    """
    if not DOCX_AVAILABLE:
        raise ImportError("python-docx is not installed. Run: pip install python-docx")

    look = look or Look()
    labels = labels_for(language)
    rtl = is_rtl(language)
    doc = Document()
    w = _Writer(doc, look, rtl, labels)
    _style_document(doc, w)
    _page(doc, w)
    _footer(doc, w)
    title = report.reportTitle or labels["report"]
    now = datetime.now(timezone.utc)

    props = doc.core_properties
    props.title = title
    props.subject = f"{domain.replace('_', ' ').title()} analysis of {file_name}"
    props.author = "DIG — Dataset Insight Generator"
    props.keywords = "DIG, data analysis, report"
    props.language = language
    props.created = now.replace(tzinfo=None)

    _cover(w, report, file_name, domain, description, dict(stats or {}), now)

    # ── What we found ─────────────────────────────────────────────────────
    w.page_break()
    w.heading(labels["what_we_found"], 1)
    charts = list(charts or [])
    by_insight: Dict[int, List[Dict[str, Any]]] = {}
    for chart in charts:
        by_insight.setdefault(int(chart.get("insight_index") or 0), []).append(chart)
    placed = set()
    for k, insight in enumerate(report.insights or [], 1):
        index = int(insight.get("insight_index") or insight.get("rank") or k)
        mine = [c for c in by_insight.get(index, []) if id(c) not in placed]
        placed.update(id(c) for c in mine)
        _finding(w, k, insight, mine)

    leftover = [c for c in charts if id(c) not in placed]
    if leftover:
        w.heading(labels["more_charts"], 2)
        for chart in leftover:
            w.chart(chart)

    # ── Answers to the user's own questions ───────────────────────────────
    answers = getattr(report, "questionAnswers", None) or []
    if answers:
        w.heading(labels["your_questions"], 1)
        for qa in answers:
            w.heading(qa.get("question", ""), 3)
            w.body(qa.get("answer", ""))
            if not qa.get("answerable", True):
                w.para(labels["not_answerable"], italic=True, size=9, color="muted")

    # ── What it means ─────────────────────────────────────────────────────
    if report.conclusion:
        w.para(after=6)
        _meaning(w, report.conclusion)

    # ── How we know ───────────────────────────────────────────────────────
    _how_we_know(w, report, was_cleaned, list(cleaning or []), list(dropped_columns or []),
                 list(issues or []), confidence_score)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
