"""
Report-writing models, strongest first, falling back to weaker ones.

Phase 5 used to depend on a single paid provider. When its prepaid credit ran
out, every analysis silently fell back to the stats-only report, and nothing in
the product said so. Free endpoints for open-weight models are strong enough
for this job — turning already-computed statistics into prose — but each one
is individually unreliable: they hit daily quotas, get overloaded, and get
withdrawn without notice. So several are tried, strongest first, and the first
answer that parses wins.

The chain (all free):

  1. NVIDIA Nemotron 3 Ultra (550B), via OpenRouter — the strongest free model
     that will serve an application. Also the flakiest: in testing it answered,
     then returned "overloaded", then held a request open for 14 minutes.
  2. OpenAI gpt-oss-120b, via Groq — comparable to #3 on paper, but proven on
     this exact prompt (a full report in ~4s) and the most dependable endpoint.
  3. NVIDIA Nemotron 3.5 Super, via OpenRouter.
  4. Qwen 3.8 27B, via Groq — a separate per-model quota pool on the same key.
  5. OpenAI gpt-oss-20b, via Groq — the weakest, and the last line before the
     stats-only fallback.

Ruled out after testing: Thinking Machines Inkling (free tier is restricted
to "agentic harnesses" and returns 403 to applications), and Google Gemma 4
(served from Google AI Studio's free tier, which may use inputs for training,
and was failing upstream anyway).

Three protections, each from something observed:

  - A hard wall-clock deadline per call. OpenRouter keeps a slow connection
    alive with filler bytes, so a socket timeout never fires on it. The call
    runs on a worker thread that is simply abandoned when the deadline passes.
  - An overall budget for the whole chain, so a run of slow models can never
    outlast the backend's own timeout on the analysis.
  - A cool-down. A model that just failed is skipped for a while, so that when
    the strongest one is overloaded, every visitor is not made to wait out its
    timeout before reaching one that works.
  - Hedging. If the strongest model is slow, the next one starts in parallel
    after 20s instead of after the strongest model's full timeout, and the
    strongest still wins if it finishes shortly after. A strongest model that
    only answers after a fallback has already been used is benched like a
    failed one: too slow to help is as good as down.

Every provider speaks the OpenAI chat-completions format, so one code path
serves them all. What they receive is the prompt built by insight_agent:
computed statistics and category labels, never raw rows. The privacy policy
names each provider below; keep the two in step.
"""

from __future__ import annotations

import json
import queue
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional, Tuple, TypeVar

T = TypeVar("T")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# The whole chain gets this long. The backend waits 360s for an entire analysis,
# and the other phases take ~30-40s, so this leaves a wide margin.
DEFAULT_BUDGET_SECS = 180

# Below this much remaining budget a report cannot realistically be written,
# so starting another model only delays the fallback.
MIN_USEFUL_SECS = 15

# Hedging. If the strongest model has not answered after HEDGE_AFTER_SECS, the
# rest of the chain starts in parallel. If a fallback then answers first, the
# strongest still gets PREFER_STRONGER_GRACE_SECS to finish and win. Worst
# case for an overloaded strongest model drops from its full 90s timeout to
# about 12s + the fallback's own time + 5s. Measured on a 30,000-row file
# with 20s/10s: 34s in the writer, of which 30s was waiting; hence these.
HEDGE_AFTER_SECS = 12
PREFER_STRONGER_GRACE_SECS = 5

# How long a model sits out after failing. Long enough to stop every request
# queueing behind an overloaded endpoint; short enough that a recovered model
# is back in use within minutes.
COOLDOWN_SECS = 600


@dataclass(frozen=True)
class ReportProvider:
    provider: str          # telemetry label, and which API key to use
    display_name: str      # printed in the PDF — the model that actually wrote it
    url: str
    model: str
    max_tokens: int
    timeout_secs: int      # hard wall-clock limit for one call
    extra: Dict[str, Any] = field(default_factory=dict)


# Groq's free tier counts prompt + max_tokens against ~8K tokens per minute per
# model. The report prompt is ~3.3K tokens, so its models ask for at most 4000.
# Low reasoning effort keeps gpt-oss's hidden reasoning from eating the budget
# the JSON report itself needs.
REPORT_PROVIDERS: Tuple[ReportProvider, ...] = (
    ReportProvider("openrouter", "NVIDIA Nemotron 3 Ultra", OPENROUTER_URL,
                   "nvidia/nemotron-3-ultra-550b-a55b:free", 16384, 90),
    ReportProvider("groq", "OpenAI gpt-oss-120b", GROQ_URL,
                   "openai/gpt-oss-120b", 4000, 45, {"reasoning_effort": "low"}),
    ReportProvider("openrouter", "NVIDIA Nemotron 3.5 Super", OPENROUTER_URL,
                   "nvidia/nemotron-3.5-super-vl:free", 16384, 60),
    ReportProvider("groq", "Qwen 3.8 27B", GROQ_URL,
                   "qwen/qwen3.8-27b", 4000, 45),
    ReportProvider("groq", "OpenAI gpt-oss-20b", GROQ_URL,
                   "openai/gpt-oss-20b", 4000, 40, {"reasoning_effort": "low"}),
)


