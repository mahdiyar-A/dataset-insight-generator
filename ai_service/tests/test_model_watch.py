"""
Tests for the model watch.

Why this matters
----------------
Every model DIG uses is a free endpoint someone else runs, and they are
withdrawn without telling us. The chain was built to shrug that off by moving
to the next model, which is exactly why nobody would notice: it just gets one
model shorter, until a report is the stats-only fallback.

The watch has to be right in both directions. A missed withdrawal is the thing
it exists to catch. A false alarm is nearly as bad: an email that cries wolf
gets filtered, and then the real one is not read. So a provider whose list
cannot be read must claim nothing, and a slow minute on the free tier must not
read as an outage.

No network: the provider lists are handed in.
"""

from datetime import date

import pytest

from ai_engine.llm import model_watch, report_writer
from ai_engine.llm.groq_client import DOMAIN_PROVIDERS
from ai_engine.llm.harness import BRIEF_PROVIDERS, CHAT_PROVIDERS
from ai_engine.llm.model_watch import KEY_URL, LIST_URLS, check, configured_models
from ai_engine.llm.report_writer import REPORT_PROVIDERS
from ai_engine.llm.user_requests import PLAN_PROVIDERS

KEYS = {"openrouter": "or-key", "groq": "groq-key"}
TODAY = date(2026, 11, 11)
QUIET_DAY = {"windowHours": 24, "outcomes": {}, "models": {}}

EVERY_CHAIN = (REPORT_PROVIDERS, CHAT_PROVIDERS, BRIEF_PROVIDERS, DOMAIN_PROVIDERS, PLAN_PROVIDERS)


def everything_listed():
    """Both providers' lists, holding every model DIG uses."""
    lists = {"openrouter": {}, "groq": {}}
    for chain in EVERY_CHAIN:
        for p in chain:
            lists[p.provider][p.model] = {"id": p.model}
    return lists


def provider_api(lists, allowance=(12, 50), broken=()):
    """A stand-in for the two providers. `broken` names the ones whose list cannot be read."""
    seen = []

    def fetch(url, api_key=""):
        seen.append((url, api_key))
        if url == KEY_URL:
            used, limit = allowance
            return {"data": {"free_model_daily_requests": {"used": used, "limit": limit, "remaining": limit - used}}}
        provider = next(name for name, list_url in LIST_URLS.items() if list_url == url)
        if provider in broken:
            raise TimeoutError("no answer")
        return {"data": list(lists[provider].values())}

    fetch.seen = seen
    return fetch


def run(lists=None, health=QUIET_DAY, keys=KEYS, **api):
    return check(keys, fetch=provider_api(lists or everything_listed(), **api), today=TODAY, health=health)


def status_of(result, model):
    return next(m for m in result["models"] if m["model"] == model)


QWEN = "qwen/qwen3.8-27b"
ULTRA = REPORT_PROVIDERS[0].model


# ─────────────────────────────────────────────────────────────────────────────
# What is watched
# ─────────────────────────────────────────────────────────────────────────────

def test_every_model_in_every_chain_is_watched():
    # Risk: a chain added later whose models nobody checks.
    watched = {(m["provider"], m["model"]) for m in configured_models()}

    for chain in EVERY_CHAIN:
        for p in chain:
            assert (p.provider, p.model) in watched


def test_a_model_used_in_several_places_is_listed_once_with_all_its_uses():
    models = configured_models()

    assert len({(m["provider"], m["model"]) for m in models}) == len(models)
    qwen = next(m for m in models if m["model"] == QWEN)
    assert "reports" in qwen["usedFor"] and "answering questions" in qwen["usedFor"]


# ─────────────────────────────────────────────────────────────────────────────
# A normal day
# ─────────────────────────────────────────────────────────────────────────────

def test_a_day_with_everything_in_place_has_nothing_to_say():
    result = run()

    assert result["problems"] == []
    assert {m["status"] for m in result["models"]} == {"ok"}
    assert result["allowance"] == {"openrouter": {"used": 12, "limit": 50, "remaining": 38}}
    assert all(c["working"] == c["models"] for c in result["chains"])


def test_the_groq_list_is_read_with_the_key_it_needs():
    fetch = provider_api(everything_listed())

    check(KEYS, fetch=fetch, today=TODAY, health=QUIET_DAY)

    assert (LIST_URLS["groq"], "groq-key") in fetch.seen


