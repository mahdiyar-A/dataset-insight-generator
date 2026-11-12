"""
Are the models DIG depends on still there, and did they do the work?

Every model DIG uses is a free endpoint somebody else runs. They are withdrawn
without a word to us: Groq retired the Qwen model before the one in use on
2026-09-14, and two Llama models a month earlier. When that happens the chain
does what it was built to do and moves to the next model, so nothing breaks,
and nothing says so either. The chain gets one model shorter each time, until
a report is the stats-only fallback and the first to notice is a visitor.

This module answers four questions without spending anything:

  * Is every model id in the chains still on its provider's list? Both
    providers publish one, and reading it is not a model call.
  * Is one about to go? OpenRouter states an expiry date on a model's entry.
  * How much of today's free allowance is left? OpenRouter reports it for the key.
  * How did the last day go? report_writer keeps count of the reports, answers
    and domain checks that had to be done without a model.

check() returns the whole picture and, in "problems", the things a person
should hear about, written to be read by someone who does not know what a
model id is. The backend asks once a day and emails them (ModelWatch.cs). This
module never raises and never sends anything itself.
"""

from __future__ import annotations

import json
import threading
import time
import urllib.request
from datetime import date, datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from ai_engine.llm.groq_client import DOMAIN_PROVIDERS
from ai_engine.llm.harness import BRIEF_PROVIDERS, CHAT_PROVIDERS
from ai_engine.llm.report_writer import REPORT_PROVIDERS, ReportProvider, health_snapshot
from ai_engine.llm.user_requests import PLAN_PROVIDERS

# What each chain is for, in words for the email. Reports first: they are the product.
CHAINS: Tuple[Tuple[str, Tuple[ReportProvider, ...]], ...] = (
    ("reports", REPORT_PROVIDERS),
    ("answering questions", CHAT_PROVIDERS),
    ("recognising what a file is about", DOMAIN_PROVIDERS),
    ("working out what a report was asked to cover", PLAN_PROVIDERS),
    ("reading a description of the report wanted", BRIEF_PROVIDERS),
)

PROVIDER_NAMES = {"openrouter": "OpenRouter", "groq": "Groq"}

# Where each provider lists the models it serves. Reading these is free.
LIST_URLS = {
    "openrouter": "https://openrouter.ai/api/v1/models",
    "groq": "https://api.groq.com/openai/v1/models",
}
# What is left of the key's free requests today (OpenRouter only).
KEY_URL = "https://openrouter.ai/api/v1/key"

# A withdrawal date this close is worth an email; further off it is only shown.
EXPIRY_WARN_DAYS = 14

# With this few working models a chain is one bad day from having none.
THIN_CHAIN = 1

# Questions fail for a minute at a time on the free tier's per-minute limits,
# which is not an outage. Only a pattern is worth an email.
QUESTION_FAILURES_WORTH_SAYING = 5

CACHE_SECS = 600

Fetch = Callable[[str, str], Any]


