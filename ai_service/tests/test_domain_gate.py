"""
Domain detection (Phase 1) runs through the model harness.

It used to call one Groq model directly, sleep up to 35s on a rate limit and
then give up, so a busy minute made every file domain "general". These tests
replace the HTTP call and check that a busy or useless first model hands over
to the next one at once, that the reply is still validated against the real
columns, and that no key means no call.
"""

import email.message
import io
import json
import time
import urllib.error

import pandas as pd
import pytest

from ai_engine.core import pipeline
from ai_engine.llm import groq_client, report_writer

REPLY = {
    "domain": "retail",
    "confidence": 0.9,
    "is_analyzable": True,
    "analysis_focus": ["sales by region"],
    "key_questions": ["Which region sells most?"],
    "column_decisions": {"drop": ["ghost"], "keep": ["region"], "key": ["revenue"]},
    "attribute_interpretations": {"revenue": "sales revenue", "ghost": "not a column"},
    "cleaning_needed": False,
    "cleaning_methods": ["remove_duplicates", "impute_median:revenue", "impute_median:ghost"],
}


@pytest.fixture(autouse=True)
def _fresh_cooldowns():
    report_writer.reset_cooldowns()
    yield
    report_writer.reset_cooldowns()


@pytest.fixture
def df():
    return pd.DataFrame({"region": ["North", "South", "East"] * 20,
                         "revenue": [120.5, 80.25, 99.0] * 20})


def ok(content: str) -> dict:
    return {"choices": [{"message": {"content": content}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 900, "completion_tokens": 300}}


def http_error(code: int, body: bytes = b"") -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://x", code, "err", email.message.Message(), io.BytesIO(body))


def install(monkeypatch, behaviour) -> list:
    calls = []

    def fake_post(provider, api_key, prompt, timeout):
        calls.append(provider.model)
        outcome = behaviour(provider.model)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(report_writer, "_post", fake_post)
    return calls


def test_a_busy_first_model_hands_over_at_once(monkeypatch, df):
    busy = b'{"error":{"message":"Rate limit reached. Please try again in 7.5s"}}'
    calls = install(monkeypatch, lambda model: http_error(429, busy) if model == "openai/gpt-oss-20b"
                    else ok(json.dumps(REPLY)))
    started = time.monotonic()
    domain = groq_client.detect_domain(df, {"groq": "k", "openrouter": "k"})

    assert domain.domain == "retail"
    assert calls == ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
    assert time.monotonic() - started < 5          # no sleeping out the rate limit


def test_the_reply_is_still_checked_against_the_real_columns(monkeypatch, df):
    install(monkeypatch, lambda model: ok(json.dumps(REPLY)))
    domain = groq_client.detect_domain(df, {"groq": "k"})
    assert domain.column_decisions["drop"] == []
    assert "ghost" not in domain.attribute_interpretations
    assert "impute_median:ghost" not in domain.cleaning_methods
    assert "impute_median:revenue" in domain.cleaning_methods


def test_a_reply_that_is_not_a_classification_goes_to_the_next_model(monkeypatch, df):
    replies = {"openai/gpt-oss-20b": ok("This looks like retail data to me."),
               "qwen/qwen3.8-27b": ok("```json\n" + json.dumps(REPLY) + "\n```")}
    calls = install(monkeypatch, lambda model: replies[model])
    assert groq_client.detect_domain(df, {"groq": "k"}).domain == "retail"
    assert calls == ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"]


def test_every_model_failing_gives_the_general_fallback(monkeypatch, df):
    calls = install(monkeypatch, lambda model: http_error(503))
    domain = groq_client.detect_domain(df, {"groq": "k", "openrouter": "k"})
    assert domain.domain == "general" and domain.is_analyzable
    assert len(calls) == len(groq_client.DOMAIN_PROVIDERS)


def test_openrouter_alone_is_enough(monkeypatch, df):
    calls = install(monkeypatch, lambda model: ok(json.dumps(REPLY)))
    assert groq_client.detect_domain(df, {"openrouter": "k"}).domain == "retail"
    assert calls == ["nvidia/nemotron-3.5-super-vl:free"]


def test_a_bare_groq_key_still_works(monkeypatch, df):
    calls = install(monkeypatch, lambda model: ok(json.dumps(REPLY)))
    assert groq_client.detect_domain(df, "k").domain == "retail"
    assert calls == ["openai/gpt-oss-20b"]


def test_the_gate_with_no_key_never_calls_a_model(monkeypatch, df):
    calls = install(monkeypatch, lambda model: AssertionError("a model was called"))
    domain = pipeline._run_domain_gate(df, {"groq": "", "openrouter": ""})
    assert domain.domain == "general" and calls == []