# ── Cool-down state ───────────────────────────────────────────────────────────
# Process-wide on purpose: the AI service is one long-lived process, and the
# point is that one visitor's failed attempt spares the next visitor the wait.
_cooldown_until: Dict[str, float] = {}
_cooldown_lock = threading.Lock()


def _cooling_down(model: str, now: float) -> bool:
    with _cooldown_lock:
        return _cooldown_until.get(model, 0.0) > now


def _set_cooldown(model: str, until: Optional[float]) -> None:
    with _cooldown_lock:
        if until is None:
            _cooldown_until.pop(model, None)
        else:
            _cooldown_until[model] = until


def reset_cooldowns() -> None:
    """Forget every cool-down. For tests, and for operators after an outage."""
    with _cooldown_lock:
        _cooldown_until.clear()


# ── One call ──────────────────────────────────────────────────────────────────

def _post(provider: ReportProvider, api_key: str, prompt: str, timeout: float) -> Dict[str, Any]:
    payload = {
        "model": provider.model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": provider.max_tokens,
        **provider.extra,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        # Both providers sit behind Cloudflare, which rejects urllib's default
        # User-Agent with a 403 before the request reaches the API.
        "User-Agent": "Mozilla/5.0 (compatible; DIG-AI/1.0)",
        "Accept": "application/json",
    }
    if provider.provider == "openrouter":
        # Optional attribution headers OpenRouter asks integrators to send.
        headers["HTTP-Referer"] = "https://www.datainsightgen.com"
        headers["X-Title"] = "DIG - Dataset Insight Generator"

    req = urllib.request.Request(
        provider.url, data=json.dumps(payload).encode("utf-8"),
        headers=headers, method="POST",
    )
    # This timeout only bounds silence between bytes. The real limit is the
    # wall-clock deadline in _with_deadline, because OpenRouter fills silence.
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _with_deadline(fn: Callable[[], T], seconds: float) -> T:
    """
    Run fn, but give up after `seconds` of wall-clock time.

    The worker thread is a daemon and is abandoned, not killed: Python cannot
    kill a thread blocked in a socket read. It ends when the server finally
    answers or the socket times out, and never holds the analysis up meanwhile.
    """
    box: Dict[str, Any] = {}

    def run() -> None:
        try:
            box["value"] = fn()
        except BaseException as e:  # re-raised on the caller's thread
            box["error"] = e

    worker = threading.Thread(target=run, daemon=True, name="report-writer-call")
    worker.start()
    worker.join(seconds)
    if worker.is_alive():
        raise TimeoutError(f"no answer within {seconds:.0f}s")
    if "error" in box:
        raise box["error"]
    return box["value"]


def _content_of(raw: Dict[str, Any]) -> str:
    """The message text, or raise with the reason there isn't one."""
    # OpenRouter can answer HTTP 200 with an error body when the upstream
    # provider fails, so a 200 alone does not mean there is a report.
    if raw.get("error"):
        err = raw["error"]
        raise RuntimeError(err.get("message", str(err)) if isinstance(err, dict) else str(err))
    choices = raw.get("choices") or []
    if not choices:
        raise RuntimeError("response had no choices")
    content = (choices[0].get("message") or {}).get("content") or ""
    if not content.strip():
        # Reasoning models can spend the whole token budget thinking and
        # return an empty answer.
        reason = choices[0].get("finish_reason", "unknown")
        raise RuntimeError(f"empty content (finish_reason={reason})")
    return content


# ── The chain ─────────────────────────────────────────────────────────────────

def _attempt(
    p: ReportProvider,
    key: str,
    prompt: str,
    accept: Callable[[str], Optional[T]],
    limit: float,
    tracker,
    clock: Callable[[], float],
) -> Optional[T]:
    """One call to one provider: deadline, parsing, accounting and cool-down."""
    print(f"[Report] trying {p.display_name} ({p.model}, up to {limit:.0f}s)...", flush=True)
    started = clock()
    tin = tout = 0
    error: Optional[str] = None
    result: Optional[T] = None
    try:
        raw = _with_deadline(lambda: _post(p, key, prompt, limit), limit)
        usage = raw.get("usage") or {}
        tin = int(usage.get("prompt_tokens", 0) or 0)
        tout = int(usage.get("completion_tokens", 0) or 0)
        result = accept(_content_of(raw))
        if result is None:
            error = "reply could not be parsed into a report"
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        error = f"HTTP {e.code}: {body[:160]}"
    except Exception as e:  # deadline, connection errors, malformed bodies
        error = f"{type(e).__name__}: {e}"

    duration_ms = int((clock() - started) * 1000)
    if tracker is not None:
        try:
            tracker.record(
                provider=p.provider, model=p.model, phase="insights",
                input_tokens=tin, output_tokens=tout, duration_ms=duration_ms,
                ok=result is not None, error=error,
            )
        except Exception as e:  # accounting must never break an analysis
            print(f"[Usage] report accounting failed (ignored): {e}", flush=True)

    if result is not None:
        _set_cooldown(p.model, None)
        print(f"[Report] written by {p.display_name} in {duration_ms / 1000:.1f}s", flush=True)
        return result

    # An unparseable reply is a property of that answer, not of the endpoint,
    # so it does not bench the model for everyone else.
    if error != "reply could not be parsed into a report":
        _set_cooldown(p.model, clock() + COOLDOWN_SECS)
    print(f"[Report] {p.display_name} failed: {error}", flush=True)
    return None