def _get_json(url: str, api_key: str = "", timeout: float = 20) -> Any:
    headers = {
        # Both providers sit behind Cloudflare, which refuses urllib's own User-Agent.
        "User-Agent": "Mozilla/5.0 (compatible; DIG-AI/1.0)",
        "Accept": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ─────────────────────────────────────────────────────────────────────────────
# What DIG uses
# ─────────────────────────────────────────────────────────────────────────────

def configured_models() -> List[Dict[str, Any]]:
    """Every model in any chain, once, with what it is used for."""
    found: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for purpose, providers in CHAINS:
        for p in providers:
            entry = found.setdefault((p.provider, p.model), {
                "provider": p.provider, "model": p.model, "name": p.display_name, "usedFor": []})
            if purpose not in entry["usedFor"]:
                entry["usedFor"].append(purpose)
    return list(found.values())


# ─────────────────────────────────────────────────────────────────────────────
# What the providers say
# ─────────────────────────────────────────────────────────────────────────────

def listed_models(provider: str, api_key: str, fetch: Fetch = _get_json) -> Optional[Dict[str, Dict[str, Any]]]:
    """The provider's models by id, or None when its list could not be read."""
    url = LIST_URLS.get(provider)
    if not url:
        return None
    try:
        data = fetch(url, api_key).get("data")
        if not isinstance(data, list):
            return None
        return {str(m["id"]): m for m in data if isinstance(m, dict) and m.get("id")}
    except Exception as e:
        print(f"[ModelWatch] could not read {provider}'s model list: {type(e).__name__}: {e}", flush=True)
        return None


def free_allowance(api_key: str, fetch: Fetch = _get_json) -> Optional[Dict[str, int]]:
    """Today's free requests on the OpenRouter key: {"used", "limit", "remaining"}, or None."""
    if not api_key:
        return None
    try:
        daily = (fetch(KEY_URL, api_key).get("data") or {}).get("free_model_daily_requests") or {}
        return {k: int(daily[k]) for k in ("used", "limit", "remaining")}
    except Exception as e:
        print(f"[ModelWatch] could not read the OpenRouter allowance: {type(e).__name__}: {e}", flush=True)
        return None


def _expiry(entry: Dict[str, Any]) -> Optional[date]:
    raw = entry.get("expiration_date")
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except ValueError:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# The check
# ─────────────────────────────────────────────────────────────────────────────

def _used_for(model: Dict[str, Any]) -> str:
    uses = model["usedFor"]
    return uses[0] if len(uses) == 1 else ", ".join(uses[:-1]) + " and " + uses[-1]


def _count(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def check(
    api_keys: Dict[str, str],
    fetch: Fetch = _get_json,
    today: Optional[date] = None,
    health: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    The state of every model DIG uses. Never raises.

    {"checkedAt", "models": [...], "chains": [...], "allowance", "health",
     "problems": [sentence, ...], "notes": [sentence, ...]}

    A model's status is one of:
      ok        on the provider's list
      expiring  on it, with a withdrawal date within EXPIRY_WARN_DAYS
      missing   not on it any more
      no_key    its provider has no API key on this server
      unknown   the provider's list could not be read, so nothing is claimed
    """
    today = today or datetime.now(timezone.utc).date()
    health = health_snapshot() if health is None else health
    problems: List[str] = []
    notes: List[str] = []

    lists: Dict[str, Optional[Dict[str, Dict[str, Any]]]] = {}
    models = configured_models()
    for provider in sorted({m["provider"] for m in models}):
        name = PROVIDER_NAMES.get(provider, provider)
        if not api_keys.get(provider):
            unusable = sum(1 for m in models if m["provider"] == provider)
            problems.append(f"No {name} key is set on the server, so {_count(unusable, 'model', 'models')} "
                            f"cannot be used.")
            continue
        lists[provider] = listed_models(provider, api_keys[provider], fetch)
        if lists[provider] is None:
            notes.append(f"{name}'s list of models could not be read, so its models were not checked this time.")

    for m in models:
        provider, name = m["provider"], PROVIDER_NAMES.get(m["provider"], m["provider"])
        if not api_keys.get(provider):
            m["status"] = "no_key"
            continue
        listing = lists.get(provider)
        if listing is None:
            m["status"] = "unknown"
            continue
        entry = listing.get(m["model"])
        if entry is None or entry.get("active") is False:
            m["status"] = "missing"
            problems.append(f"{m['name']} is no longer offered by {name}. DIG uses it for {_used_for(m)}.")
            continue
        m["status"] = "ok"
        expires = _expiry(entry)
        if expires is not None:
            m["expires"] = expires.isoformat()
            days = (expires - today).days
            if days <= EXPIRY_WARN_DAYS:
                m["status"] = "expiring"
                when = "today" if days <= 0 else f"in {_count(days, 'day', 'days')}"
                problems.append(f"{m['name']} will be withdrawn by {name} on {expires.isoformat()} ({when}). "
                                f"DIG uses it for {_used_for(m)}.")

    # A model whose list could not be read counts as working: an unreadable
    # list is not evidence that anything is gone.
    working = {(m["provider"], m["model"]) for m in models if m["status"] in ("ok", "expiring", "unknown")}
    chains = []
    for purpose, providers in CHAINS:
        left = sum(1 for p in providers if (p.provider, p.model) in working)
        chains.append({"purpose": purpose, "models": len(providers), "working": left})
        if left == 0:
            problems.append(f"No working model is left for {purpose}."
                            + (" Every report will be the plain version written without AI."
                               if purpose == "reports" else ""))
        elif left <= THIN_CHAIN and len(providers) > THIN_CHAIN:
            problems.append(f"Only {_count(left, 'working model is', 'working models are')} left for {purpose}, "
                            f"out of {len(providers)}.")

    allowance = free_allowance(api_keys.get("openrouter", ""), fetch)
    if allowance and allowance["limit"] > 0 and allowance["remaining"] <= 0:
        problems.append(f"Today's free OpenRouter requests are used up ({allowance['used']} of "
                        f"{allowance['limit']}). Its models are out until midnight UTC.")

    outcomes = health.get("outcomes") or {}
    hours = health.get("windowHours", 24)
    reports = outcomes.get("report") or {}
    if reports.get("failed"):
        problems.append(f"{_count(reports['failed'], 'report', 'reports')} out of {reports['total']} in the last "
                        f"{hours:g} hours had to be written without AI, because no model answered.")
    domains = outcomes.get("domain") or {}
    if domains.get("failed"):
        problems.append(f"For {_count(domains['failed'], 'file', 'files')} out of {domains['total']} in the last "
                        f"{hours:g} hours, no model could say what the data was about, so the analysis was generic.")
    questions = outcomes.get("question") or {}
    if questions.get("failed", 0) >= QUESTION_FAILURES_WORTH_SAYING:
        problems.append(f"{questions['failed']} questions out of {questions['total']} in the last {hours:g} hours "
                        f"got \"try again in a minute\" because no model answered.")

    return {
        "checkedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "models": models,
        "chains": chains,
        "allowance": {"openrouter": allowance} if allowance else {},
        "health": health,
        "problems": problems,
        "notes": notes,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Asked for often, fetched seldom
# ─────────────────────────────────────────────────────────────────────────────

_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()


def cached_check(api_keys: Dict[str, str], max_age: float = CACHE_SECS,
                 clock: Callable[[], float] = time.monotonic) -> Dict[str, Any]:
    """check(), at most once every max_age seconds, so a page polling this costs the providers nothing."""
    with _cache_lock:
        if _cache and clock() - _cache["at"] < max_age:
            return _cache["value"]
    value = check(api_keys)
    with _cache_lock:
        _cache.update(at=clock(), value=value)
    return value


def forget_cache() -> None:
    with _cache_lock:
        _cache.clear()
