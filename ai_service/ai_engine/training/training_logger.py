"""
Training Logger — Local Model Training Store

Logs every pipeline run as a structured training record.
Over time these records can be used to:
  - Fine-tune a local model on domain classification
  - Learn cleaning decision patterns by domain
  - Improve insight quality scoring
  - Build a domain-specific confidence calibrator

Data is stored as newline-delimited JSON (JSONL) for easy streaming.
"""

import json
import os
import time
import hashlib
from typing import Optional, Dict, Any, List

from ai_engine.models.models import StatsSummary, DomainResult, JudgeResult


# Store training data next to the ai_engine package
_LOG_DIR  = os.path.join(os.path.dirname(__file__), "..", "..", "training_data")
_LOG_FILE = os.path.join(_LOG_DIR, "pipeline_runs.jsonl")

# Max file size before rotation (10 MB)
_MAX_LOG_BYTES = 10 * 1024 * 1024


def _ensure_log_dir():
    os.makedirs(_LOG_DIR, exist_ok=True)


def _rotate_if_needed():
    """Rotate log file if it exceeds size limit."""
    if os.path.exists(_LOG_FILE) and os.path.getsize(_LOG_FILE) > _MAX_LOG_BYTES:
        archive = _LOG_FILE.replace(".jsonl", f"_{int(time.time())}.jsonl")
        os.rename(_LOG_FILE, archive)


def _dataset_fingerprint(stats: StatsSummary) -> str:
    """
    Create a stable fingerprint for a dataset based on its structural signature.
    Used to detect similar datasets across runs and learn from patterns.
    """
    sig = json.dumps({
        "rows":    stats.rowCount,
        "cols":    stats.columnCount,
        "col_names": sorted(stats.columnTypes.keys()),
        "col_types": dict(sorted(stats.columnTypes.items())),
    }, sort_keys=True)
    return hashlib.md5(sig.encode()).hexdigest()[:12]


def log_pipeline_run(
    stats:             StatsSummary,
    domain:            DomainResult,
    judge:             Optional[JudgeResult],
    was_cleaned:       bool,
    user_wanted_clean: bool,
    insight_count:     int,
    chart_count:       int,
    status:            str,       # done | failed
    error:             Optional[str] = None,
    session_id:        Optional[str] = None,
    column_decisions:  Optional[Dict[str, List[str]]] = None,   # {drop, keep, key}
    cleaning_methods:  Optional[List[str]] = None,              # methods Groq specified
    chart_types:       Optional[List[str]] = None,              # chart types Gemini chose
    judge_changes:     Optional[Dict[str, Any]] = None,         # what the judge modified
):
    """
    Log a complete pipeline run as a training record.
    Called at the end of every pipeline execution (success or failure).
    """
    try:
        _ensure_log_dir()
        _rotate_if_needed()

        record: Dict[str, Any] = {
            # Metadata
            "timestamp":    int(time.time()),
            "session_id":   session_id or "unknown",
            "status":       status,

            # Dataset fingerprint (structural signature, not raw data)
            "fingerprint":  _dataset_fingerprint(stats),
            "rows":         stats.rowCount,
            "columns":      stats.columnCount,
            "missing_ratio": round(
                sum(stats.missingPercentages.values()) / max(len(stats.missingPercentages), 1), 3
            ),
            "has_temporal": bool(
                stats.temporalInfo and stats.temporalInfo.get("detected")
            ),
            "numeric_col_count":     len(stats.numericStats),
            "categorical_col_count": len(stats.categoricalSummaries),
            "outlier_col_count":     len(stats.outlierSummary),
            "has_strong_correlation": any(
                c["correlation"] > 0.7 for c in stats.topCorrelations
            ),

            # Domain classification (Phase 0+1 output — training target)
            "domain":            domain.domain,
            "domain_confidence": domain.confidence,
            "analysis_focus":    domain.analysis_focus,

            # Cleaning decision
            "needed_cleaning":     bool(was_cleaned or user_wanted_clean),
            "was_cleaned":         was_cleaned,
            "user_wanted_cleaning": user_wanted_clean,

            # Output quality (Phase 6 judge output — quality label)
            "insight_count":        insight_count,
            "chart_count":          chart_count,
            "judge_confidence":     judge.overall_confidence if judge else None,
            "judge_level":          judge.confidence_level   if judge else None,
            "judge_issue_count":    len(judge.issues)        if judge else None,
            "judge_proceed":        judge.proceed            if judge else None,

            # Group comparison results (training signal for domain-specific analysis)
            "significant_group_comparisons": sum(
                1 for gc in stats.groupComparisons if gc.get("significant")
            ),

            # Groq Phase 1 column decisions (core training signal)
            "column_decisions":        column_decisions or {"drop": [], "keep": [], "key": []},
            "cleaning_methods_applied": cleaning_methods or [],

            # Gemini Phase 4 chart choices
            "chart_types_chosen":      chart_types or [],

            # Judge Phase 6 — what changed (quality diff signal)
            "judge_changes":           judge_changes or {},

            # Error info
            "error": error,
        }

        with open(_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")

    except Exception as e:
        # Training logger must NEVER break the main pipeline
        print(f"[TrainingLogger] Failed to log run: {e}")


def get_training_stats() -> Dict[str, Any]:
    """
    Return a summary of the training log for monitoring.
    Called by the /training-stats health endpoint.
    """
    try:
        _ensure_log_dir()
        if not os.path.exists(_LOG_FILE):
            return {"total_runs": 0, "message": "No training data yet."}

        records: List[Dict] = []
        with open(_LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

        if not records:
            return {"total_runs": 0, "message": "Log file empty."}

        domain_counts: Dict[str, int] = {}
        confidence_sum = 0.0
        confidence_count = 0
        success_count = 0

        for r in records:
            domain = r.get("domain", "unknown")
            domain_counts[domain] = domain_counts.get(domain, 0) + 1
            if r.get("judge_confidence") is not None:
                confidence_sum   += r["judge_confidence"]
                confidence_count += 1
            if r.get("status") == "done":
                success_count += 1

        return {
            "total_runs":      len(records),
            "success_rate":    round(success_count / len(records), 3),
            "domain_breakdown": domain_counts,
            "avg_confidence":  round(confidence_sum / confidence_count, 3) if confidence_count else None,
            "log_file_size_kb": round(os.path.getsize(_LOG_FILE) / 1024, 1),
        }

    except Exception as e:
        return {"error": str(e)}
