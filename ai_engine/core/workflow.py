from typing import Dict, Any

from ai_engine.core.job_status import JobStatus


def determine_next_step(
    analysis: Dict[str, Any],
    llm_confident: bool,
    user_wants_to_continue_with_low_confidence: bool,
    dataset_clean_enough: bool,
    user_accepts_cleaning: bool,
    user_cancelled: bool,
    llm_failed: bool,
    cleaning_error: bool
) -> Dict[str, Any]:
    """
    Implements interaction rules:

    1) If LLM isn't confident -> ask user if they still want to see dataset.
    2) If dataset isn't clean.csv -> ask if they want auto-clean.csv.
    3) If dataset failed or too short -> job failed error and end work.
    4) User job cancelled.
    5) LLM failed.
    6) Dataset cleaned but any error occurred -> failed.
    7) If no error -> job finished returning the PDF (placeholder).
    """

    # 4 - user job cancelled
    if user_cancelled:
        return {
            "status": JobStatus.CANCELLED.value,
            "frontendAction": "SHOW_CANCELLED_MESSAGE"
        }

    # 3 - dataset failed or too short
    if analysis["status"] == JobStatus.FAILED.value:
        return {
            "status": JobStatus.FAILED.value,
            "frontendAction": "SHOW_DATASET_FAILED"
        }

    # 5 - LLM failed (placeholder for future LLM call)
    if llm_failed:
        return {
            "status": JobStatus.FAILED.value,
            "frontendAction": "SHOW_LLM_FAILED"
        }

    # 2 - dataset isn't clean.csv
    if not dataset_clean_enough:
        if user_accepts_cleaning:
            if cleaning_error:
                # 6 - dataset cleaned but error occurred
                return {
                    "status": JobStatus.FAILED.value,
                    "frontendAction": "SHOW_CLEANING_FAILED"
                }
            else:
                return {
                    "status": JobStatus.CLEANING_DATASET.value,
                    "frontendAction": "CLEAN_AND_RESTART"
                }
        else:
            return {
                "status": JobStatus.NEED_USER_CONFIRMATION.value,
                "frontendAction": "ASK_ALLOW_CLEANING"
            }

    # 1 - LLM not confident
    if not llm_confident:
        if user_wants_to_continue_with_low_confidence:
            return {
                "status": JobStatus.LLM_NOT_CONFIDENT.value,
                "frontendAction": "CONTINUE_WITH_LOW_CONFIDENCE"
            }
        else:
            return {
                "status": JobStatus.NEED_USER_CONFIRMATION.value,
                "frontendAction": "ASK_CONTINUE_WITH_LOW_CONFIDENCE"
            }

    # 7 - no error, job finished returning the pdf (placeholder)
    return {
        "status": JobStatus.COMPLETED.value,
        "frontendAction": "RETURN_PDF"
    }
