"""
DIG Model Evaluator — check trained model health

Usage:
    cd ai_service
    python -m model_trainer.evaluate

    # Evaluate on a specific subset:
    python -m model_trainer.evaluate --domain finance
    python -m model_trainer.evaluate --last 100

Shows:
  - Per-domain accuracy breakdown
  - Confusion matrix for domain classifier
  - Confidence prediction accuracy
  - Whether model is still fresh vs. stale (needs retraining)
"""

import os
import sys
import json
import pickle
import argparse

import numpy as np
from sklearn.metrics import (
    classification_report, confusion_matrix, accuracy_score
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from model_trainer.features import (
    load_records, build_dataset, to_matrix, TRAINING_LOG
)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def _load(name: str):
    path = os.path.join(MODELS_DIR, name)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Model not found: {path}\nRun train.py first.")
    with open(path, "rb") as f:
        return pickle.load(f)


def load_manifest() -> dict:
    path = os.path.join(MODELS_DIR, "manifest.json")
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def print_confusion_matrix(y_true, y_pred, labels):
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    header = f"{'':18s}" + "  ".join(f"{l[:8]:8s}" for l in labels)
    print(f"\n  {header}")
    for i, row_label in enumerate(labels):
        row = "  ".join(f"{v:8d}" for v in cm[i])
        print(f"  {row_label[:18]:18s}{row}")


def main():
    parser = argparse.ArgumentParser(description="Evaluate DIG trained models")
    parser.add_argument("--log",    default=TRAINING_LOG)
    parser.add_argument("--domain", default=None,  help="Filter to a specific domain")
    parser.add_argument("--last",   type=int, default=None, help="Evaluate only the last N records")
    args = parser.parse_args()

    print("=" * 60)
    print("  DIG Model Evaluator")
    print("=" * 60)

    # ── Load manifest ────────────────────────────────────────────────────
    manifest = load_manifest()
    if manifest:
        print(f"\n  Model trained at:   {manifest.get('trained_at', 'unknown')}")
        print(f"  Records used:       {manifest.get('record_count', '?')}")
        print(f"  Domain CV acc:      {manifest.get('domain_cv_accuracy', '?')}")
        print(f"  Confidence CV acc:  {manifest.get('confidence_cv_accuracy', '?')}")
        print(f"  Production ready:   {'YES' if manifest.get('ready_for_production') else 'Not yet'}")

    # ── Load models ───────────────────────────────────────────────────────
    try:
        domain_clf     = _load("domain_classifier.pkl")
        domain_le      = _load("domain_encoder.pkl")
        confidence_clf = _load("confidence_predictor.pkl")
        confidence_le  = _load("confidence_encoder.pkl")
    except FileNotFoundError as e:
        print(f"\n✗ {e}")
        sys.exit(1)

    # ── Load evaluation data ──────────────────────────────────────────────
    print(f"\nLoading records from: {args.log}")
    records = load_records(args.log)

    if args.last:
        records = records[-args.last:]
        print(f"  Using last {args.last} records")

    if args.domain:
        records = [r for r in records if r.get("domain") == args.domain]
        print(f"  Filtered to domain: {args.domain} ({len(records)} records)")

    X, y_domain, y_confidence = build_dataset(records)

    if len(X) == 0:
        print("\n✗ No valid records to evaluate.")
        sys.exit(1)

    X_matrix = to_matrix(X)
    print(f"  Evaluating on {len(X)} records\n")

    # ── Domain classifier evaluation ──────────────────────────────────────
    print("── Domain Classifier ─────────────────────────────────")
    y_domain_enc     = domain_le.transform(y_domain)
    y_domain_pred    = domain_clf.predict(X_matrix)
    domain_acc       = accuracy_score(y_domain_enc, y_domain_pred)
    y_domain_decoded = domain_le.inverse_transform(y_domain_pred)

    print(f"\n  Overall accuracy: {domain_acc:.1%}")
    print("\n  Per-domain breakdown:")
    report = classification_report(
        y_domain, y_domain_decoded,
        labels=list(domain_le.classes_),
        zero_division=0,
        output_dict=True,
    )
    print(f"  {'Domain':22s}  {'Precision':10s}  {'Recall':8s}  {'F1':6s}  {'Support':8s}")
    print(f"  {'-'*22}  {'-'*10}  {'-'*8}  {'-'*6}  {'-'*8}")
    for domain_name, metrics in report.items():
        if isinstance(metrics, dict) and domain_name in domain_le.classes_:
            sup = int(metrics.get("support", 0))
            if sup == 0:
                continue
            print(
                f"  {domain_name:22s}  "
                f"{metrics['precision']:10.3f}  "
                f"{metrics['recall']:8.3f}  "
                f"{metrics['f1-score']:6.3f}  "
                f"{sup:8d}"
            )

    print_confusion_matrix(y_domain, y_domain_decoded, list(domain_le.classes_))

    # ── Confidence predictor evaluation ───────────────────────────────────
    print("\n── Confidence Predictor ──────────────────────────────")
    y_conf_enc    = confidence_le.transform(y_confidence)
    y_conf_pred   = confidence_clf.predict(X_matrix)
    conf_acc      = accuracy_score(y_conf_enc, y_conf_pred)
    y_conf_decoded = confidence_le.inverse_transform(y_conf_pred)

    print(f"\n  Overall accuracy: {conf_acc:.1%}")
    print(f"\n  {'Level':10s}  {'Predicted':10s}  {'Actual':10s}")
    print(f"  {'-'*10}  {'-'*10}  {'-'*10}")
    conf_report = classification_report(
        y_confidence, y_conf_decoded,
        labels=list(confidence_le.classes_),
        zero_division=0,
        output_dict=True,
    )
    for level, metrics in conf_report.items():
        if isinstance(metrics, dict) and level in confidence_le.classes_:
            sup = int(metrics.get("support", 0))
            if sup > 0:
                print(f"  {level:10s}  {metrics['precision']:10.3f}  {metrics['recall']:10.3f}")

    # ── Staleness check ───────────────────────────────────────────────────
    current_count = len(records)
    trained_count = manifest.get("record_count", 0)
    delta = current_count - trained_count
    print(f"\n── Staleness Check ───────────────────────────────────")
    print(f"  Records at last training: {trained_count}")
    print(f"  Current records:          {current_count}")
    print(f"  New records since train:  {delta}")
    if delta >= 50:
        print("  ⚠  Recommend retraining — 50+ new records available.")
    else:
        print("  ✓  Model is reasonably fresh.")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
