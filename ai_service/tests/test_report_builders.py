"""
The PDF, Word and PowerPoint reports: they open, they are in the report's
language and direction, and long text continues rather than overflowing.
"""

import base64
import io
import re
import zipfile

import pytest
from docx import Document
from lxml import etree
from pptx import Presentation

from ai_engine.design.looks import THEMES, office_theme, settle_look
from ai_engine.models.models import DomainResult, LLMReport
from ai_engine.pdf.pdf_builder import build_pdf, needs_unicode
from tests.pdf_text import pdf_text, streams
from ai_engine.pptx.pptx_builder import FULL_WIDTH_CHARS, _weight, build_pptx, chunk_text
from ai_engine.report_labels import LABELS, labels_for, left_out_line
from ai_engine.word.word_builder import build_word_doc

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# Single white pixel: enough for the builders to place a picture.
PNG = base64.b64encode(bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c63f8ffffff7f0009fb03fd2a86e38a0000000049454e44ae426082")).decode()


def report(lang="en", long_body=False):
    fa = lang == "fa"
    body = ("• شمال ۴۲٪ درآمد را می‌آورد\n• جنوب بیشترین ریزش را دارد" if fa
            else "• North brings 42% of revenue\n• South churns most")
    if long_body:
        body = "\n".join(f"Paragraph {i}: " + "revenue grew steadily across every region and month. " * 6
                         for i in range(12))
    return LLMReport(
        reportTitle="بررسی فروش" if fa else "Regional sales review",
        introduction="ششصد سفارش" if fa else "Six hundred orders.",
        executiveSummary="خلاصه" if fa else "North leads revenue.",
        insights=[{"rank": 1, "title": "شمال پیشتاز است" if fa else "North leads", "body": body,
                   "insight_index": 1},
                  {"rank": 2, "title": "جنوب" if fa else "South", "body": "متن" if fa else "Text.",
                   "insight_index": 2}],
        chartInstructions=[], dataQualitySection="فایل کامل است." if fa else "The file is complete.",
        geminiConfidenceScore=7, confidenceNote="", conclusion="نتیجه" if fa else "Focus on the South.",
        rawResponse="", writerModel="Test model",
        questionAnswers=[{"question": "کدام منطقه؟" if fa else "Which region churns most?",
                          "answer": "جنوب" if fa else "South.", "answerable": True},
                         {"question": "Next year?", "answer": "No forecast.", "answerable": False}],
        assumptions="سه‌ماهه‌ی چهارم ناقص است" if fa else "Q4 2024 is incomplete.")


CHARTS = [{"image_base64": PNG, "label": "Revenue by region", "desc": "Totals.", "insight_index": 1,
           "color": "#4F46E5"},
          {"image_base64": PNG, "label": "Unplaced chart", "desc": "", "insight_index": 0}]


# ── Labels ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("lang", sorted(LABELS))
def test_the_left_out_line_names_both_parts_in_every_language(lang):
    line = left_out_line({"sheet": "Company Bank", "otherSheets": ["Notes", "Lookups"]}, lang)
    assert "Company Bank" in line and "Notes, Lookups" in line


def test_the_left_out_line_shortens_a_long_list():
    line = left_out_line({"table": "orders", "otherTables": [f"t{i}" for i in range(8)]})
    assert "t4, ..." in line and "t5" not in line


def test_nothing_left_out_needs_no_line():
    assert left_out_line({"sheet": "Data"}) == ""
    assert left_out_line({}) == ""


def test_every_language_has_every_label():
    keys = set(LABELS["en"])
    for lang, labels in LABELS.items():
        assert set(labels) == keys, (lang, keys ^ set(labels))
        assert all(isinstance(v, str) and v for v in labels.values()), lang
    assert labels_for("xx") == LABELS["en"]
    assert labels_for("FR-ca")["conclusion"] == LABELS["fr"]["conclusion"]
    assert "{score}" in labels_for("fa")["low_confidence_note"]


# ── Word ──────────────────────────────────────────────────────────────────────

PPR_ORDER = ("pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr "
             "shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN "
             "bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc "
             "textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange").split()
RPR_ORDER = ("rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof "
             "snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd "
             "fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath").split()


def _schema_order_problems(docx_bytes):
    """Children of w:pPr / w:rPr out of schema order make Word call the file damaged."""
    problems = []
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        for part in (n for n in z.namelist() if n.startswith("word/") and n.endswith(".xml")):
            root = etree.fromstring(z.read(part))
            for tag, order in (("pPr", PPR_ORDER), ("rPr", RPR_ORDER)):
                for el in root.iter(W + tag):
                    names = [c.tag.replace(W, "") for c in el if isinstance(c.tag, str)]
                    idx = [order.index(n) if n in order else -1 for n in names]
                    if -1 in idx or idx != sorted(idx) or len(set(names)) != len(names):
                        problems.append((part, tag, names))
    return problems


def _all_text(doc) -> str:
    """A Word document's words, the boxes (tables) included."""
    parts = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        parts += [p.text for row in table.rows for cell in row.cells for p in cell.paragraphs]
    return "\n".join(parts)


@pytest.mark.parametrize("lang", ["en", "fr", "fa", "zh"])
def test_word_report_opens_and_is_well_formed(lang):
    data = build_word_doc(report(lang), "orders.xlsx", "retail", charts=CHARTS, language=lang,
                          confidence_score=7)
    assert _schema_order_problems(data) == []
    doc = Document(io.BytesIO(data))
    text = _all_text(doc)
    labels = labels_for(lang)
    for key in ("short_version", "what_we_found", "your_questions", "what_it_means", "how_we_know"):
        assert labels[key] in text, key
    assert labels["not_answerable"] in text
    assert len(doc.inline_shapes) == 2                     # both charts placed
    assert any(p.style.name == "List Bullet" for p in doc.paragraphs)


def test_word_report_in_persian_runs_right_to_left():
    doc = Document(io.BytesIO(build_word_doc(report("fa"), language="fa")))
    body = [p for p in doc.paragraphs if p.text.strip()]
    assert all(p._p.pPr is not None and p._p.pPr.find(W + "bidi") is not None for p in body)
    assert "سه‌ماهه" in "\n".join(p.text for p in doc.paragraphs)   # half-space kept


# ── PowerPoint ────────────────────────────────────────────────────────────────

def test_long_text_is_split_into_slides_that_fit():
    body = "\n".join("word " * 80 for _ in range(10))
    pages = chunk_text(body, FULL_WIDTH_CHARS)
    assert len(pages) > 1
    assert all(sum(_weight(p) + 40 for p in page) <= FULL_WIDTH_CHARS + 40 for page in pages)
    one_giant_paragraph = "x " * 3000
    assert all(len(page) for page in chunk_text(one_giant_paragraph, 500))


@pytest.mark.parametrize("lang", ["en", "fa"])
def test_deck_opens_with_every_section(lang):
    deck = Presentation(io.BytesIO(build_pptx(report(lang), "orders.xlsx", "retail", charts=CHARTS,
                                              language=lang, confidence_score=7)))
    texts = ["\n".join(sh.text_frame.text for sh in s.shapes if sh.has_text_frame) for s in deck.slides]
    labels = labels_for(lang)
    assert any(labels["short_version"] in t for t in texts)
    assert sum(labels["your_questions"] in t for t in texts) == 2       # one slide per question
    assert any(labels["what_it_means"] in t for t in texts)
    assert any(labels["how_we_know"] in t for t in texts)
    pictures = sum(1 for s in deck.slides for sh in s.shapes if sh.shape_type == 13)
    assert pictures == 2                                                # beside its insight, and its own slide
    if lang == "fa":
        rtl = [p for s in deck.slides for sh in s.shapes if sh.has_text_frame
               for p in sh.text_frame.paragraphs if p.text.strip()]
        assert all(p._p.pPr is not None and p._p.pPr.get("rtl") == "1" for p in rtl)


def test_a_long_insight_continues_on_the_next_slide():
    deck = Presentation(io.BytesIO(build_pptx(report("en", long_body=True), charts=CHARTS)))
    texts = [sh.text_frame.text for s in deck.slides for sh in s.shapes if sh.has_text_frame]
    assert "North leads (continued)" in texts


# ── PDF ───────────────────────────────────────────────────────────────────────

def _pdf(lang, rep=None, look=None):
    domain = DomainResult(domain="retail", confidence=0.9, is_analyzable=True, analysis_focus=[], key_questions=[],
                          column_decisions={"drop": [], "keep": [], "key": []}, attribute_interpretations={},
                          key_issues=["Revenue has 3 extreme values"])
    b64 = build_pdf(rep or report(lang), CHARTS, {"rowCount": 600, "columnCount": 6}, was_cleaned=False,
                    file_name="orders.xlsx", domain=domain, judge_confidence_score=4, language=lang,
                    dropped_columns=["order_id"], look=look)
    return base64.b64decode(b64)


def test_pdf_in_english_embeds_the_looks_own_fonts_and_nothing_more():
    data = _pdf("en")
    assert data.startswith(b"%PDF")
    assert b"Bricolage" in data and b"WorkSans" in data            # the free plan's Signature
    assert b"DejaVu" not in data                                   # no letter needed a fallback
    assert len(re.findall(rb"/Type\s*/Page\b", data)) >= 3
    text = pdf_text(data)
    for key in ("short_version", "what_we_found", "what_it_means", "how_we_know"):
        assert labels_for("en")[key] in text, key
    assert "Regional sales review" in text and "North brings 42% of revenue" in text


@pytest.mark.parametrize("lang", ["fa", "zh"])
def test_pdf_in_other_scripts_embeds_a_unicode_font(lang):
    data = _pdf(lang)
    assert data.startswith(b"%PDF") and b"DejaVu" in data


def test_pdf_switches_font_for_foreign_text_in_an_english_report():
    rep = report("en")
    rep.insights[0]["body"] += "\nThe column «درآمد» matters."
    assert b"DejaVu" in _pdf("en", rep)
    assert not needs_unicode("Café — “quoted” • 12 € œuvre")      # mapped onto Latin-1
    assert needs_unicode("درآمد") and needs_unicode("收入")


def test_pdf_cover_shows_the_key_numbers_and_each_finding_its_strength_and_figure():
    rep = report("en")
    rep.keyNumbers = [{"value": "42%", "label": "of revenue from the North"},
                      {"value": "$1.2M", "label": "taken in"}]
    rep.insights[0].update(strength="strong", highlight={"value": "42%", "label": "from the North"})
    rep.insights[1].update(strength="weak")
    text = pdf_text(_pdf("en", rep))
    cover = text[:text.index(labels_for("en")["what_we_found"], text.index("$1.2M"))]
    assert "of revenue from the North" in cover and "$1.2M" in cover
    assert "Strong pattern" in text and "Weak pattern" in text and "from the North" in text


def test_pdf_cover_falls_back_to_the_files_size_without_key_numbers():
    text = pdf_text(_pdf("en"))
    assert "600" in text and "rows" in text and "columns" in text


# ── Looks: every theme, font and page size reaches the files ──────────────────

def _media_box(pdf: bytes):
    return [round(float(v)) for v in re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", pdf).groups()]


@pytest.mark.parametrize("theme", sorted(THEMES))
@pytest.mark.parametrize("size", ["a4", "letter"])
def test_every_theme_and_size_makes_all_three_files(theme, size):
    look = settle_look(theme, None, size)
    pdf = _pdf("en", look=look)
    assert _media_box(pdf) == ([595, 842] if size == "a4" else [612, 792])
    # The page is painted in the theme's paper, unless it is white.
    paper = THEMES[theme].rgb("paper")
    if paper != (255, 255, 255):
        rg = " ".join(f"{c / 255:.4f}".rstrip("0").rstrip(".") for c in paper).encode() + b" rg"
        pages = b"".join(streams(pdf))
        assert rg in pages

    word = build_word_doc(report("en"), "orders.xlsx", "retail", charts=CHARTS, confidence_score=7, look=look)
    assert _schema_order_problems(word) == []
    doc = Document(io.BytesIO(word))
    width_mm = doc.sections[0].page_width.mm
    assert abs(width_mm - (210 if size == "a4" else 215.9)) < 0.5
    office = office_theme(look)
    assert not office.dark                                  # Word is printed: always on light paper
    assert doc.styles["Heading 1"].font.name == look.f.office_heading

    deck = Presentation(io.BytesIO(build_pptx(report("en"), charts=CHARTS, confidence_score=7, look=look)))
    ground = deck.slides[0].background.fill.fore_color.rgb
    assert str(ground) == THEMES[theme].paper.lstrip("#").upper()   # slides keep the theme, dark included


def test_a_font_choice_overrides_the_themes_own_fonts():
    look = settle_look("clean", "classic", "a4")
    assert b"STIX" in _pdf("en", look=look)
    doc = Document(io.BytesIO(build_word_doc(report("en"), look=look)))
    assert doc.styles["Normal"].font.name == "Georgia"


def test_word_names_its_fonts_outright_so_the_template_theme_fonts_do_not_win():
    data = build_word_doc(report("en"), look=settle_look("warm", None, "a4"))
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        styles = z.read("word/styles.xml")
    assert b"asciiTheme" not in styles and b"Georgia" in styles


def test_a_dark_theme_turns_light_for_print_in_word():
    night = office_theme(settle_look("midnight", None, "a4"))
    assert night.paper == "#FFFFFF" and night.ink == THEMES["midnight"].paper
    assert night.accent == THEMES["midnight"].mark            # cobalt headings, readable on white
    assert office_theme(settle_look("warm", None, "a4")) == THEMES["warm"]
