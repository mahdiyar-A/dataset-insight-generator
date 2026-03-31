"""
DIG Model Trainer — run this manually after collecting enough pipeline runs

Usage:
    cd ai_service
    python -m model_trainer.train

    # Or with options:
    python -m model_trainer.train --min-records 50 --evaluate

What it trains:
    1. domain_classifier      — predicts dataset domain from structural fingerprint
    2. confidence_predictor   — predicts analysis confidence level (HIGH/MEDIUM/LOW)

Where models are saved:
    ai_service/models/domain_classifier.pkl
    ai_service/models/confidence_predictor.pkl
    ai_service/models/feature_names.json   ← required at inference time

Minimum recommended records:
    - 20  records: domain classifier starts to be useful (limited accuracy)
    - 50  records: confidence predictor becomes reliable
    - 200 records: both models outperform the Groq fallback for common domains
    - 500+:        production-quality local inference
"""

import os
import sys
import json
import pickle
import argparse
from datetime import datetime

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# Allow running from ai_service/ directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from model_trainer.features import (
    load_records, build_dataset, feature_names, to_matrix,
    DOMAIN_LABELS, CONFIDENCE_LABELS, TRAINING_LOG
)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def _ensure_models_dir():
    os.makedirs(MODELS_DIR, exist_ok=True)


def _save(obj: object, name: str):
    path = os.path.join(MODELS_DIR, name)
    with open(path, "wb") as f:
        pickle.dump(obj, f)
    print(f"  Saved: {path}")
    return path


def _load(name: str):
    path = os.path.join(MODELS_DIR, name)
    with open(path, "rb") as f:
        return pickle.load(f)


def train_domain_classifier(
    X_matrix: np.ndarray,
    y: list,
    feat_names: list,
    cross_validate: bool = True,
) -> tuple:
    """
    Train a Gradient Boosting domain classifier.
    Returns (fitted_pipeline, label_encoder, cv_accuracy)
    """
    print("\n── Domain Classifier ────────────────────────────────")
    le = LabelEncoder()
    y_enc = le.fit_transform(y)
    print(f"  Classes: {list(le.classes_)}")
    print(f"  Records: {len(y_enc)}")

    # Class distribution
    unique, counts = np.unique(y_enc, return_counts=True)
    for lbl, cnt in zip(le.classes_, counts):
        print(f"    {lbl:20s}: {cnt} records")

    # Build pipeline: scaler + GBM
    clf = Pipeline([
        ("scaler", StandardScaler()),
        ("model", GradientBoostingClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            min_samples_leaf=2,
            subsample=0.8,
            random_state=42,
        )),
    ])

    cv_score = None
    if cross_validate and len(y_enc) >= 20:
        n_splits = min(5, len(set(y_enc)))   # can't have more folds than classes
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        scores = cross_val_score(clf, X_matrix, y_enc, cv=cv, scoring="accuracy")
        cv_score = scores.mean()
        print(f"  Cross-val accuracy ({n_splits}-fold): {cv_score:.3f} ± {scores.std():.3f}")
        if cv_score < 0.5:
            print("  ⚠ Accuracy below 0.5 — collect more diverse training data")
    else:
        print("  Skipping cross-validation (too few records or disabled)")

    # Final fit on all data
    clf.fit(X_matrix, y_enc)
    print("  Final fit complete.")

    # Feature importances
    importances = clf.named_steps["model"].feature_importances_
    top_features = sorted(
        zip(feat_names, importances), key=lambda x: x[1], reverse=True
    )[:10]
    print("\n  Top 10 most predictive features:")
    for fname, imp in top_features:
        bar = "█" * int(imp * 100)
        print(f"    {fname:30s} {imp:.4f}  {bar}")

    return clf, le, cv_score


def train_confidence_predictor(
    X_matrix: np.ndarray,
    y: list,
    cross_validate: bool = True,
) -> tuple:
    """
    Train a Random Forest confidence level predictor (HIGH/MEDIUM/LOW).
    Returns (fitted_pipeline, label_encoder, cv_accuracy)
    """
    print("\n── Confidence Predictor ─────────────────────────────")
    le = LabelEncoder()
    y_enc = le.fit_transform(y)
    print(f"  Classes: {list(le.classes_)}")
    print(f"  Records: {len(y_enc)}")

    clf = Pipeline([
        ("scaler", StandardScaler()),
        ("model", RandomForestClassifier(
            n_estimators=300,
            max_depth=6,
            min_samples_leaf=3,
            class_weight="balanced",   # important: confidence levels often imbalanced
            random_state=42,
        )),
    ])

    cv_score = None
    if cross_validate and len(y_enc) >= 20:
        n_splits = min(5, len(set(y_enc)))
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        scores = cross_val_score(clf, X_matrix, y_enc, cv=cv, scoring="accuracy")
        cv_score = scores.mean()
        print(f"  Cross-val accuracy ({n_splits}-fold): {cv_score:.3f} ± {scores.std():.3f}")
    else:
        print("  Skipping cross-validation (too few records or disabled)")

    clf.fit(X_matrix, y_enc)
    print("  Final fit complete.")

    return clf, le, cv_score


