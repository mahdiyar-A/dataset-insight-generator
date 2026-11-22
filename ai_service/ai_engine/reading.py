"""
Who a report is for, and how it should speak to them.

Every report used to be written by "a managing partner at a world-class
analytics consultancy" for "the C-suite", because the free plan sends no
settings and the server's default tone was "professional". A café's sales
came back quoting eta-squared, Mann-Kendall's tau and "p < 1e-6" on its first
page; a list of books someone read would have too.

A person looking at a file first asks what it is and who keeps it, then
writes for that person. So does DIG now. When the file is read (the domain
call in llm/groq_client.py, no extra model call), the model also says who
most likely reads the report and how they should be spoken to:

  setting   personal | business | public | research | technical
  level     plain     no statistics words at all; strength said in words
            balanced  plain first, a key figure where it helps
            expert    test names and statistics welcome
  voice     friendly | professional | formal
  charts    simple    bars and lines a first-time reader gets in two seconds
            standard  the usual mix
            detailed  anything that fits, scatter and box plots included
  theme     the look that suits it (design/looks.py)

Without a model the same is worked out from the kind of data. A Pro user's
own choices of tone, audience and occasion win over the reading: settle()
applies them, so "casual" really is casual and "academic" really is formal.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional

SETTINGS = ("personal", "business", "public", "research", "technical")
LEVELS = ("plain", "balanced", "expert")
VOICES = ("friendly", "professional", "formal")
CHART_LEVELS = ("simple", "standard", "detailed")
THEME_IDS = ("signature", "clean", "warm", "classic", "midnight")

MAX_READER = 80


@dataclass
class Reading:
    reader: str = ""                 # "a café owner": the model's words, English
    setting: str = "business"
    level: str = "plain"
    voice: str = "professional"
    charts: str = "simple"
    theme: str = "signature"
    source: str = "rules"            # model | rules | chosen

    def to_dict(self) -> Dict[str, str]:
        return asdict(self)


def _pick(value: Any, allowed, default: str) -> str:
    v = str(value or "").strip().lower()
    return v if v in allowed else default


def _reader_words(value: Any) -> str:
    """The model's few words for the reader, bounded and on one line."""
    from ai_engine.llm.guard import one_line
    text = one_line(value, MAX_READER) if isinstance(value, str) else ""
    return text.rstrip(".")


# Kinds of data and the reading that suits them when no model answered.
_BY_DOMAIN: Dict[str, Dict[str, str]] = {
    "academic":      {"setting": "research", "level": "balanced", "voice": "formal", "charts": "standard",
                      "theme": "classic", "reader": "a researcher or student"},
    "finance":       {"setting": "business", "level": "balanced", "voice": "professional", "charts": "standard",
                      "theme": "classic", "reader": "someone who manages this money"},
    "healthcare":    {"setting": "business", "level": "balanced", "voice": "professional", "charts": "standard",
                      "theme": "clean", "reader": "a care team or clinic manager"},
    "iot":           {"setting": "technical", "level": "balanced", "voice": "professional", "charts": "standard",
                      "theme": "clean", "reader": "an engineer looking after the devices"},
    "manufacturing": {"setting": "technical", "level": "balanced", "voice": "professional", "charts": "standard",
                      "theme": "clean", "reader": "a production or operations manager"},
    "logistics":     {"setting": "business", "level": "plain", "voice": "professional", "charts": "simple",
                      "theme": "clean", "reader": "an operations manager"},
    "retail":        {"setting": "business", "level": "plain", "voice": "professional", "charts": "simple",
                      "theme": "warm", "reader": "a shop owner or manager"},
    "ecommerce":     {"setting": "business", "level": "plain", "voice": "professional", "charts": "simple",
                      "theme": "signature", "reader": "an online shop owner"},
    "marketing":     {"setting": "business", "level": "plain", "voice": "professional", "charts": "simple",
                      "theme": "signature", "reader": "a marketing team"},
    "hr":            {"setting": "business", "level": "plain", "voice": "professional", "charts": "simple",
                      "theme": "clean", "reader": "a people or HR manager"},
    "real_estate":   {"setting": "business", "level": "plain", "voice": "professional", "charts": "simple",
                      "theme": "classic", "reader": "a property owner or agent"},
}
_GENERAL = {"setting": "public", "level": "plain", "voice": "friendly", "charts": "simple",
            "theme": "signature", "reader": "someone curious about this data"}