# ─────────────────────────────────────────────────────────────────────────────
# A model is withdrawn
# ─────────────────────────────────────────────────────────────────────────────

def test_a_withdrawn_model_is_named_with_what_it_was_for():
    lists = everything_listed()
    del lists["groq"][QWEN]

    result = run(lists)

    assert status_of(result, QWEN)["status"] == "missing"
    said = next(p for p in result["problems"] if "Qwen" in p)
    assert "no longer offered by Groq" in said
    assert "reports" in said and "answering questions" in said


def test_a_model_the_provider_marks_inactive_counts_as_withdrawn():
    lists = everything_listed()
    lists["groq"][QWEN] = {"id": QWEN, "active": False}

    assert status_of(run(lists), QWEN)["status"] == "missing"


def test_a_withdrawal_date_two_weeks_out_is_said_before_it_happens():
    lists = everything_listed()
    lists["openrouter"][ULTRA] = {"id": ULTRA, "expiration_date": "2026-11-20"}

    result = run(lists)

    model = status_of(result, ULTRA)
    assert model["status"] == "expiring" and model["expires"] == "2026-11-20"
    assert any("2026-11-20" in p and "in 9 days" in p for p in result["problems"])


def test_a_withdrawal_date_far_off_is_shown_and_not_an_alarm():
    lists = everything_listed()
    lists["openrouter"][ULTRA] = {"id": ULTRA, "expiration_date": "2027-03-01"}

    result = run(lists)

    assert status_of(result, ULTRA) | {"usedFor": None} == {
        "provider": "openrouter", "model": ULTRA, "name": REPORT_PROVIDERS[0].display_name,
        "usedFor": None, "status": "ok", "expires": "2027-03-01"}
    assert result["problems"] == []


def test_a_chain_down_to_its_last_model_is_said():
    # Three of the four report models gone: one bad day from no AI reports.
    lists = everything_listed()
    for p in REPORT_PROVIDERS[1:]:
        lists[p.provider].pop(p.model, None)

    result = run(lists)

    reports = next(c for c in result["chains"] if c["purpose"] == "reports")
    assert reports == {"purpose": "reports", "models": 4, "working": 1}
    assert any(p.startswith("Only 1 working model is left for reports") for p in result["problems"])


def test_a_chain_with_nothing_left_says_what_that_means():
    lists = everything_listed()
    for p in REPORT_PROVIDERS:
        lists[p.provider].pop(p.model, None)

    result = run(lists)

    assert any("No working model is left for reports" in p and "without AI" in p for p in result["problems"])


# ─────────────────────────────────────────────────────────────────────────────
# Not crying wolf
# ─────────────────────────────────────────────────────────────────────────────

def test_a_list_that_cannot_be_read_claims_nothing_is_missing():
    # Risk: one slow answer from a provider emailing "all your models are gone".
    result = run(broken=("groq",))

    groq = [m for m in result["models"] if m["provider"] == "groq"]
    assert groq and {m["status"] for m in groq} == {"unknown"}
    assert result["problems"] == []
    assert any("Groq's list of models could not be read" in n for n in result["notes"])
    assert all(c["working"] == c["models"] for c in result["chains"])


def test_both_lists_unreadable_is_still_no_alarm():
    result = run(broken=("groq", "openrouter"))

    assert result["problems"] == []
    assert len(result["notes"]) == 2


def test_check_never_raises_whatever_the_provider_answers():
    def nonsense(url, api_key=""):
        return ["not", "an", "object"]

    result = check(KEYS, fetch=nonsense, today=TODAY, health=QUIET_DAY)

    assert result["problems"] == []
    assert {m["status"] for m in result["models"]} == {"unknown"}


# ─────────────────────────────────────────────────────────────────────────────
# Keys and allowance
# ─────────────────────────────────────────────────────────────────────────────

def test_a_missing_key_is_said_once_with_how_many_models_it_costs():
    result = run(keys={"openrouter": "or-key", "groq": ""})

    about_key = [p for p in result["problems"] if "No Groq key is set" in p]
    assert len(about_key) == 1 and "3 models cannot be used" in about_key[0]
    assert {m["status"] for m in result["models"] if m["provider"] == "groq"} == {"no_key"}
    # And never "withdrawn": the models are there, we just cannot reach them.
    assert not any("no longer offered" in p for p in result["problems"])


