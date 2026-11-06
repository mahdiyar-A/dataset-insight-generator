"""
Tests for the report-writer chain.

Why this matters
----------------
The report is the product. When the single paid provider ran out of credit,
every analysis quietly degraded to the stats-only fallback and nothing said so.
The chain exists so one dead endpoint cannot do that again — which only holds
if every kind of failure really does move on to the next model, if a hanging
model cannot stall an analysis, and if the order (strongest first, and which
companies see users' statistics) stays as intended.

No network: report_writer._post is replaced with a fake per test.
"""

import email.message
import io
import json

from ai_engine.llm.guard import without_unbacked_margins
import time
import urllib.error

import pytest

from ai_engine.llm import insight_agent, report_writer
from ai_engine.llm.report_writer import REPORT_PROVIDERS, write_report
from ai_engine.models.models import LLMReport
from ai_engine.telemetry.usage import UsageTracker

KEYS = {"openrouter": "or-key", "groq": "groq-key"}
ULTRA, GPT_OSS_120, SUPER, QWEN = (p.model for p in REPORT_PROVIDERS)

GOOD_REPORT = {
    "report_title": "Sales Review",
    "executive_summary": "West and Central carry most of the revenue.",
    "introduction": "intro",
    "insights": [{"title": "Concentration", "body": "Top two regions hold 71%."}],
    "chart_instructions": [{"chart_type": "bar", "title": "Revenue by region",
                            "x_column": "region", "y_column": "revenue"}],
    "data_quality_section": "clean",
    "gemini_confidence_score": 8,
    "confidence_note": "",
    "conclusion": "Focus on the West.",
}


@pytest.fixture(autouse=True)
def _fresh_cooldowns():
    # Cool-downs are process-wide by design; never let one test bench a model
    # for the next.
    report_writer.reset_cooldowns()
    yield
    report_writer.reset_cooldowns()


