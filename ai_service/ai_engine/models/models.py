from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional


@dataclass
class DataQualityResult:
    warnings: List[str]
    errors: List[str]
    isUsable: bool
    needsCleaning: bool
    missingRatio: float
    outlierColumns: List[str]


@dataclass
class ConfidenceResult:
    confidenceLevel: str          # HIGH | MEDIUM | LOW | NONE
    confidenceReason: str
    requiresUserConfirmation: bool


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
    normalityTests: List[Dict[str, Any]] = field(default_factory=list)
    groupComparisons: List[Dict[str, Any]] = field(default_factory=list)
    temporalInfo: Optional[Dict[str, Any]] = None
    spearmanCorrelations: List[Dict[str, Any]] = field(default_factory=list)
    anomalyScores: Dict[str, float] = field(default_factory=dict)


@dataclass
class DomainResult:
    domain: str                             # finance | healthcare | retail | hr | iot | ...
    confidence: float                       # 0.0–1.0
    is_analyzable: bool
    analysis_focus: List[str]               # specific analytical angles
    key_questions: List[str]                # domain questions the report should answer

    # Column classification — 3 buckets
    column_decisions: Dict[str, List[str]]  # {drop: [], keep: [], key: []}

    # How each kept/key column should be referred to in narrative (never "column X")
    attribute_interpretations: Dict[str, str]  # col_name → "what it represents in this domain"

    # Critical issues Groq identified (structural/quality problems that affect analysis)
    key_issues: List[str] = field(default_factory=list)

    # Cleaning directives
    cleaning_needed: bool = False
    cleaning_methods: List[str] = field(default_factory=list)

    rejection_reason: Optional[str] = None


@dataclass
class JudgeResult:
    confidence_score: int                   # 1–10 (displayed on last PDF page)
    confidence_level: str                   # HIGH (8-10) | MEDIUM (5-7) | LOW (1-4)
    overall_confidence: float               # 0.0–1.0 (for internal use)
    issues: List[str]                       # what the judge flagged and fixed
    judge_statement: str                    # 2-3 sentence professional verdict
    conclusion: str                         # refined conclusion paragraph (top 2-3 insights)

    # Corrections — full replacement lists (None means nothing changed)
    corrected_insights: Optional[List[Dict[str, Any]]]
    corrected_chart_instructions: Optional[List[Dict[str, Any]]]

    proceed: bool                           # False → warn user before showing


@dataclass
class ChartInstruction:
    index: int
    chartType: str           # bar | line | scatter | heatmap | histogram | box | grouped_bar | multi_line
    title: str
    xColumn: str
    yColumn: Optional[str]
    description: str
    insightIndex: int
    color: str               # hex
    # Complex / multi-series chart fields (optional)
    chartSubtype: str = ""                        # "grouped" | "stacked" | "multi_line" | ""
    groupColumn: Optional[str] = None            # for grouped bar/line charts
    yColumns: List[str] = field(default_factory=list)  # for multi-series charts


@dataclass
class LLMReport:
    reportTitle: str
    introduction: str
    executiveSummary: str
    insights: List[Dict[str, Any]]          # ranked 1–5
    chartInstructions: List[ChartInstruction]
    dataQualitySection: str                 # 2-3 paragraphs, Gemini's assessment
    geminiConfidenceScore: int              # 1–10 Gemini's own confidence before judge
    confidenceNote: str                     # short inline note for exec summary page
    conclusion: str
    rawResponse: str


@dataclass
class PipelineResult:
    status: str              # done | failed
    condition: str           # all_good | not_clean | low_accuracy | not_workable
    error: Optional[str]
    cleanedCsvBase64: Optional[str]
    pdfReportBase64: Optional[str]
    charts: List[Dict[str, Any]]

    # Low-confidence advisory — set by pipeline when judge score <= threshold
    lowConfidenceWarning: bool = False
    confidenceScore: int = 6

    def to_response(self) -> dict:
        return {
            "status":                  self.status,
            "condition":               self.condition,
            "error":                   self.error,
            "cleaned_csv_base64":      self.cleanedCsvBase64,
            "pdf_report_base64":       self.pdfReportBase64,
            "charts":                  self.charts,
            "low_confidence_warning":  self.lowConfidenceWarning,
            "confidence_score":        self.confidenceScore,
        }
