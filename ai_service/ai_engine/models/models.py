from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional


@dataclass
class DataQualityResult:
    warnings: List[str]
    errors: List[str]
    isUsable: bool
    needsCleaning: bool        # True if dataset has fixable issues
    missingRatio: float        # Overall missing value ratio 0.0–1.0
    outlierColumns: List[str]  # Columns with significant outliers


@dataclass
class ConfidenceResult:
    confidenceLevel: str   # HIGH | MEDIUM | LOW | NONE
    confidenceReason: str
    requiresUserConfirmation: bool  # True if LOW/NONE → ask user


@dataclass
class StatsSummary:
    rowCount: int
    columnCount: int
    columnTypes: Dict[str, str]
    missingPercentages: Dict[str, float]
    numericStats: Dict[str, Dict[str, float]]
    topCorrelations: List[Dict[str, Any]]
    categoricalSummaries: Dict[str, Dict]
    outlierSummary: Dict[str, float]
    detectedIssues: List[str]


@dataclass
class ChartInstruction:
    index: int
    chartType: str           # bar | line | scatter | heatmap | histogram | box
    title: str
    xColumn: str
    yColumn: Optional[str]   # None for histograms/single-col charts
    description: str
    insightIndex: int
    color: str               # hex color


@dataclass
class LLMReport:
    executiveSummary: str
    insights: List[Dict[str, Any]]
    chartInstructions: List[ChartInstruction]
    confidenceNote: str
    rawResponse: str
    reportTitle: str = ""
    introduction: str = ""
    conclusion: str = ""


@dataclass
class PipelineResult:
    status: str              # done | failed | cancelled
    condition: str           # all_good | not_clean | low_accuracy | not_workable
    error: Optional[str]

    # Files as base64 — only present on success
    cleanedCsvBase64: Optional[str]
    pdfReportBase64: Optional[str]
    charts: List[Dict[str, Any]]     # [{type, label, desc, color, image_base64}]

    def to_response(self) -> dict:
        return {
            "status":              self.status,
            "condition":           self.condition,
            "error":               self.error,
            "cleaned_csv_base64":  self.cleanedCsvBase64,
            "pdf_report_base64":   self.pdfReportBase64,
            "charts":              self.charts,
        }