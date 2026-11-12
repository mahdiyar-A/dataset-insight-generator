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

    # Columns with zero variance — cleaning drops these.
    constantColumns: List[str] = field(default_factory=list)
    # Object columns that are >50% numeric — cleaning coerces these to numeric.
    mixedTypeColumns: List[str] = field(default_factory=list)
    # Exact duplicate row count — cleaning removes these.
    duplicateRows: int = 0
    # Fully-empty row count — cleaning removes these.
    emptyRows: int = 0


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
    # Multivariate anomaly summary from an Isolation Forest: how many rows are
    # unusual and which measures make them so. See stats_analyzer.
    anomalyScores: Dict[str, Any] = field(default_factory=dict)
    # Analyses chosen by what the frame structurally supports, ordered by the
    # detected domain. See ai_engine.core.domain_stats.
    domainAnalyses: Dict[str, Any] = field(default_factory=dict)
    # Cramér's V between pairs of categorical columns.
    categoricalAssociations: List[Dict[str, Any]] = field(default_factory=list)
    # Columns calculated from two others (revenue = units x unit_price).
    # See ai_engine.core.identities.
    derivedColumns: List[Dict[str, Any]] = field(default_factory=list)
    # Correlations that reverse or disappear inside the groups of a category.
    # See ai_engine.core.confounding.
    correlationChecks: List[Dict[str, Any]] = field(default_factory=list)
    # Where missing values cluster: a column missing mostly in one region is a
    # caveat on every finding that uses it.
    missingnessPatterns: List[Dict[str, Any]] = field(default_factory=list)
    # Text columns read as numbers ("$1,234" -> 1234). See core.coerce.
    typeConversions: List[Dict[str, Any]] = field(default_factory=list)
    # Rows the expensive analyses ran on, when the file was sampled for speed.
    sampledRows: Optional[int] = None
    # Share of rows with no missing value at all.
    completeRowsPct: Optional[float] = None
    # How the upload was read: {"format", "formatLabel", "detail", "notes"}.
    # See ai_engine.ingest. Empty when the frame did not come from a file.
    sourceFile: Dict[str, Any] = field(default_factory=dict)


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
    groupColumn: Optional[str] = None            # for grouped bar/line charts and split scatters
    yColumns: List[str] = field(default_factory=list)  # for multi-series charts


@dataclass
class LLMReport:
    reportTitle: str
    introduction: str
    executiveSummary: str
    insights: List[Dict[str, Any]]          # ranked 1–5
    chartInstructions: List[ChartInstruction]
    dataQualitySection: str                 # 2-3 paragraphs, the writer model's assessment
    # The writer model's own 1-10 confidence before the judge reviews it. Named
    # for the model that first filled it; renaming would break the C# contract.
    geminiConfidenceScore: int
    confidenceNote: str                     # short inline note for exec summary page
    conclusion: str
    rawResponse: str
    # Display name of the model that actually wrote this report, so the PDF can
    # credit it truthfully. Empty for the stats-only fallback report.
    writerModel: str = ""
    # Answers to the questions the user asked in the brief:
    # [{"question", "answer", "answerable"}]. Empty when none were asked.
    questionAnswers: List[Dict[str, Any]] = field(default_factory=list)
    # The user's stated assumptions, echoed into the exported documents so a
    # reader knows what was taken as given.
    assumptions: str = ""


@dataclass
class PipelineResult:
    status: str              # done | failed
    condition: str           # all_good | not_clean | low_accuracy | not_workable
    error: Optional[str]
    cleanedCsvBase64: Optional[str]
    pdfReportBase64: Optional[str]
    charts: List[Dict[str, Any]]

    # Optional Pro outputs — only populated when user's outputFormat requests them
    wordReportBase64: Optional[str] = None   # .docx
    pptxReportBase64: Optional[str] = None   # .pptx

    # Low-confidence advisory — set by pipeline when judge score <= threshold
    lowConfidenceWarning: bool = False
    confidenceScore: int = 6

    # Token spend for this run. Returned so the backend can persist it and
    # answer "what does one analysis cost us?" — previously unanswerable
    # because the token counts in every API response were discarded.
    usage: Optional[Dict[str, Any]] = None

    # What the chat answers from after the analysis: the statistics digest the
    # report was written from, the report's own text, and the column list.
    # Stored by the backend next to the report. See llm.harness.
    chatContext: Optional[Dict[str, Any]] = None

    # The model that wrote the report, or "" when none answered and the report
    # is the stats-only fallback. None on a run that never reached the writer.
    # The backend tells the owner about a fallback the moment it happens.
    reportWriter: Optional[str] = None

    def to_response(self) -> dict:
        return {
            "status":                  self.status,
            "condition":               self.condition,
            "error":                   self.error,
            "cleaned_csv_base64":      self.cleanedCsvBase64,
            "pdf_report_base64":       self.pdfReportBase64,
            "word_report_base64":      self.wordReportBase64,
            "pptx_report_base64":      self.pptxReportBase64,
            "charts":                  self.charts,
            "low_confidence_warning":  self.lowConfidenceWarning,
            "confidence_score":        self.confidenceScore,
            "usage":                   self.usage,
            "chat_context":            self.chatContext,
            "report_writer":           self.reportWriter,
        }
