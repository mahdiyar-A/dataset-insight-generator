"""
Token and cost accounting for LLM calls.

Why this exists
---------------
DIG charges $9.99/month for unlimited analyses, and every analysis makes several
model calls. Nobody could answer "what does one analysis cost us?" — the token
counts came back in every API response and were discarded. Without this you
cannot tell a profitable Pro user from one running fifty deep analyses a month
at a loss, and you cannot notice that a prompt edit added 30% to spend.

Design notes
------------
Prices are per million tokens and are hardcoded with a date, because provider
pricing changes and a silently stale number is worse than an obviously stale
one. Unknown models fall back to zero cost rather than guessing — a zero in the
dashboard is visibly wrong, whereas a plausible-looking wrong number is not.

Accumulation is per-request via an explicit UsageTracker passed down the
pipeline. A module-level global would be wrong: FastAPI serves requests
concurrently and two analyses running at once would pool their costs.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional


# Prices in USD per 1,000,000 tokens. Verified 2026-08.
# Update MODEL_PRICING_UPDATED whenever a figure changes so a stale table is
# obvious in the admin dashboard rather than quietly wrong.
MODEL_PRICING_UPDATED = "2026-08"

MODEL_PRICING: Dict[str, Dict[str, float]] = {
    # Groq — domain classification and the insight judge
    "llama-3.3-70b-versatile":  {"input": 0.59, "output": 0.79},
    "llama-3.1-8b-instant":     {"input": 0.05, "output": 0.08},
    "llama3-70b-8192":          {"input": 0.59, "output": 0.79},

    # Google — insight generation
    "gemini-2.0-flash":         {"input": 0.10, "output": 0.40},
    "gemini-2.0-flash-exp":     {"input": 0.10, "output": 0.40},
    "gemini-1.5-flash":         {"input": 0.075, "output": 0.30},
    "gemini-1.5-pro":           {"input": 1.25, "output": 5.00},
    "gemini-2.5-flash":         {"input": 0.30, "output": 2.50},
}


@dataclass
class LlmCall:
    """One model invocation."""
    provider: str            # "groq" | "gemini"
    model: str
    phase: str               # "domain" | "insights" | "judge" — where in the pipeline
    input_tokens: int
    output_tokens: int
    duration_ms: int
    cost_usd: float
    ok: bool = True
    error: Optional[str] = None

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


def price_of(model: str, input_tokens: int, output_tokens: int) -> float:
    """
    Cost in USD for one call.

    Returns 0.0 for an unrecognised model. That is deliberate: a visible zero
    prompts someone to add the model to the table, whereas a guessed price
    quietly corrupts every aggregate built on top of it.
    """
    pricing = MODEL_PRICING.get(model)
    if pricing is None:
        # Try a prefix match — providers append version suffixes over time
        # (gemini-2.0-flash-001 and similar).
        for known, p in MODEL_PRICING.items():
            if model.startswith(known):
                pricing = p
                break

    if pricing is None:
        return 0.0

    return round(
        (input_tokens / 1_000_000) * pricing["input"]
        + (output_tokens / 1_000_000) * pricing["output"],
        6,
    )


@dataclass
class UsageTracker:
    """
    Accumulates every model call made while serving one analysis.

    Created per request and threaded through the pipeline. Never a global —
    FastAPI serves concurrently and two analyses would pool their costs.
    """

    calls: List[LlmCall] = field(default_factory=list)
    started_at: float = field(default_factory=time.monotonic)

    def record(
        self,
        provider: str,
        model: str,
        phase: str,
        input_tokens: int,
        output_tokens: int,
        duration_ms: int,
        ok: bool = True,
        error: Optional[str] = None,
    ) -> LlmCall:
        # Clamp before pricing, not after. Pricing the raw arguments let a
        # malformed provider response produce a negative cost, which then
        # silently offset real spend in every aggregate built on top of it.
        tin  = max(0, int(input_tokens or 0))
        tout = max(0, int(output_tokens or 0))

        call = LlmCall(
            provider=provider,
            model=model,
            phase=phase,
            input_tokens=tin,
            output_tokens=tout,
            duration_ms=max(0, int(duration_ms or 0)),
            cost_usd=price_of(model, tin, tout),
            ok=ok,
            error=error,
        )
        self.calls.append(call)
        return call

    # ── Aggregates ───────────────────────────────────────────────────────────

    @property
    def total_cost_usd(self) -> float:
        return round(sum(c.cost_usd for c in self.calls), 6)

    @property
    def total_input_tokens(self) -> int:
        return sum(c.input_tokens for c in self.calls)

    @property
    def total_output_tokens(self) -> int:
        return sum(c.output_tokens for c in self.calls)

    @property
    def call_count(self) -> int:
        return len(self.calls)

    @property
    def failed_call_count(self) -> int:
        return sum(1 for c in self.calls if not c.ok)

    def cost_by_phase(self) -> Dict[str, float]:
        """
        Spend per pipeline phase. This is the breakdown that tells you which
        prompt to attack when cost per analysis rises.
        """
        out: Dict[str, float] = {}
        for c in self.calls:
            out[c.phase] = round(out.get(c.phase, 0.0) + c.cost_usd, 6)
        return out

    def to_dict(self) -> Dict[str, Any]:
        """Serialised for the /analyze response, to be persisted by the backend."""
        return {
            "total_cost_usd":      self.total_cost_usd,
            "total_input_tokens":  self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "call_count":          self.call_count,
            "failed_call_count":   self.failed_call_count,
            "duration_ms":         int((time.monotonic() - self.started_at) * 1000),
            "cost_by_phase":       self.cost_by_phase(),
            "pricing_updated":     MODEL_PRICING_UPDATED,
            "calls":               [asdict(c) for c in self.calls],
        }

    def summary_line(self) -> str:
        """One line for the server log — the fastest way to spot a cost spike."""
        return (
            f"[Usage] {self.call_count} calls | "
            f"{self.total_input_tokens:,} in / {self.total_output_tokens:,} out | "
            f"${self.total_cost_usd:.4f} | "
            f"by phase: {self.cost_by_phase()}"
        )


# ── Response parsing ─────────────────────────────────────────────────────────
# Each provider reports usage under a different shape. Parsing lives here so the
# clients stay focused on prompting.


def tokens_from_groq(raw: Dict[str, Any]) -> tuple[int, int]:
    """Groq follows the OpenAI shape: usage.prompt_tokens / completion_tokens."""
    usage = raw.get("usage") or {}
    return int(usage.get("prompt_tokens", 0)), int(usage.get("completion_tokens", 0))


def tokens_from_gemini(raw: Dict[str, Any]) -> tuple[int, int]:
    """
    Gemini reports usageMetadata.promptTokenCount / candidatesTokenCount.

    totalTokenCount also counts thinking tokens on some models, so it can exceed
    prompt + candidates. Summing the two components rather than reading the
    total keeps input and output separable, which matters because they are
    priced differently.
    """
    usage = raw.get("usageMetadata") or {}
    return (
        int(usage.get("promptTokenCount", 0)),
        int(usage.get("candidatesTokenCount", 0)),
    )
