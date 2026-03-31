"""
Feature Extractor for DIG Training Data

Reads pipeline_runs.jsonl records and turns each run into a flat
feature vector that the ML models can train on.

Each record in the JSONL contains everything the pipeline decided:
  - Dataset structure (rows, columns, types, missing, correlations)
  - Domain Groq classified it as
  - Which columns were dropped / kept / marked key
  - Which cleaning methods were applied
  - What chart types Gemini chose
  - Judge confidence score and issues
  - What the judge changed vs what Gemini produced

The feature vector captures the statistical fingerprint of the dataset
so the trained model can recognize similar datasets and predict:
  - Domain
  - Confidence level
  - Column classification tendencies
  - Chart type suitability
"""

import json
import os
from typing import List, Dict, Any, Tuple, Optional

TRAINING_LOG = os.path.join(
    os.path.dirname(__file__), "..", "training_data", "pipeline_runs.jsonl"
)

DOMAIN_LABELS = [
    "finance", "healthcare", "retail", "ecommerce", "hr",
    "logistics", "iot", "academic", "marketing",
    "real_estate", "manufacturing", "general",
]

CONFIDENCE_LABELS = ["LOW", "MEDIUM", "HIGH"]


def load_records(log_path: str = TRAINING_LOG) -> List[Dict[str, Any]]:
    """Load all valid records from the JSONL training log."""
    if not os.path.exists(log_path):
        raise FileNotFoundError(
            f"Training log not found at: {log_path}\n"
            "Run the pipeline at least once to generate training data."
        )
    records = []
    with open(log_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
                if r.get("status") == "done":   # only successful runs
                    records.append(r)
            except json.JSONDecodeError:
                print(f"  [features] Skipping malformed record at line {i+1}")
    return records


def extract_features(record: Dict[str, Any]) -> Dict[str, float]:
    """
    Convert one pipeline run record into a flat float feature dict.
    All features are numeric — categorical fields are one-hot encoded.
    """
    features: Dict[str, float] = {}

    # ── Dataset structure ─────────────────────────────────────────────────
    features["rows"]                       = float(record.get("rows", 0))
    features["columns"]                    = float(record.get("columns", 0))
    features["missing_ratio"]              = float(record.get("missing_ratio", 0.0))
    features["has_temporal"]               = float(bool(record.get("has_temporal", False)))
    features["numeric_col_count"]          = float(record.get("numeric_col_count", 0))
    features["categorical_col_count"]      = float(record.get("categorical_col_count", 0))
    features["outlier_col_count"]          = float(record.get("outlier_col_count", 0))
    features["has_strong_correlation"]     = float(bool(record.get("has_strong_correlation", False)))
    features["significant_group_comps"]    = float(record.get("significant_group_comparisons", 0))

    # ── Derived ratios ────────────────────────────────────────────────────
    total_cols = features["columns"] or 1
    features["numeric_ratio"]              = features["numeric_col_count"]     / total_cols
    features["categorical_ratio"]          = features["categorical_col_count"] / total_cols
    features["outlier_col_ratio"]          = features["outlier_col_count"]     / total_cols

    # Row size buckets (log scale — a 10-row dataset is very different from 100,000)
    import math
    features["log_rows"]                   = math.log10(max(features["rows"], 1))

    # ── Column decisions (Groq Phase 1 output) ────────────────────────────
    col_decisions = record.get("column_decisions", {})
    features["cols_dropped"]               = float(len(col_decisions.get("drop", [])))
    features["cols_kept"]                  = float(len(col_decisions.get("keep", [])))
    features["cols_key"]                   = float(len(col_decisions.get("key", [])))
    features["drop_ratio"]                 = features["cols_dropped"] / total_cols
    features["key_ratio"]                  = features["cols_key"]     / total_cols

    # ── Cleaning decisions ────────────────────────────────────────────────
    features["was_cleaned"]                = float(bool(record.get("was_cleaned", False)))
    features["user_wanted_cleaning"]       = float(bool(record.get("user_wanted_cleaning", False)))

    cleaning_methods = record.get("cleaning_methods_applied", [])
    features["cleaning_method_count"]      = float(len(cleaning_methods))
    # One-hot for common cleaning methods
    method_flags = [
        "impute_median", "impute_mode", "drop_column", "cap_outliers",
        "remove_duplicates", "remove_empty_rows", "remove_infinity",
    ]
    for m in method_flags:
        features[f"method_{m}"] = float(m in cleaning_methods)

    # ── LLM output quality (Judge Phase 6) ───────────────────────────────
    features["judge_confidence"]           = float(record.get("judge_confidence") or 0.65)
    features["judge_issue_count"]          = float(record.get("judge_issue_count") or 0)
    features["judge_proceed"]              = float(bool(record.get("judge_proceed", True)))
    features["insight_count"]              = float(record.get("insight_count", 0))
    features["chart_count"]               = float(record.get("chart_count", 0))

    # ── Chart type distribution (what Gemini chose) ───────────────────────
    chart_types = record.get("chart_types_chosen", [])
    for ct in ["bar", "line", "scatter", "histogram", "heatmap", "box"]:
        features[f"chart_{ct}"] = float(chart_types.count(ct))

    # ── Domain confidence ─────────────────────────────────────────────────
    features["domain_confidence"]          = float(record.get("domain_confidence", 0.5))

    return features


def build_dataset(
    records: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, float]], List[str], List[str]]:
    """
    Build feature matrix X and two target arrays:
      - y_domain:     domain label string (for domain classifier)
      - y_confidence: confidence level string HIGH/MEDIUM/LOW (for confidence predictor)

    Returns: (X, y_domain, y_confidence)
    Filters out records with unknown labels.
    """
    X, y_domain, y_confidence = [], [], []

    for r in records:
        domain = r.get("domain", "").lower()
        confidence = (r.get("judge_level") or "").upper()

        # Skip records with unrecognized labels
        if domain not in DOMAIN_LABELS:
            continue
        if confidence not in CONFIDENCE_LABELS:
            confidence = "MEDIUM"   # safe default

        try:
            feats = extract_features(r)
            X.append(feats)
            y_domain.append(domain)
            y_confidence.append(confidence)
        except Exception as e:
            print(f"  [features] Skipping record: {e}")
            continue

    return X, y_domain, y_confidence


def feature_names(X: List[Dict[str, float]]) -> List[str]:
    """Return ordered feature names from the first record."""
    if not X:
        return []
    return list(X[0].keys())


def to_matrix(X: List[Dict[str, float]]) -> "np.ndarray":
    """Convert list of feature dicts → 2D numpy array (consistent column order)."""
    import numpy as np
    if not X:
        return np.array([])
    cols = feature_names(X)
    return np.array([[row.get(c, 0.0) for c in cols] for row in X], dtype=float)
