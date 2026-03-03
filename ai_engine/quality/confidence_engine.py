import pandas as pd

from ai_engine.models.models import ConfidenceResult, DataQualityResult


def evaluate_confidence(df: pd.DataFrame, quality_result: DataQualityResult) -> ConfidenceResult:
    row_count = len(df)
    missing_ratio = df.isnull().mean().mean()
    warning_count = len(quality_result.warnings)

    if not quality_result.isUsable:
        return ConfidenceResult(
            confidenceLevel="NONE",
            confidenceReason="Critical dataset errors prevent reliable analysis."
        )

    # Size-based
    if row_count < 20:
        return ConfidenceResult(
            confidenceLevel="LOW",
            confidenceReason="Dataset is small; statistical reliability is limited."
        )

    # Missingness-based
    if missing_ratio > 0.4:
        return ConfidenceResult(
            confidenceLevel="LOW",
            confidenceReason="High percentage of missing data reduces confidence."
        )
    if missing_ratio > 0.2:
        return ConfidenceResult(
            confidenceLevel="MEDIUM",
            confidenceReason="Moderate missing data present."
        )

    # Many warnings (outliers, mixed types, etc.)
    if warning_count >= 5:
        return ConfidenceResult(
            confidenceLevel="MEDIUM",
            confidenceReason="Multiple data quality issues detected."
        )

    return ConfidenceResult(
        confidenceLevel="HIGH",
        confidenceReason="Dataset size and quality support reliable analysis."
    )