def ok(content: str, tin: int = 100, tout: int = 50) -> dict:
    return {"choices": [{"message": {"content": content}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": tin, "completion_tokens": tout}}


def http_error(code: int, body: bytes = b"quota exceeded", retry_after: str = "") -> urllib.error.HTTPError:
    headers = email.message.Message()
    if retry_after:
        headers["Retry-After"] = retry_after
    return urllib.error.HTTPError("https://x", code, "err", headers, io.BytesIO(body))


def tool_use_failed(generation: str) -> urllib.error.HTTPError:
    body = {"error": {"message": "Tool choice is none, but model called a tool",
                      "type": "invalid_request_error", "code": "tool_use_failed",
                      "failed_generation": generation}}
    return http_error(400, json.dumps(body).encode())


def install(monkeypatch, behaviour: dict) -> list:
    """behaviour maps model id -> response dict, exception, or callable. Returns the call log."""
    calls = []

    def fake_post(provider, api_key, prompt, timeout):
        calls.append(provider.model)
        outcome = behaviour[provider.model]
        if callable(outcome) and not isinstance(outcome, Exception):
            outcome = outcome()
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(report_writer, "_post", fake_post)
    return calls


def accept_json(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


# ── The chain itself ──────────────────────────────────────────────────────────

class TestChainShape:
    def test_strongest_model_is_tried_first(self):
        # The point of the chain: the best model writes the report whenever it
        # is available, and weaker ones only cover for it.
        assert REPORT_PROVIDERS[0].model == "nvidia/nemotron-3-ultra-550b-a55b:free"

    def test_the_weakest_model_never_writes_a_report(self):
        # Its real figures landed on the wrong things, which no check on figures
        # can see. The plain report says what it is instead.
        assert REPORT_PROVIDERS[-1].model == "qwen/qwen3.8-27b"
        assert "openai/gpt-oss-20b" not in [p.model for p in REPORT_PROVIDERS]

    def test_only_free_openrouter_endpoints_are_used(self):
        # Risk: dropping the ":free" suffix silently switches to the paid
        # endpoint of the same model and starts billing.
        for p in REPORT_PROVIDERS:
            if p.provider == "openrouter":
                assert p.model.endswith(":free"), p.model

    def test_no_google_served_model_in_the_chain(self):
        # Google AI Studio's free tier may use inputs for training. Users'
        # statistics must not route there without the privacy policy changing.
        assert not any(p.model.startswith("google/") for p in REPORT_PROVIDERS)

    def test_groq_requests_fit_the_free_tier_token_budget(self):
        # Groq's free tier rejects prompt + max_tokens above ~8K per minute. The
        # report prompt is ~3.3K tokens.
        for p in REPORT_PROVIDERS:
            if p.provider == "groq":
                assert p.max_tokens <= 4500, p.model


# ── Falling through ───────────────────────────────────────────────────────────

class TestFallthrough:
    def test_first_good_answer_wins(self, monkeypatch):
        calls = install(monkeypatch, {ULTRA: ok('{"a": 1}')})
        result, provider = write_report("p", KEYS, accept_json)
        assert result == {"a": 1}
        assert provider.model == ULTRA
        assert calls == [ULTRA]

    def test_overloaded_model_moves_to_next(self, monkeypatch):
        calls = install(monkeypatch, {ULTRA: http_error(503, b"Service temporarily overloaded"),
                                      GPT_OSS_120: ok('{"b": 2}')})
        result, provider = write_report("p", KEYS, accept_json)
        assert result == {"b": 2}
        assert provider.model == GPT_OSS_120
        assert calls == [ULTRA, GPT_OSS_120]

    def test_unparseable_reply_moves_to_next_model(self, monkeypatch):
        install(monkeypatch, {ULTRA: ok("not json at all"), GPT_OSS_120: ok('{"c": 3}')})
        _, provider = write_report("p", KEYS, accept_json)
        assert provider.model == GPT_OSS_120

    def test_error_inside_a_200_response_is_a_failure(self, monkeypatch):
        # OpenRouter reports upstream failures as HTTP 200 with an error body.
        install(monkeypatch, {ULTRA: {"error": {"message": "Provider returned error"}},
                              GPT_OSS_120: ok('{"d": 4}')})
        _, provider = write_report("p", KEYS, accept_json)
        assert provider.model == GPT_OSS_120

    def test_empty_content_is_a_failure(self, monkeypatch):
        # Reasoning models can spend the whole budget thinking and return "".
        empty = {"choices": [{"message": {"content": ""}, "finish_reason": "length"}]}
        install(monkeypatch, {ULTRA: empty, GPT_OSS_120: ok('{"e": 5}')})
        _, provider = write_report("p", KEYS, accept_json)
        assert provider.model == GPT_OSS_120

    def test_reaches_the_weakest_model_when_all_stronger_ones_fail(self, monkeypatch):
        calls = install(monkeypatch, {ULTRA: TimeoutError("slow"),
                                      GPT_OSS_120: urllib.error.URLError("refused"),
                                      SUPER: http_error(429),
                                      QWEN: ok('{"f": 6}')})
        _, provider = write_report("p", KEYS, accept_json)
        assert provider.model == QWEN
        assert calls == [ULTRA, GPT_OSS_120, SUPER, QWEN]

    def test_everything_failing_returns_none_and_never_raises(self, monkeypatch):
        install(monkeypatch, {m: http_error(503) for m in (ULTRA, GPT_OSS_120, SUPER, QWEN)})
        assert write_report("p", KEYS, accept_json) == (None, None)

    def test_providers_without_a_key_are_skipped(self, monkeypatch):
        calls = install(monkeypatch, {GPT_OSS_120: ok('{"g": 7}')})
        _, provider = write_report("p", {"groq": "groq-key"}, accept_json)
        assert provider.model == GPT_OSS_120
        assert calls == [GPT_OSS_120]   # no OpenRouter call was attempted at all


# ── Hanging models and the time budget ────────────────────────────────────────

class TestDeadlines:
    def test_a_hanging_call_is_abandoned_at_its_deadline(self):
        # Observed: an OpenRouter request held open for 14 minutes, because
        # filler bytes keep a socket timeout from ever firing.
        started = time.monotonic()
        with pytest.raises(TimeoutError):
            report_writer._with_deadline(lambda: time.sleep(5), 0.2)
        assert time.monotonic() - started < 2

    def test_a_hanging_model_hands_over_to_the_next(self, monkeypatch):
        slow = report_writer.ReportProvider("openrouter", "Slow", "u", "slow:free", 100, 1)
        fast = report_writer.ReportProvider("groq", "Fast", "u", "fast", 100, 5)

        def fake_post(provider, api_key, prompt, timeout):
            if provider.model == "slow:free":
                time.sleep(10)
            return ok('{"h": 8}')

        monkeypatch.setattr(report_writer, "_post", fake_post)
        started = time.monotonic()
        result, provider = write_report("p", KEYS, accept_json, providers=(slow, fast))
        assert provider.model == "fast"
        assert time.monotonic() - started < 5

    def test_chain_stops_when_the_budget_is_spent(self, monkeypatch):
        # Risk: five models each using their own full timeout would outlast the
        # backend's 360s wait for the whole analysis.
        now = [0.0]
        clock = lambda: now[0]

        def fake_post(provider, api_key, prompt, timeout):
            now[0] += 60          # every attempt burns a minute, then fails
            raise http_error(503)

        monkeypatch.setattr(report_writer, "_post", fake_post)
        calls = []
        monkeypatch.setattr(report_writer, "_with_deadline",
                            lambda fn, s: (calls.append(s), fn())[1])
        write_report("p", KEYS, accept_json, budget_secs=130, clock=clock)
        # 0s -> 60s -> 120s: only 10s left, under MIN_USEFUL_SECS, so it stops.
        assert len(calls) == 2

    def test_a_model_is_never_given_more_time_than_the_budget_has_left(self, monkeypatch):
        now = [0.0]
        granted = []
        monkeypatch.setattr(report_writer, "_with_deadline",
                            lambda fn, s: (granted.append(s), fn())[1])

        def fake_post(provider, api_key, prompt, timeout):
            now[0] += 70
            raise http_error(503)

        monkeypatch.setattr(report_writer, "_post", fake_post)
        write_report("p", KEYS, accept_json, budget_secs=100, clock=lambda: now[0])
        assert granted[0] == 90          # Ultra's own limit
        assert granted[1] == 30          # only 30s of budget remained


# ── Cool-downs ────────────────────────────────────────────────────────────────

class TestCooldown:
    def test_a_failed_model_is_skipped_for_the_next_request(self, monkeypatch):
        # When the strongest model is overloaded, later visitors should go
        # straight to one that works instead of each waiting out its timeout.
        calls = install(monkeypatch, {ULTRA: http_error(503), GPT_OSS_120: ok('{"i": 9}')})
        write_report("p", KEYS, accept_json)
        calls.clear()
        _, provider = write_report("p", KEYS, accept_json)
        assert provider.model == GPT_OSS_120
        assert calls == [GPT_OSS_120]

    def test_the_cooldown_expires(self, monkeypatch):
        now = [0.0]
        install(monkeypatch, {ULTRA: http_error(503), GPT_OSS_120: ok('{"j": 1}')})
        write_report("p", KEYS, accept_json, clock=lambda: now[0])

        now[0] += report_writer.COOLDOWN_SECS + 1
        calls = install(monkeypatch, {ULTRA: ok('{"k": 2}')})
        _, provider = write_report("p", KEYS, accept_json, clock=lambda: now[0])
        assert provider.model == ULTRA
        assert calls == [ULTRA]

    def test_an_unparseable_answer_does_not_bench_the_model(self, monkeypatch):
        # A bad answer is about that reply, not the endpoint; the model is up.
        install(monkeypatch, {ULTRA: ok("garbage"), GPT_OSS_120: ok('{"l": 3}')})
        write_report("p", KEYS, accept_json)
        calls = install(monkeypatch, {ULTRA: ok('{"m": 4}')})
        write_report("p", KEYS, accept_json)
        assert calls == [ULTRA]


class TestRateLimits:
    # Groq's free tier allows about 8K tokens a minute per model, so on a busy
    # minute a model is briefly full, not down. On the real server one question
    # after a report was refused with "try again in 8s", and that benched the
    # model for ten minutes for everyone.

    @staticmethod
    def _benched_for(monkeypatch, error) -> float:
        now = [100.0]
        install(monkeypatch, {ULTRA: error, GPT_OSS_120: ok('{"a": 1}')})
        write_report("p", KEYS, accept_json, clock=lambda: now[0])
        return report_writer._cooldown_until[ULTRA] - 100.0

    def test_the_wait_comes_from_the_retry_after_header(self, monkeypatch):
        assert self._benched_for(monkeypatch, http_error(429, b"slow down", retry_after="9")) == 9

    @pytest.mark.parametrize("message, wait", [
        (b"Please try again in 8.445s. Need more tokens?", 8.445),
        (b"Please try again in 1m12.5s.", 72.5),
        (b"Please try again in 2h3m4.5s.", report_writer.MAX_RATE_LIMIT_WAIT_SECS),
        (b"Please try again in 350ms.", 1.0),
    ])
    def test_the_wait_comes_from_the_message_when_there_is_no_header(self, monkeypatch, message, wait):
        assert self._benched_for(monkeypatch, http_error(429, message)) == pytest.approx(wait)

    def test_a_rate_limit_that_names_no_wait_is_a_full_cool_down(self, monkeypatch):
        assert self._benched_for(monkeypatch, http_error(429, b"too many")) == report_writer.COOLDOWN_SECS

    def test_a_model_is_back_as_soon_as_its_wait_is_over(self, monkeypatch):
        now = [0.0]
        install(monkeypatch, {ULTRA: http_error(429, retry_after="9"), GPT_OSS_120: ok('{"a": 1}')})
        write_report("p", KEYS, accept_json, clock=lambda: now[0])

        now[0] = 5
        calls = install(monkeypatch, {GPT_OSS_120: ok('{"b": 2}')})
        write_report("p", KEYS, accept_json, clock=lambda: now[0])
        assert calls == [GPT_OSS_120]

        now[0] = 10
        calls = install(monkeypatch, {ULTRA: ok('{"c": 3}')})
        write_report("p", KEYS, accept_json, clock=lambda: now[0])
        assert calls == [ULTRA]


class TestToolCallReplies:
    # gpt-oss sometimes dresses a reply as a call to a tool it does not have,
    # and Groq refuses that with a 400 carrying the text it tried to send.

    def test_a_reply_dressed_as_a_tool_call_is_read_as_the_reply(self, monkeypatch):
        wrapped = '{"name": "assistant", "arguments": {"action": "answer", "answer": "West"}}'
        calls = install(monkeypatch, {ULTRA: tool_use_failed(wrapped), GPT_OSS_120: ok('{"z": 9}')})
        result, provider = write_report("p", KEYS, accept_json)
        assert result == {"action": "answer", "answer": "West"}
        assert provider.model == ULTRA
        assert calls == [ULTRA]

    def test_a_plain_reply_in_the_error_is_read_too(self, monkeypatch):
        install(monkeypatch, {ULTRA: tool_use_failed('{"a": 1}')})
        assert write_report("p", KEYS, accept_json)[0] == {"a": 1}

    def test_a_real_tool_call_moves_on_without_benching_the_model(self, monkeypatch):
        # The model tried to run code. Nothing to read, but the model is up.
        def accept(text):
            value = accept_json(text)
            return value if value and "action" in value else None

        generation = '{"name": "container.exec", "arguments": {"cmd": ["bash"]}}'
        install(monkeypatch, {ULTRA: tool_use_failed(generation), GPT_OSS_120: ok('{"action": "answer"}')})
        _, provider = write_report("p", KEYS, accept)
        assert provider.model == GPT_OSS_120

        calls = install(monkeypatch, {ULTRA: ok('{"action": "answer"}')})
        write_report("p", KEYS, accept)
        assert calls == [ULTRA]

    def test_a_reader_that_breaks_on_the_text_does_not_stop_the_chain(self, monkeypatch):
        def accept(text):
            if text == "bad":
                raise ValueError("cannot read")
            return accept_json(text)

        install(monkeypatch, {ULTRA: tool_use_failed("bad"), GPT_OSS_120: ok('{"a": 1}')})
        assert write_report("p", KEYS, accept)[1].model == GPT_OSS_120

    def test_any_other_400_still_benches_the_model(self, monkeypatch):
        install(monkeypatch, {ULTRA: http_error(400, b'{"error": {"code": "invalid_request"}}'),
                              GPT_OSS_120: ok('{"a": 1}')})
        write_report("p", KEYS, accept_json)
        calls = install(monkeypatch, {GPT_OSS_120: ok('{"b": 2}')})
        write_report("p", KEYS, accept_json)
        assert calls == [GPT_OSS_120]


# ── Accounting ────────────────────────────────────────────────────────────────

class TestAccounting:
    def test_failed_and_successful_attempts_are_both_recorded(self, monkeypatch):
        install(monkeypatch, {ULTRA: http_error(429), GPT_OSS_120: ok('{"n": 5}', 300, 120)})
        tracker = UsageTracker()
        write_report("p", KEYS, accept_json, tracker=tracker)

        assert [c.model for c in tracker.calls] == [ULTRA, GPT_OSS_120]
        failed, succeeded = tracker.calls
        assert failed.ok is False and "429" in (failed.error or "")
        assert succeeded.ok is True
        assert (succeeded.input_tokens, succeeded.output_tokens) == (300, 120)
        assert all(c.phase == "insights" for c in tracker.calls)

    def test_free_openrouter_models_cost_nothing(self, monkeypatch):
        install(monkeypatch, {ULTRA: ok('{"o": 6}', 5000, 3000)})
        tracker = UsageTracker()
        write_report("p", KEYS, accept_json, tracker=tracker)
        assert tracker.calls[0].cost_usd == 0.0


# ── Parsing and the entry point ───────────────────────────────────────────────

class TestParseReport:
    def test_valid_reply_becomes_a_report(self):
        r = insight_agent._parse_report(json.dumps(GOOD_REPORT), None, None)
        assert isinstance(r, LLMReport)
        assert r.reportTitle == "Sales Review"
        assert r.geminiConfidenceScore == 8
        assert r.chartInstructions[0].chartType == "bar"

    def test_markdown_fenced_reply_is_accepted(self):
        text = "```json\n" + json.dumps(GOOD_REPORT) + "\n```"
        assert insight_agent._parse_report(text, None, None) is not None

    def test_garbage_is_rejected_so_the_next_model_gets_a_turn(self):
        assert insight_agent._parse_report("I cannot help with that.", None, None) is None

    def test_json_without_a_narrative_is_not_a_report(self):
        assert insight_agent._parse_report('{"chart_instructions": []}', None, None) is None

    def test_confidence_is_clamped(self):
        r = insight_agent._parse_report(json.dumps({**GOOD_REPORT, "gemini_confidence_score": 42}), None, None)
        assert r.geminiConfidenceScore == 10


class TestGenerateReport:
    def _stub_prompt(self, monkeypatch):
        monkeypatch.setattr(insight_agent, "_build_prompt", lambda *a, **k: "PROMPT")

    def test_report_credits_the_model_that_actually_wrote_it(self, monkeypatch):
        # The PDF prints this. Hardcoded credits once named two models that
        # had stopped running.
        self._stub_prompt(monkeypatch)
        install(monkeypatch, {ULTRA: http_error(503), GPT_OSS_120: ok(json.dumps(GOOD_REPORT))})
        r = insight_agent.generate_report(None, None, False, [], api_keys=KEYS)
        assert r.writerModel == "OpenAI gpt-oss-120b"

    def test_falls_back_with_no_writer_credit_when_all_models_fail(self, monkeypatch):
        self._stub_prompt(monkeypatch)
        sentinel = LLMReport("t", "", "", [], [], "", 5, "", "", "[fallback]")
        monkeypatch.setattr(insight_agent, "_build_fallback_report", lambda s, d: sentinel)
        install(monkeypatch, {m: http_error(503) for m in (ULTRA, GPT_OSS_120, SUPER, QWEN)})
        r = insight_agent.generate_report(None, None, False, [], api_keys=KEYS)
        assert r is sentinel
        assert r.writerModel == ""


# ── Hedging ───────────────────────────────────────────────────────────────────

class TestHedging:
    """The strongest model is slow far more often than it is down."""

    @pytest.fixture(autouse=True)
    def _fast_hedge(self, monkeypatch):
        monkeypatch.setattr(report_writer, "HEDGE_AFTER_SECS", 0.2)
        monkeypatch.setattr(report_writer, "PREFER_STRONGER_GRACE_SECS", 0.5)

    def _providers(self):
        strong = report_writer.ReportProvider("openrouter", "Strong", "u", "strong:free", 100, 10)
        backup = report_writer.ReportProvider("groq", "Backup", "u", "backup", 100, 10)
        return strong, backup

    def test_a_slow_strongest_model_does_not_hold_up_the_report(self, monkeypatch):
        strong, backup = self._providers()

        def fake_post(provider, api_key, prompt, timeout):
            if provider.model == "strong:free":
                time.sleep(5)
            return ok('{"from": "%s"}' % provider.model)

        monkeypatch.setattr(report_writer, "_post", fake_post)
        started = time.monotonic()
        result, provider = write_report("p", KEYS, accept_json, providers=(strong, backup))
        elapsed = time.monotonic() - started

        assert provider.model == "backup"
        # hedge (0.2) + backup (instant) + grace (0.5), never the strong model's 5s
        assert elapsed < 2

    def test_the_strongest_still_wins_if_it_finishes_within_the_grace(self, monkeypatch):
        strong, backup = self._providers()

        def fake_post(provider, api_key, prompt, timeout):
            if provider.model == "strong:free":
                time.sleep(0.4)   # past the hedge, inside the grace window
            return ok('{"from": "%s"}' % provider.model)

        monkeypatch.setattr(report_writer, "_post", fake_post)
        result, provider = write_report("p", KEYS, accept_json, providers=(strong, backup))
        assert provider.model == "strong:free"
        assert result == {"from": "strong:free"}

    def test_the_strongest_is_used_when_every_fallback_fails(self, monkeypatch):
        strong, backup = self._providers()

        def fake_post(provider, api_key, prompt, timeout):
            if provider.model == "strong:free":
                time.sleep(0.8)
                return ok('{"from": "strong"}')
            raise http_error(503)

        monkeypatch.setattr(report_writer, "_post", fake_post)
        result, provider = write_report("p", KEYS, accept_json, providers=(strong, backup))
        assert provider.model == "strong:free"

    def test_a_fast_strongest_model_never_triggers_the_fallbacks(self, monkeypatch):
        strong, backup = self._providers()
        calls = []

        def fake_post(provider, api_key, prompt, timeout):
            calls.append(provider.model)
            return ok('{"ok": 1}')

        monkeypatch.setattr(report_writer, "_post", fake_post)
        write_report("p", KEYS, accept_json, providers=(strong, backup))
        assert calls == ["strong:free"]


class TestSlowStrongestIsBenched:
    def test_answering_after_a_fallback_was_used_benches_the_model(self, monkeypatch):
        # Otherwise a slow-but-alive strongest model would make every visitor
        # wait through the hedge, because each late success clears its cool-down.
        monkeypatch.setattr(report_writer, "HEDGE_AFTER_SECS", 0.1)
        monkeypatch.setattr(report_writer, "PREFER_STRONGER_GRACE_SECS", 0.1)
        strong = report_writer.ReportProvider("openrouter", "Strong", "u", "strong:free", 100, 10)
        backup = report_writer.ReportProvider("groq", "Backup", "u", "backup", 100, 10)

        def fake_post(provider, api_key, prompt, timeout):
            if provider.model == "strong:free":
                time.sleep(0.6)
            return ok('{"x": 1}')

        monkeypatch.setattr(report_writer, "_post", fake_post)
        _, provider = write_report("p", KEYS, accept_json, providers=(strong, backup))
        assert provider.model == "backup"

        time.sleep(0.8)   # let the strong model finish in the background
        assert report_writer._cooling_down("strong:free", time.monotonic())

# ── A report claims only what the file measures ──────────────────────────────

def test_no_cost_column_means_no_margin_claim():
    text = "The high-margin Sandwich beats low\u2011margin items and the High Margin line."
    assert without_unbacked_margins(text, ["store", "revenue"]) == (
        "The high-revenue Sandwich beats low-revenue items and the High-revenue line.")


def test_a_file_with_costs_can_talk_about_margin():
    text = "The high-margin Sandwich."
    assert without_unbacked_margins(text, ["revenue", "unit_cost"]) == text


def test_marginal_is_a_different_word():
    text = "Discounts play a marginal role, with a margin of error."
    assert without_unbacked_margins(text, ["revenue"]) == text


# ── Figures in a report ───────────────────────────────────────────────────────

def _report_from(text):
    reply = json.loads(text)
    return LLMReport(reply["report_title"], "", reply["executive_summary"], reply["insights"],
                     [], "", 5, "", "", text)


class TestFigureCheck:
    GOOD = {"report_title": "Sales", "executive_summary": "Toronto posted 412 roles.",
            "insights": [{"title": "Lead", "body": "Toronto leads."}]}
    INVENTED = {**GOOD, "executive_summary": "Toronto posted 98,765 roles."}
    SWAPPED = {**GOOD, "executive_summary": "Calgary posted 412 roles."}

    @pytest.fixture
    def run(self, monkeypatch):
        """generate_report with a scripted model, returning the report and every prompt."""
        def go(*replies):
            prompts, left = [], list(replies)

            def fake(prompt, keys, accept, tracker=None, **kwargs):
                prompts.append(prompt)
                return (accept(json.dumps(left.pop(0))), REPORT_PROVIDERS[0]) if left else (None, None)

            monkeypatch.setattr(insight_agent, "write_report", fake)
            monkeypatch.setattr(insight_agent, "_build_prompt", lambda *a, **k: "Toronto 412 Calgary 188")
            monkeypatch.setattr(insight_agent, "build_digest", lambda *a: {
                "categories": {"city": {"top": {"Toronto": 412, "Calgary": 188}}}})
            monkeypatch.setattr(insight_agent, "_parse_report", lambda text, *a: _report_from(text))
            return insight_agent.generate_report(None, None, False, [], api_keys={"groq": "k"}), prompts
        return go

    def test_a_clean_report_costs_one_call(self, run):
        report, prompts = run(self.GOOD)
        assert len(prompts) == 1 and "could not be matched" not in report.dataQualitySection

    def test_an_invented_figure_gets_one_correction(self, run):
        report, prompts = run(self.INVENTED, self.GOOD)
        assert len(prompts) == 2 and "98,765" in prompts[1]
        assert report.executiveSummary == self.GOOD["executive_summary"]

    def test_a_figure_on_the_wrong_group_gets_one_correction(self, run):
        report, prompts = run(self.SWAPPED, self.GOOD)
        assert len(prompts) == 2 and "412 (Calgary)" in prompts[1]
        assert "could not be matched" not in report.dataQualitySection

    def test_a_figure_that_stays_wrong_is_named_in_the_report(self, run):
        report, prompts = run(self.INVENTED, self.INVENTED)
        assert len(prompts) == 2
        assert "could not be matched to the data: 98,765" in report.dataQualitySection

    def test_no_second_model_keeps_the_first_report_and_says_so(self, run):
        report, _ = run(self.INVENTED)
        assert report.executiveSummary == self.INVENTED["executive_summary"]
        assert "98,765" in report.dataQualitySection
