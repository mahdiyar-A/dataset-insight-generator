import pandas as pd

from ai_engine.core.job_status import JobStatus
from ai_engine.models.models import (
    FinalAnalysisResponse,
    LLMReadiness,
)
from ai_engine.quality.quality_checker import check_data_quality
from ai_engine.quality.confidence_engine import evaluate_confidence
from ai_engine.prompt.prompt_preparer import prepare_prompt_payload


def _build_llm_readiness(
    is_usable: bool,
    confidence_level: str,
    confidence_reason: str,
    warnings: list,
    errors: list  
) -> LLMReadiness:
    if not is_usable:
        return LLMReadiness(
            llmReady=False,
            llmReason="Dataset is not reliable enough for LLM analysis.",
            requiresUserConfirmation=False,
            canAutoClean=True,
            suggestedActions=[
                "Review errors",
                "Clean dataset",
                "Re-upload a higher-quality file"
            ]
        )

    if confidence_level in ("NONE", "LOW"):
        return LLMReadiness(
            llmReady=False,
            llmReason=f"Low confidence: {confidence_reason}",
            requiresUserConfirmation=True,
            canAutoClean=True,
            suggestedActions=[
                "Ask user if they still want to proceed",
                "Offer to clean.csv dataset"
            ]
        )

    return LLMReadiness(
        llmReady=True,
        llmReason=confidence_reason,
        requiresUserConfirmation=False,
        canAutoClean=bool(warnings),
        suggestedActions=[
            "Proceed with LLM analysis",
            "Optionally show warnings to user"
        ]
    )


def analyze_csv(file_path: str) -> dict:
    try:
        df = pd.read_csv(file_path)
    except Exception as e:
        llm_readiness = _build_llm_readiness(
            is_usable=False,
            confidence_level="NONE",
            confidence_reason="File could not be processed.",
            warnings=[],
            errors=[str(e)]
        )

        return FinalAnalysisResponse(
            status=JobStatus.FAILED.value,
            dataQuality={
                "warnings": [],
                "errors": [f"Failed to read CSV: {str(e)}"],
                "isUsable": False,
                "confidenceLevel": "NONE",
                "confidenceReason": "File could not be processed."
            },
            confidence={
                "confidenceLevel": "NONE",
                "confidenceReason": "File could not be processed."
            },
            llmReadiness=llm_readiness.__dict__,
            datasetSummary=None
        ).to_dict()

    quality = check_data_quality(df)
    confidence = evaluate_confidence(df, quality)
    llm_readiness = _build_llm_readiness(
        is_usable=quality.isUsable,
        confidence_level=confidence.confidenceLevel,
        confidence_reason=confidence.confidenceReason,
        warnings=quality.warnings,
        errors=quality.errors
    )

    if not quality.isUsable:
        return FinalAnalysisResponse(
            status=JobStatus.FAILED.value,
            dataQuality={
                "warnings": quality.warnings,
                "errors": quality.errors,
                "isUsable": False,
                "confidenceLevel": confidence.confidenceLevel,
                "confidenceReason": confidence.confidenceReason
            },
            confidence={
                "confidenceLevel": confidence.confidenceLevel,
                "confidenceReason": confidence.confidenceReason
            },
            llmReadiness=llm_readiness.__dict__,
            datasetSummary=None
        ).to_dict()

    summary = prepare_prompt_payload(df, quality)

    return FinalAnalysisResponse(
        status=JobStatus.COMPLETED.value,
        dataQuality={
            "warnings": quality.warnings,
            "errors": quality.errors,
            "isUsable": True,
            "confidenceLevel": confidence.confidenceLevel,
            "confidenceReason": confidence.confidenceReason
        },
        confidence={
            "confidenceLevel": confidence.confidenceLevel,
            "confidenceReason": confidence.confidenceReason
        },
        llmReadiness=llm_readiness.__dict__,
        datasetSummary=summary.__dict__
    ).to_dict()
