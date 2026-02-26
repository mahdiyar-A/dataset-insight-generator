import numpy as np
import pandas as pd

from ai_engine.models.models import DatasetSummary, DataQualityResult


def prepare_prompt_payload(df: pd.DataFrame, quality_result: DataQualityResult) -> DatasetSummary:
    numeric_df = df.select_dtypes(include=[np.number])

    column_types = {col: str(dtype) for col, dtype in df.dtypes.items()}
    missing_percentages = (df.isnull().mean() * 100).round(2).to_dict()

    numeric_distributions = {}
    for col in numeric_df.columns:
        series = numeric_df[col].dropna()
        if series.empty:
            continue
        numeric_distributions[col] = {
            "mean": float(series.mean()),
            "std": float(series.std()),
            "min": float(series.min()),
            "max": float(series.max())
        }

    top_correlations = []
    if len(numeric_df.columns) >= 2:
        corr_matrix = numeric_df.corr().abs()
        for i in range(len(corr_matrix)):
            corr_matrix.iat[i, i] = 0.0

        sorted_corr = (
            corr_matrix.unstack()
            .sort_values(ascending=False)
            .drop_duplicates()
        )

        for (col1, col2), value in sorted_corr.head(3).items():
            top_correlations.append({
                "col1": col1,
                "col2": col2,
                "correlation": round(float(value), 3)
            })

    detected_issues = quality_result.warnings + quality_result.errors

    return DatasetSummary(
        rowCount=len(df),
        columnCount=len(df.columns),
        columnTypes=column_types,
        missingPercentages=missing_percentages,
        numericDistributions=numeric_distributions,
        topCorrelations=top_correlations,
        detectedIssues=detected_issues
    )
