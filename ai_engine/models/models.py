from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional


@dataclass
class DataQualityResult:
    warnings: List[str]
    errors: List[str]
    isUsable: bool


@dataclass
class ConfidenceResult:
    confidenceLevel: str  # NONE | LOW | MEDIUM | HIGH
    confidenceReason: str


@dataclass
class DatasetSummary:
    rowCount: int
    columnCount: int
    columnTypes: Dict[str, str]
    missingPercentages: Dict[str, float]
    numericDistributions: Dict[str, Dict[str, float]]
    topCorrelations: List[Dict[str, Any]]
    detectedIssues: List[str]


@dataclass
class LLMReadiness:
    llmReady: bool
    llmReason: str
    requiresUserConfirmation: bool
    canAutoClean: bool
    suggestedActions: List[str]


@dataclass
class FinalAnalysisResponse:
    status: str
    dataQuality: Dict[str, Any]
    confidence: Dict[str, Any]
    llmReadiness: Dict[str, Any]
    datasetSummary: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