def save_manifest(
    domain_cv: float,
    confidence_cv: float,
    record_count: int,
    feat_names: list,
):
    """Save a manifest JSON so the pipeline (and you) know when this model was trained."""
    manifest = {
        "trained_at":            datetime.utcnow().isoformat() + "Z",
        "record_count":          record_count,
        "domain_cv_accuracy":    round(domain_cv, 4) if domain_cv else None,
        "confidence_cv_accuracy": round(confidence_cv, 4) if confidence_cv else None,
        "feature_count":         len(feat_names),
        "feature_names":         feat_names,
        "models": {
            "domain_classifier":    "domain_classifier.pkl",
            "confidence_predictor": "confidence_predictor.pkl",
            "domain_encoder":       "domain_encoder.pkl",
            "confidence_encoder":   "confidence_encoder.pkl",
        },
        "minimum_records_for_production": 200,
        "ready_for_production":  record_count >= 200 and (domain_cv or 0) >= 0.7,
    }
    path = os.path.join(MODELS_DIR, "manifest.json")
    with open(path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\n  Manifest saved: {path}")
    return manifest


def main():
    parser = argparse.ArgumentParser(description="Train DIG local models")
    parser.add_argument(
        "--log", default=TRAINING_LOG,
        help="Path to pipeline_runs.jsonl (default: training_data/pipeline_runs.jsonl)"
    )
    parser.add_argument(
        "--min-records", type=int, default=10,
        help="Minimum successful runs required before training (default: 10)"
    )
    parser.add_argument(
        "--no-cv", action="store_true",
        help="Skip cross-validation (faster, useful when records are very few)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  DIG Model Trainer")
    print("=" * 60)

    # ── Load records ──────────────────────────────────────────────────────
    print(f"\nLoading training data from: {args.log}")
    try:
        records = load_records(args.log)
    except FileNotFoundError as e:
        print(f"\n✗ {e}")
        sys.exit(1)

    print(f"  Loaded {len(records)} successful pipeline runs")

    if len(records) < args.min_records:
        print(
            f"\n✗ Not enough records. Have {len(records)}, need {args.min_records}.\n"
            "  Run more datasets through the pipeline first, then retrain.\n"
            f"  Current log: {args.log}"
        )
        sys.exit(1)

    # ── Build feature matrix ─────────────────────────────────────────────
    print("\nExtracting features...")
    X, y_domain, y_confidence = build_dataset(records)
    print(f"  Valid records after filtering: {len(X)}")

    if len(X) < args.min_records:
        print(f"\n✗ Not enough valid records after filtering. Check domain labels.")
        sys.exit(1)

    feat_names = feature_names(X)
    X_matrix   = to_matrix(X)
    print(f"  Feature dimensions: {X_matrix.shape[0]} records × {X_matrix.shape[1]} features")

    # ── Train models ──────────────────────────────────────────────────────
    _ensure_models_dir()
    cross_validate = not args.no_cv

    domain_clf,     domain_le,     domain_cv     = train_domain_classifier(X_matrix, y_domain, feat_names, cross_validate)
    confidence_clf, confidence_le, confidence_cv = train_confidence_predictor(X_matrix, y_confidence, cross_validate)

    # ── Save everything ───────────────────────────────────────────────────
    print("\nSaving models...")
    _save(domain_clf,     "domain_classifier.pkl")
    _save(domain_le,      "domain_encoder.pkl")
    _save(confidence_clf, "confidence_predictor.pkl")
    _save(confidence_le,  "confidence_encoder.pkl")

    manifest = save_manifest(domain_cv, confidence_cv, len(X), feat_names)

    # ── Summary ───────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  Training Complete")
    print("=" * 60)
    print(f"  Records used:            {len(X)}")
    print(f"  Domain accuracy (CV):    {f'{domain_cv:.1%}' if domain_cv else 'N/A'}")
    print(f"  Confidence accuracy (CV): {f'{confidence_cv:.1%}' if confidence_cv else 'N/A'}")
    print(f"  Production ready:        {'YES ✓' if manifest['ready_for_production'] else 'Not yet — need 200+ records with 70%+ accuracy'}")
    print()
    print("  To use these models in the pipeline:")
    print("  → The pipeline will auto-load them from ai_service/models/")
    print("  → Run this script again after every ~50 new pipeline runs")
    print()


if __name__ == "__main__":
    main()
