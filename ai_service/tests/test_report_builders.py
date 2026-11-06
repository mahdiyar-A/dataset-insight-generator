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

from ai_engine.models.models import DomainResult, LLMReport
from ai_engine.pdf.pdf_builder import build_pdf, needs_unicode
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


@pytest.mark.parametrize("lang", ["en", "fr", "fa", "zh"])
def test_word_report_opens_and_is_well_formed(lang):
    data = build_word_doc(report(lang), "orders.xlsx", "retail", charts=CHARTS, language=lang,
                          confidence_score=7)
    assert _schema_order_problems(data) == []
    doc = Document(io.BytesIO(data))
    text = "\n".join(p.text for p in doc.paragraphs)
    labels = labels_for(lang)
    for key in ("executive_summary", "key_insights", "your_questions", "conclusion", "methodology"):
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
    assert any(labels["executive_summary"] in t for t in texts)
    assert sum(labels["your_questions"] in t for t in texts) == 2       # one slide per question
    assert any(labels["methodology"] in t for t in texts)
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

def _pdf(lang, rep=None):
    domain = DomainResult(domain="retail", confidence=0.9, is_analyzable=True, analysis_focus=[], key_questions=[],
                          column_decisions={"drop": [], "keep": [], "key": []}, attribute_interpretations={},
                          key_issues=["Revenue has 3 extreme values"])
    b64 = build_pdf(rep or report(lang), CHARTS, {"rowCount": 600, "columnCount": 6}, was_cleaned=False,
                    file_name="orders.xlsx", domain=domain, judge_confidence_score=4, language=lang,
                    dropped_columns=["order_id"])
    return base64.b64decode(b64)


def test_pdf_in_english_keeps_the_built_in_font():
    data = _pdf("en")
    assert data.startswith(b"%PDF") and b"DejaVu" not in data
    assert len(re.findall(rb"/Type\s*/Page\b", data)) >= 3


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