def test_a_free_allowance_used_up_is_said():
    result = run(allowance=(50, 50))

    assert any("free OpenRouter requests are used up (50 of 50)" in p for p in result["problems"])


def test_a_free_allowance_partly_used_is_only_shown():
    result = run(allowance=(49, 50))

    assert result["problems"] == []
    assert result["allowance"]["openrouter"]["remaining"] == 1


# ─────────────────────────────────────────────────────────────────────────────
# How the day went
# ─────────────────────────────────────────────────────────────────────────────

def day(**outcomes):
    return {"windowHours": 24, "models": {},
            "outcomes": {work: {"total": total, "failed": failed} for work, (failed, total) in outcomes.items()}}


def test_one_report_written_without_ai_is_worth_an_email():
    result = run(health=day(report=(1, 8)))

    assert any(p.startswith("1 report out of 8 in the last 24 hours had to be written without AI")
               for p in result["problems"])


def test_a_file_whose_domain_no_model_could_name_is_said():
    result = run(health=day(domain=(2, 8)))

    assert any("For 2 files out of 8" in p and "generic" in p for p in result["problems"])


def test_a_few_unanswered_questions_are_a_slow_minute_not_an_outage():
    # The free tier takes about one question a minute per model, so a handful
    # of "try again in a minute" on a busy day is the limit working.
    assert run(health=day(question=(4, 40)))["problems"] == []


def test_many_unanswered_questions_are_said():
    result = run(health=day(question=(5, 40)))

    assert any(p.startswith("5 questions out of 40") for p in result["problems"])


# ─────────────────────────────────────────────────────────────────────────────
# The day's record (report_writer)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def clean_record():
    report_writer.reset_health()
    report_writer.reset_cooldowns()
    yield
    report_writer.reset_health()
    report_writer.reset_cooldowns()


def test_outcomes_are_counted_by_kind(clean_record):
    report_writer.note_outcome("report", True)
    report_writer.note_outcome("report", False)
    report_writer.note_outcome("question", True)

    outcomes = report_writer.health_snapshot()["outcomes"]

    assert outcomes == {"report": {"total": 2, "failed": 1}, "question": {"total": 1, "failed": 0}}


def test_what_happened_more_than_a_day_ago_is_forgotten(clean_record):
    report_writer.note_outcome("report", False)
    a_day_and_a_bit = report_writer.HEALTH_WINDOW_SECS + 60

    import time
    later = report_writer.health_snapshot(now=time.time() + a_day_and_a_bit)

    assert later["outcomes"] == {}


def test_each_model_call_is_recorded_with_its_last_error(clean_record, monkeypatch):
    first, second = REPORT_PROVIDERS[0], REPORT_PROVIDERS[1]

    def post(provider, api_key, prompt, timeout):
        if provider.model == first.model:
            raise RuntimeError("overloaded")
        return {"choices": [{"message": {"content": "fine"}, "finish_reason": "stop"}], "usage": {}}

    monkeypatch.setattr(report_writer, "_post", post)

    result, provider = report_writer.write_report("prompt", KEYS, accept=lambda text: text,
                                                  providers=(first, second))

    models = report_writer.health_snapshot()["models"]
    assert result == "fine" and provider is second
    assert models[first.model]["failed"] == 1 and "overloaded" in models[first.model]["lastError"]
    assert models[second.model] == {"calls": 1, "failed": 0, "lastOkAt": models[second.model]["lastOkAt"],
                                    "lastError": None, "lastErrorAt": None}
    assert models[second.model]["lastOkAt"] is not None


# ─────────────────────────────────────────────────────────────────────────────
# Asked for often, fetched seldom
# ─────────────────────────────────────────────────────────────────────────────

def test_a_page_polling_the_status_does_not_poll_the_providers(monkeypatch):
    model_watch.forget_cache()
    calls = []
    monkeypatch.setattr(model_watch, "check", lambda keys: calls.append(1) or {"problems": [], "models": []})
    now = [1000.0]

    model_watch.cached_check(KEYS, clock=lambda: now[0])
    model_watch.cached_check(KEYS, clock=lambda: now[0])
    now[0] += model_watch.CACHE_SECS + 1
    model_watch.cached_check(KEYS, clock=lambda: now[0])

    assert len(calls) == 2
    model_watch.forget_cache()
