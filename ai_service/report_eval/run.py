"""
Write a report for every case and score it.

    python -m report_eval.run                       # no model calls: checks the cases and the scorer
    python -m report_eval.run --live                # one real report per case (5 to 10 model calls)
    python -m report_eval.run --live --cases rising_waits --variant plan_first

Without --live every report is the stats-only fallback, which costs nothing
and shows whether DIG's statistics found each planted truth. With --live the
models DIG uses write the reports, from the keys in ai_service/.env. Calls
are spaced out so the free per-minute limits are not hit.

The scorecard is printed and saved to report_eval/results/ (not committed).
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from report_eval.cases import Case, by_name
from report_eval.score import score_report, summary

RESULTS = Path(__file__).with_name("results")
PAUSE_SECS = 20     # between live cases: the free tiers count tokens per minute


def _keys() -> Dict[str, str]:
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    except ImportError:
        pass
    return {"openrouter": os.getenv("OPENROUTER_API_KEY", ""), "groq": os.getenv("GROQ_API_KEY", "")}


def run_case(case: Case, live: bool, variant: Optional[str], keys: Dict[str, str],
             insights: int = 3) -> Dict[str, Any]:
    from ai_engine.core.stats_analyzer import build_stats_summary
    from ai_engine.llm import insight_agent, prompt_variants
    from ai_engine.llm.evidence import catalog
    from ai_engine.llm.stats_digest import build_digest
    from ai_engine.models.models import DomainResult
    from ai_engine.quality.quality_checker import check_data_quality

    df = case.build()
    domain = DomainResult(
        domain=case.domain, confidence=0.9, is_analyzable=True,
        analysis_focus=[], key_questions=[],
        column_decisions={"key": case.key, "keep": [c for c in df.columns if c not in case.key]},
        attribute_interpretations=case.interpretations, source="rules")
    stats = build_stats_summary(df, check_data_quality(df), domain=case.domain, key_columns=case.key)
    known = catalog(build_digest(stats, domain))
    found = bool(case.found(known))
    settings = {"insights_count": insights, "language": "en", "depth": "standard", **case.settings}

    started = time.monotonic()
    report = insight_agent.generate_report(
        stats, domain, False, [], keys if live else {}, prompt_variant=variant, **settings)
    took = time.monotonic() - started

    prompt = prompt_variants.apply(insight_agent._build_prompt(stats, domain, False, [], **settings), variant)
    planned = [c["id"] for c in insight_agent._findings_plan(stats, domain, insights)]
    result = score_report(report, case, prompt=prompt, planned=planned,
                          asked_insights=insights, found=found)
    result["seconds"] = round(took, 1)
    result["titles"] = [str(i.get("title") or "")[:100] for i in report.insights]
    return result


def run(cases: List[Case], live: bool, variant: Optional[str] = None,
        quiet: bool = False) -> Dict[str, Any]:
    keys = _keys() if live else {}
    if live and not any(keys.values()):
        raise SystemExit("No model keys in ai_service/.env, so --live cannot run.")
    results = []
    for i, case in enumerate(cases):
        if live and i:
            time.sleep(PAUSE_SECS)
        result = run_case(case, live, variant, keys)
        results.append(result)
        if not quiet:
            mark = "fallback" if result["fallback"] else result["writer"]
            print(f"{result['score']:5.1f}  {case.name:<26} [{mark}]  stats found it: {result['statsFound']}",
                  flush=True)
            for c in result["checks"]:
                if not c["passed"]:
                    print(f"         - {c['name']}: {c['points']}/{c['of']} {c['note']}", flush=True)
    return {"variant": variant or "chosen", "live": live, "summary": summary(results), "results": results}


def save(card: Dict[str, Any]) -> Path:
    RESULTS.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = RESULTS / f"{stamp}-{card['variant']}{'-live' if card['live'] else ''}.json"
    path.write_text(json.dumps(card, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Score DIG's reports on files with known answers.")
    parser.add_argument("--live", action="store_true", help="use the real models (costs model calls)")
    parser.add_argument("--cases", default="", help="comma-separated case names (default: all)")
    parser.add_argument("--variant", default=None, help="prompt variant to try (default: the chosen one)")
    args = parser.parse_args(argv)
    card = run(by_name(args.cases.split(",") if args.cases else []), args.live, args.variant)
    s = card["summary"]
    print(f"\nmean {s['mean']} over {s['cases']} cases"
          + (f", {s['meanWritten']} over the {s['written']} a model wrote" if s["written"] else ""))
    if s["statsMissed"]:
        print(f"statistics missed the planted truth in: {', '.join(s['statsMissed'])}")
    print(f"saved {save(card)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
