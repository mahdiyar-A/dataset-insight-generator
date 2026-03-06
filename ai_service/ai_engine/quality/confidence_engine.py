import pandas as pd
from ai_engine.models.models import ConfidenceResult, DataQualityResult


def evaluate_confidence(df: pd.DataFrame, quality: DataQualityResult) -> ConfidenceResult:
    if not quality.isUsable:
        return ConfidenceResult(
            confidenceLevel="NONE",
            confidenceReason="Critical errors in the dataset prevent reliable analysis.",
            requiresUserConfirmation=False,
        )

    row_count   = len(df)
    missing     = quality.missingRatio
    warn_count  = len(quality.warnings)

    if row_count < 20:
        return ConfidenceResult(
            confidenceLevel="LOW",
            confidenceReason=f"Dataset has only {row_count} rows — statistical reliability is limited.",
            requiresUserConfirmation=True,
        )

    if missing > 0.4:
        return ConfidenceResult(
            confidenceLevel="LOW",
            confidenceReason=f"{round(missing*100)}% of values are missing — insights may be unreliable.",
            requiresUserConfirmation=True,
        )

    if missing > 0.2 or warn_count >= 5:
        return ConfidenceResult(
            confidenceLevel="MEDIUM",
            confidenceReason="Moderate data quality issues detected — insights are usable but not definitive.",
            requiresUserConfirmation=False,
        )

    return ConfidenceResult(
        confidenceLevel="HIGH",
        confidenceReason="Dataset quality and size support reliable analysis.",
        requiresUserConfirmation=False,
    )