def _run_chain(
    providers: Tuple[Tuple[ReportProvider, str], ...],
    prompt: str,
    accept: Callable[[str], Optional[T]],
    tracker,
    deadline: float,
    budget_secs: float,
    clock: Callable[[], float],
) -> Tuple[Optional[T], Optional[ReportProvider]]:
    """Try (provider, key) pairs in order until one produces a report."""
    for p, key in providers:
        remaining = deadline - clock()
        if remaining < MIN_USEFUL_SECS:
            print(f"[Report] budget spent ({budget_secs:.0f}s) — stopping before {p.display_name}", flush=True)
            break
        result = _attempt(p, key, prompt, accept, min(p.timeout_secs, remaining), tracker, clock)
        if result is not None:
            return result, p
    return None, None


def write_report(
    prompt: str,
    api_keys: Dict[str, str],
    accept: Callable[[str], Optional[T]],
    tracker=None,
    providers: Tuple[ReportProvider, ...] = REPORT_PROVIDERS,
    budget_secs: float = DEFAULT_BUDGET_SECS,
    clock: Callable[[], float] = time.monotonic,
) -> Tuple[Optional[T], Optional[ReportProvider]]:
    """
    Get a report from the strongest available model, falling back to weaker
    ones, within `budget_secs`.

    `accept` turns the model's text into the finished report, or returns None
    when it can't — truncated JSON, an unparseable reply. A provider that
    answers with something unusable is treated exactly like one that is down,
    so the next one gets a chance rather than the caller falling straight back
    to the stats-only report.

    Skipped without a call: providers with no API key, and providers cooling
    down after a recent failure. The first remaining provider is hedged (see
    HEDGE_AFTER_SECS). Never raises: returns (None, None) when every provider
    fails or the budget runs out, and the caller decides what to do.
    """
    deadline = clock() + budget_secs

    available = []
    for p in providers:
        key = api_keys.get(p.provider, "")
        if not key:
            print(f"[Report] skip {p.display_name}: no {p.provider} key", flush=True)
        elif _cooling_down(p.model, clock()):
            print(f"[Report] skip {p.display_name}: cooling down after a recent failure", flush=True)
        else:
            available.append((p, key))

    if not available:
        print("[Report] no model available", flush=True)
        return None, None

    first, first_key = available[0]
    rest = tuple(available[1:])
    if not rest:
        return _run_chain(tuple(available), prompt, accept, tracker, deadline, budget_secs, clock)

    # ── Hedged start ──────────────────────────────────────────────────────
    outcomes: "queue.Queue[Tuple[str, Optional[T], Optional[ReportProvider]]]" = queue.Queue()
    first_limit = min(first.timeout_secs, deadline - clock())
    superseded = threading.Event()

    def run_first() -> None:
        result = _attempt(first, first_key, prompt, accept, first_limit, tracker, clock)
        if superseded.is_set():
            # A fallback was already used. Answering late doesn't help a
            # visitor, so it sits out like a failure: otherwise a slow-but-alive
            # strongest model would make everyone wait through the hedge.
            _set_cooldown(first.model, clock() + COOLDOWN_SECS)
        outcomes.put(("first", result, first))

    threading.Thread(target=run_first, daemon=True, name="report-writer-first").start()

    try:
        _, result, _ = outcomes.get(timeout=min(HEDGE_AFTER_SECS, first_limit))
        if result is not None:
            return result, first
        # The strongest failed quickly: carry on down the chain as normal.
        return _run_chain(rest, prompt, accept, tracker, deadline, budget_secs, clock)
    except queue.Empty:
        pass

    print(f"[Report] {first.display_name} is slow — starting fallbacks in parallel", flush=True)

    def run_rest() -> None:
        result, provider = _run_chain(rest, prompt, accept, tracker, deadline, budget_secs, clock)
        outcomes.put(("rest", result, provider))

    threading.Thread(target=run_rest, daemon=True, name="report-writer-rest").start()

    first_done = rest_done = False
    while not (first_done and rest_done):
        remaining = deadline - clock()
        if remaining <= 0:
            break
        try:
            who, result, provider = outcomes.get(timeout=remaining)
        except queue.Empty:
            break

        if who == "first":
            first_done = True
            if result is not None:
                return result, first
            continue

        rest_done = True
        if result is None:
            continue   # wait for the strongest, if it is still running
        if not first_done:
            # A fallback answered. The strongest still gets a short grace.
            try:
                who2, result2, _ = outcomes.get(timeout=min(PREFER_STRONGER_GRACE_SECS, max(0.0, deadline - clock())))
                if who2 == "first" and result2 is not None:
                    return result2, first
            except queue.Empty:
                pass
        superseded.set()
        return result, provider

    print("[Report] no model produced a report", flush=True)
    return None, None
