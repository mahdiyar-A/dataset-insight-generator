"""
Tests for LLM token and cost accounting.

Why this matters
----------------
DIG charges a flat $9.99/month for unlimited analyses. Every analysis makes
three model calls and each one returns its token counts, which were previously
discarded. Without accounting you cannot distinguish a profitable subscriber
from one running deep analyses at a loss, and a prompt edit that doubles token
spend is invisible until the provider invoice arrives.

Anything that silently reports zero or a wrong figure is worse than no
accounting at all, because decisions get made on it. These tests exist to keep
the numbers honest.
"""

import pytest

from ai_engine.telemetry.usage import (
    MODEL_PRICING,
    UsageTracker,
    price_of,
    tokens_from_gemini,
    tokens_from_groq,
)


# ── Pricing ──────────────────────────────────────────────────────────────────

def test_price_is_per_million_tokens():
    # Risk: an off-by-1000 in the denominator understates cost by three orders
    # of magnitude and makes everything look profitable.
    price = MODEL_PRICING["gemini-2.5-flash"]["input"]
    assert price_of("gemini-2.5-flash", 1_000_000, 0) == pytest.approx(price)


def test_input_and_output_are_priced_separately():
    # Risk: output tokens cost several times input on every provider here.
    # Pricing them at the same rate badly understates generation-heavy calls.
    inp = price_of("gemini-2.5-flash", 1_000_000, 0)
    out = price_of("gemini-2.5-flash", 0, 1_000_000)
    assert out != inp


def test_unknown_model_costs_zero_rather_than_guessing():
    # Risk: guessing a price for an unrecognised model produces a plausible but
    # wrong figure that nobody notices. A zero is visibly wrong and prompts
    # someone to add the model to the table.
    assert price_of("some-model-released-tomorrow", 10_000, 10_000) == 0.0


def test_versioned_model_ids_match_by_prefix():
    # Providers append version suffixes without announcing it. Falling back to
    # zero for gemini-2.5-flash-001 would silently zero out real spend.
    assert price_of("gemini-2.5-flash-001", 1_000_000, 0) == \
           price_of("gemini-2.5-flash", 1_000_000, 0)


def test_zero_tokens_costs_nothing():
    assert price_of("gemini-2.5-flash", 0, 0) == 0.0


# ── Tracker ──────────────────────────────────────────────────────────────────

def test_tracker_sums_across_calls():
    t = UsageTracker()
    t.record("groq", "llama-3.3-70b-versatile", "domain", 1000, 200, 500)
    t.record("gemini", "gemini-2.5-flash", "insights", 5000, 2000, 9000)

    assert t.call_count == 2
    assert t.total_input_tokens == 6000
    assert t.total_output_tokens == 2200
    assert t.total_cost_usd > 0


def test_cost_by_phase_attributes_spend_correctly():
    # This breakdown is what tells you which prompt to attack when cost rises.
    t = UsageTracker()
    t.record("groq", "llama-3.3-70b-versatile", "domain", 1000, 100, 400)
    t.record("gemini", "gemini-2.5-flash", "insights", 9000, 3000, 11000)
    t.record("groq", "llama-3.3-70b-versatile", "judge", 2000, 500, 900)

    by_phase = t.cost_by_phase()

    assert set(by_phase) == {"domain", "insights", "judge"}
    assert by_phase["insights"] > by_phase["domain"], \
        "insight generation is the dominant cost and the figures should show it"
    assert sum(by_phase.values()) == pytest.approx(t.total_cost_usd, abs=1e-6)


def test_trackers_are_independent():
    # Risk: a module-level accumulator would pool the spend of two analyses
    # running concurrently under FastAPI, so per-analysis cost would be wrong
    # exactly when the service is busy.
    a, b = UsageTracker(), UsageTracker()
    a.record("groq", "llama-3.3-70b-versatile", "domain", 1000, 100, 400)

    assert b.call_count == 0
    assert b.total_cost_usd == 0.0


def test_failed_calls_are_counted_but_still_priced():
    # A call that errors after the model generated tokens still costs money.
    t = UsageTracker()
    t.record("gemini", "gemini-2.5-flash", "insights", 5000, 1000, 8000,
             ok=False, error="timeout")

    assert t.failed_call_count == 1
    assert t.total_cost_usd > 0


def test_negative_and_none_token_counts_are_clamped():
    # Risk: a malformed provider response must not produce a negative cost that
    # silently offsets real spend in an aggregate.
    t = UsageTracker()
    t.record("groq", "llama-3.3-70b-versatile", "domain", -5, None, -1)

    assert t.total_input_tokens == 0
    assert t.total_output_tokens == 0
    assert t.total_cost_usd == 0.0


def test_to_dict_carries_everything_the_backend_persists():
    t = UsageTracker()
    t.record("groq", "llama-3.3-70b-versatile", "domain", 1000, 100, 400)
    d = t.to_dict()

    for key in ("total_cost_usd", "total_input_tokens", "total_output_tokens",
                "call_count", "failed_call_count", "duration_ms",
                "cost_by_phase", "pricing_updated", "calls"):
        assert key in d, f"{key} missing — the backend expects to persist it"

    assert len(d["calls"]) == 1
    assert d["calls"][0]["phase"] == "domain"


def test_empty_tracker_reports_zeroes_not_errors():
    # A pipeline that fails before any model call must still serialise.
    t = UsageTracker()
    d = t.to_dict()

    assert d["call_count"] == 0
    assert d["total_cost_usd"] == 0.0
    assert d["cost_by_phase"] == {}


def test_summary_line_is_loggable():
    t = UsageTracker()
    t.record("groq", "llama-3.3-70b-versatile", "domain", 1000, 100, 400)

    line = t.summary_line()
    assert "$" in line and "calls" in line


# ── Provider response parsing ────────────────────────────────────────────────

def test_groq_usage_parsing():
    raw = {"usage": {"prompt_tokens": 1234, "completion_tokens": 567}}
    assert tokens_from_groq(raw) == (1234, 567)


def test_gemini_usage_parsing():
    raw = {"usageMetadata": {"promptTokenCount": 800, "candidatesTokenCount": 250}}
    assert tokens_from_gemini(raw) == (800, 250)


def test_gemini_total_is_not_used_as_output():
    # totalTokenCount includes thinking tokens on some models and can exceed
    # prompt + candidates. Reading it as output would overstate the priced
    # output tokens, which are the expensive ones.
    raw = {"usageMetadata": {
        "promptTokenCount": 800,
        "candidatesTokenCount": 250,
        "totalTokenCount": 5000,
    }}
    assert tokens_from_gemini(raw) == (800, 250)


@pytest.mark.parametrize("raw", [{}, {"usage": {}}, {"usageMetadata": {}}, {"usage": None}])
def test_missing_usage_block_yields_zeroes(raw):
    # Risk: a KeyError here would abort an analysis that had already succeeded,
    # purely because telemetry could not be read.
    assert tokens_from_groq(raw) == (0, 0)
    assert tokens_from_gemini(raw) == (0, 0)


# ── Sanity on the pricing table itself ───────────────────────────────────────

def test_every_price_is_positive():
    for model, prices in MODEL_PRICING.items():
        assert prices["input"] > 0, f"{model} input price must be positive"
        assert prices["output"] > 0, f"{model} output price must be positive"


def test_output_is_never_cheaper_than_input():
    # True of every provider DIG uses. A violation almost certainly means the
    # two columns were transposed when the table was updated.
    for model, prices in MODEL_PRICING.items():
        assert prices["output"] >= prices["input"], \
            f"{model}: output cheaper than input — columns likely swapped"