def by_rules(domain: str = "general") -> Reading:
    """The reading for a kind of data, used when no model said who reads it."""
    d = _BY_DOMAIN.get(str(domain or "general").lower(), _GENERAL)
    return Reading(reader=d["reader"], setting=d["setting"], level=d["level"], voice=d["voice"],
                   charts=d["charts"], theme=d["theme"], source="rules")


def from_model(raw: Any, domain: str = "general") -> Reading:
    """
    The model's reading of who the report is for, each value checked, or the
    rules' reading when it gave none. A value it got wrong falls back to what
    the rules say for this kind of data, not to a fixed default.
    """
    base = by_rules(domain)
    if not isinstance(raw, dict):
        return base
    reading = Reading(
        reader=_reader_words(raw.get("reader")) or base.reader,
        setting=_pick(raw.get("setting"), SETTINGS, base.setting),
        level=_pick(raw.get("level"), LEVELS, base.level),
        voice=_pick(raw.get("voice"), VOICES, base.voice),
        charts=_pick(raw.get("charts"), CHART_LEVELS, base.charts),
        theme=_pick(raw.get("theme"), THEME_IDS, base.theme),
        source="model",
    )
    # Someone's own records are never written up like a board paper.
    if reading.setting == "personal":
        if reading.level == "expert":
            reading.level = "plain"
        if reading.voice == "formal":
            reading.voice = "friendly"
    return reading


def from_dict(data: Any, domain: str = "general") -> Reading:
    """A reading stored with the classification or the report, checked like a model's."""
    if not isinstance(data, dict) or not data:
        return by_rules(domain)
    reading = from_model(data, domain)
    reading.source = _pick(data.get("source"), ("model", "rules", "chosen"), reading.source)
    return reading


_LEVEL_ORDER = {"plain": 0, "balanced": 1, "expert": 2}


def _at_most(level: str, cap: str) -> str:
    return level if _LEVEL_ORDER[level] <= _LEVEL_ORDER[cap] else cap


def _at_least(level: str, floor: str) -> str:
    return level if _LEVEL_ORDER[level] >= _LEVEL_ORDER[floor] else floor


def chosen(value: Optional[str]) -> bool:
    """Whether a setting was really chosen, rather than left to DIG."""
    return bool(value) and str(value).strip().lower() not in ("auto", "")


def settle(reading: Reading, tone: Optional[str] = None, audience: Optional[str] = None,
           occasion: Optional[str] = None, chart_style: Optional[str] = None) -> Reading:
    """
    The reading with a person's own choices applied on top. Each choice moves
    the level, voice or charts the way its name promises; "auto", empty and
    "general" leave the reading as it is.
    """
    r = Reading(**reading.to_dict())
    changed = False
    tone = str(tone or "").strip().lower()
    audience = str(audience or "").strip().lower()
    occasion = str(occasion or "").strip().lower()

    if audience == "executive":
        r.level, r.voice = _at_most(r.level, "balanced"), "professional"
        changed = True
    elif audience == "technical":
        r.level, r.charts = "expert", "detailed"
        changed = True
    elif audience == "client":
        r.level, r.voice = _at_most(r.level, "balanced"), "professional"
        changed = True
    elif audience == "student":
        r.level, r.voice = "balanced", "friendly"
        changed = True

    if occasion == "academic":
        r.level, r.voice = _at_least(r.level, "balanced"), "formal"
        changed = True
    elif occasion in ("investor", "client"):
        r.voice = "professional" if r.voice == "friendly" else r.voice
        changed = True

    # The tone is the most direct choice, so it goes last and wins.
    if tone in ("casual", "friendly"):
        r.level, r.voice = "plain", "friendly"
        changed = True
    elif tone in ("simplified", "plain", "simple"):
        r.level, r.charts = "plain", "simple"
        changed = True
    elif tone == "storytelling":
        r.level = _at_most(r.level, "balanced")
        changed = True
    elif tone == "professional":
        r.voice = "professional"
        changed = True
    elif tone == "technical":
        r.level, r.voice = "expert", "professional"
        r.charts = "detailed" if r.charts == "simple" else r.charts
        changed = True
    elif tone == "academic":
        r.level, r.voice = "expert", "formal"
        changed = True

    if chosen(chart_style) and chart_style != "mixed" and r.charts == "simple":
        # Asking for distributions or trends is asking for those charts.
        r.charts = "standard"
        changed = True

    if changed:
        r.source = "chosen"
    return r
