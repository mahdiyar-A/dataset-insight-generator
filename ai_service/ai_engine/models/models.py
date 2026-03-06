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
    numericStats: Dict[str, Dict[str, float]]   # mean, median, std, min, max, q1, q3
    topCorrelations: List[Dict[str, Any]]        # top 5 correlations
    categoricalSummaries: Dict[str, Dict]        # top values per categorical col
    outlierSummary: Dict[str, float]             # col → outlier %
    detectedIssues: List[str]


@dataclass
class ChartInstruction:
    index: int
    chartType: str           # bar | line | scatter | heatmap | histogram | box
    title: str
    xColumn: str
    yColumn: Optional[str]   # None for histograms/single-col charts
    description: str         # what insight this chart visualizes
    insightIndex: int        # which insight (1-5) this chart belongs to
    color: str               # hex color


@dataclass
class LLMReport:
    executiveSummary: str             # 2-3 sentence overview
    insights: List[Dict[str, Any]]   # [{rank, title, body, insightIndex}]
    chartInstructions: List[ChartInstruction]
    confidenceNote: str               # LLM's own note on data reliability
    rawResponse: str                  # full LLM response for debugging


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
