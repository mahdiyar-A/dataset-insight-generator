"""
What hands-on testing on 2026-11-27 found wrong in reports, each pinned down.

Most false statements came from DIG's own code, not from the models: the
reader that erased "None", the two-humps test, the unusual-rows scan, the
number checker that could not read French, and the issue list printed
unchecked.
"""
import urllib.error

import numpy as np
import pandas as pd
import pytest

from ai_engine.charts.chart_generator import readable_names
from ai_engine.core.stat_tests import distribution_shape
from ai_engine.core.stats_analyzer import _anomalies
from ai_engine.ingest.loader import load_table
from ai_engine.llm import report_writer
from ai_engine.llm.guard import ungrounded_numbers
from ai_engine.llm.insight_agent import _strip_known_ids
from ai_engine.report_labels import labels_for, printed_issues


# ── Reading the file ─────────────────────────────────────────────────────────

def test_none_is_a_category_in_a_text_column_and_missing_in_a_number_column():
    csv = b"id,insurance,wait\n1,OHIP,10\n2,None,\n3,Private,N/A\n4,,7\n5,None,None\n"
    df = load_table(csv, "clinic.csv").df
    assert list(df["insurance"].fillna("<blank>")) == ["OHIP", "None", "Private", "<blank>", "None"]
    assert df["wait"].isna().sum() == 3


# ── Shapes and unusual rows ──────────────────────────────────────────────────

@pytest.mark.parametrize("seed", range(5))
def test_an_even_spread_is_never_called_two_clusters(seed):
    rng = np.random.default_rng(seed)
    assert distribution_shape(rng.uniform(0, 1, 200)) != "bimodal"
    assert distribution_shape(rng.integers(0, 4, 200).astype(float)) != "bimodal"


def test_two_real_clusters_are_still_found():
    rng = np.random.default_rng(1)
    values = np.r_[rng.normal(0, 1, 150), rng.normal(6, 1, 150)]
    assert distribution_shape(values) == "bimodal"


def test_clean_data_has_almost_no_unusual_rows_and_planted_ones_are_found():
    rng = np.random.default_rng(0)
    n = 420
    df = pd.DataFrame({"wait": rng.normal(30, 5, n), "age": rng.integers(18, 90, n).astype(float),
                       "score": rng.uniform(1, 5, n), "cost": rng.normal(50, 10, n)})
    clean = _anomalies(df, list(df.columns))
    assert clean["anomalousPct"] < 2, "the old scan flagged about a third of these rows"

    df.iloc[:5] = [[90, 212, 5, 150]] * 5
    planted = _anomalies(df, list(df.columns))
    assert planted["anomalousRows"] >= 5


# ── Checking figures in any language ─────────────────────────────────────────

SOURCE = ["left 35.8 vs 10.5 salary 74182.4 64369.1 engagement 6.3 5.6 corr -0.755 rows 422 change -19.1"]


@pytest.mark.parametrize("text", [
    "35,8 % contre 10,5 %, salaire 74 182 contre 64 369, 6,3 et 5,6",     # French
    "35,8 % ; 64 369",                                         # French typographic spaces
    "Corrélation de −0,755 ; baisse de 19,1 points",                      # minus sign, fall without sign
    "Correlation of −0.755; salary 74,182 vs 64,369",                     # English, minus sign
    "۳۵٫۸٪ در برابر ۱۰٫۵٪ و ۶۴٬۳۶۹",                                      # Persian digits
    "Gehalt 74.182 gegen 64.369; 35,8 %",                                 # German
])
def test_right_figures_written_any_way_are_matched(text):
    assert ungrounded_numbers(text, SOURCE) == []


def test_wrong_figures_are_still_caught():
    assert ungrounded_numbers("Wrong: 47.2% and 1,234 and 999", SOURCE) == [47.2, 1234.0, 999.0]


def test_a_range_keeps_both_ends_positive():
    assert ungrounded_numbers("between 10–20 rows", ["10 20"]) == []


# ── What is printed ──────────────────────────────────────────────────────────

def test_the_file_readers_figures_are_not_printed_and_other_languages_print_neither_list():
    model = ["20% of satisfaction values are missing", "Dates cover one year only"]
    measured = ["2 duplicate rows removed"]
    assert printed_issues(model, measured, "en") == ["Dates cover one year only", "2 duplicate rows removed"]
    assert printed_issues(model, measured, "fr") == []


def test_every_report_language_has_the_confidence_line():
    for lang in ("en", "fr", "es", "de", "pt", "zh", "ar", "fa"):
        line = labels_for(lang)["confidence_basis"].format(score=7)
        assert "7/10" in line and "gpt" not in line.lower()


def test_result_ids_are_taken_out_of_reader_text_and_french_spacing_stays():
    text = "Le tableau R1 indique : Sales perd 31,5 % (R6). Voir R3. F1 reste."
    assert _strip_known_ids(text, ["R1", "R6", "R3"]) == "Le tableau indique : Sales perd 31,5 %. Voir. F1 reste."


def test_cryptic_columns_get_readable_axis_names():
    names = readable_names(["V1", "V2", "region"], {"V1": "score before the course (out of 100)",
                                                    "V2": "score after the course", "region": "sales region"})
    assert names == {"V1": "Score before the course", "V2": "Score after the course"}


# ── Benching models ──────────────────────────────────────────────────────────

class _Error(urllib.error.HTTPError):
    def __init__(self, code, body):
        super().__init__("u", code, "x", {}, None)
        self._body = body

    def read(self):
        return self._body


def _benched_for(monkeypatch, error):
    report_writer.reset_cooldowns()
    p = report_writer.ReportProvider("groq", "M", "u", "m", 100, 5)

    def fail(*a, **k):
        raise error
    monkeypatch.setattr(report_writer, "_post", fail)
    report_writer._attempt(p, "k", "prompt", lambda t: None, 5, None, lambda: 100.0)
    until = report_writer._cooldown_until.get("m")
    report_writer.reset_cooldowns()
    return None if until is None else until - 100.0


def test_one_reply_groq_could_not_parse_does_not_bench_the_model(monkeypatch):
    body = b'{"error":{"message":"Parsing failed. The model generated output that could not be parsed."}}'
    assert _benched_for(monkeypatch, _Error(400, body)) is None


def test_a_full_minute_of_output_benches_for_a_minute(monkeypatch):
    body = b'{"error":{"message":"Request too large for model on output tokens per minute"}}'
    assert _benched_for(monkeypatch, _Error(413, body)) == report_writer.TOO_LARGE_COOLDOWN_SECS


def test_a_time_out_benches_for_less_than_an_outage(monkeypatch):
    assert _benched_for(monkeypatch, TimeoutError("slow")) == report_writer.TIMEOUT_COOLDOWN_SECS
    assert report_writer.TIMEOUT_COOLDOWN_SECS < report_writer.COOLDOWN_SECS


# ── A letter saved as .csv (item 34) ─────────────────────────────────────────

_LETTER = b'Dear Sam,\n\nThank you for your letter, which arrived on Monday. I hope you, Jo and the kids are well.\nWe had a lovely time at the lake, the cabin, and the town this summer.\nThe weather was warm, the water was cold, and the food was great.\nI will write again soon, once things settle down.\nPlease give my love to everyone, especially Gran.\nSee you at Christmas, if not before.\nWith love, as always,\nAlex\n'
_SPACED_LETTER = (b"Dear Sam\n\nThank you for your letter. I hope you are well.\n"
                  b"We had a lovely time at the lake this summer.\nThe kids loved it and so did I.\n\n"
                  b"Best wishes\nAlex\n")


@pytest.mark.parametrize("letter", [_LETTER, _SPACED_LETTER], ids=["commas", "spaces"])
def test_a_letter_saved_as_csv_is_not_a_table(letter):
    from ai_engine.quality.quality_checker import NOT_A_TABLE, check_data_quality, looks_like_prose
    df = load_table(letter, "letter.csv").df
    assert looks_like_prose(df)
    quality = check_data_quality(df)
    assert not quality.isUsable and NOT_A_TABLE in quality.errors


def test_text_only_tables_are_still_tables():
    from ai_engine.quality.quality_checker import looks_like_prose
    rng = np.random.default_rng(3)
    people = pd.DataFrame({"name": [f"Person {i}" for i in range(50)],
                           "city": rng.choice(["Toronto", "Paris", "Tehran"], 50)})
    reviews = pd.DataFrame({
        "product": rng.choice(["Kettle", "Toaster", "Fan"], 60),
        "review": [f"I bought this for my mum and it was the best thing in the house, number {i}"
                   for i in range(60)]})
    numbers = pd.DataFrame({"note": ["it was the best of times and the worst"] * 30,
                            "sales": rng.integers(1, 99, 30)})
    assert not any(looks_like_prose(d) for d in (people, reviews, numbers))
