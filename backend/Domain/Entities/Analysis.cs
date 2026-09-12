namespace backend.Domain.Entities;

/// <summary>
/// Represents one completed (or in-progress) analysis run for a user.
/// Replaces the old single-row Dataset model — users now keep up to
/// 5 (free) or 15 (pro) analyses in their history.
///
/// Status lifecycle: pending → processing → done | failed
/// </summary>
public class Analysis
{
    public Guid     Id             { get; private set; }
    public Guid     UserId         { get; private set; }

    // ── File metadata ─────────────────────────────────────────────────────────
    public string   FileName       { get; private set; } = null!;
    public long     FileSizeBytes  { get; private set; }
    public int?     RowCount       { get; private set; }
    public int?     ColumnCount    { get; private set; }

    // ── Supabase Storage paths (relative, null = not generated yet) ───────────
    public string?  OriginalCsvPath  { get; private set; }
    public string?  CleanedCsvPath   { get; private set; }
    public string?  PdfReportPath    { get; private set; }
    public string?  WordReportPath   { get; private set; }  // .docx (pro)
    public string?  PptxReportPath   { get; private set; }  // .pptx (pro)

    // ── Chart metadata JSON blob ───────────────────────────────────────────────
    public string?  ChartUrls     { get; private set; }

    // ── Pipeline state ────────────────────────────────────────────────────────
    public string   Status        { get; private set; } = "pending";

    // ── AI customization JSON (pro only) ──────────────────────────────────────
    // { language, tone, insights_count, occasion, output_format, include_pptx }
    public string?  Customization { get; private set; }

    // ── LLM usage (null for runs recorded before cost tracking existed) ───────
    public decimal? CostUsd   { get; private set; }
    public long?    TokensIn  { get; private set; }
    public long?    TokensOut { get; private set; }
    // Full usage payload from the AI service (per-phase costs, call log)
    public string?  UsageJson { get; private set; }

    // ── Timestamps ────────────────────────────────────────────────────────────
    public DateTime  CreatedAt    { get; private set; } = DateTime.UtcNow;
    public DateTime? CompletedAt  { get; private set; }
    public Guid?     SessionId    { get; private set; }

    // Auto-generated filename shown in the downloads UI
    public string ReportFileName =>
        $"analysis_report_{CreatedAt:yyyy-MM-dd}.pdf";

    protected Analysis() { }

    public Analysis(Guid userId, string fileName, long fileSizeBytes, Guid? sessionId = null)
    {
        Id            = Guid.NewGuid();
        UserId        = userId;
        FileName      = fileName;
        FileSizeBytes = fileSizeBytes;
        SessionId     = sessionId;
        Status        = "pending";
        CreatedAt     = DateTime.UtcNow;
    }

    // ── Mutators ──────────────────────────────────────────────────────────────

    public void SetShape(int rows, int cols) { RowCount = rows; ColumnCount = cols; }

    public void SetStatus(string status)
    {
        Status = status;
        if (status is "done" or "failed")
            CompletedAt = DateTime.UtcNow;
    }

    public void SetOriginalCsvPath(string p) => OriginalCsvPath = p;
    public void SetCleanedCsvPath(string p)  => CleanedCsvPath  = p;
    public void SetPdfPath(string p)         => PdfReportPath   = p;
    public void SetWordPath(string p)        => WordReportPath  = p;
    public void SetPptxPath(string p)        => PptxReportPath  = p;
    public void SetChartUrls(string json)    => ChartUrls       = json;
    public void SetCustomization(string json) => Customization  = json;

    public void SetUsage(decimal costUsd, long tokensIn, long tokensOut, string? usageJson)
    {
        CostUsd   = costUsd;
        TokensIn  = tokensIn;
        TokensOut = tokensOut;
        UsageJson = usageJson;
    }

    // ── Restore from DB ───────────────────────────────────────────────────────
    // Named factory so callers are explicit that this is a DB hydration

    public static Analysis Restore(
        Guid     id,            Guid     userId,      string   fileName,
        long     fileSizeBytes, string   status,      DateTime createdAt,
        int?     rowCount       = null,  int?     columnCount     = null,
        string?  originalCsv   = null,  string?  cleanedCsv      = null,
        string?  pdfPath       = null,  string?  wordPath        = null,
        string?  pptxPath      = null,  string?  chartUrls       = null,
        string?  customization = null,  DateTime? completedAt    = null,
        Guid?    sessionId     = null,
        decimal? costUsd       = null,  long?    tokensIn        = null,
        long?    tokensOut     = null,  string?  usageJson       = null)
    {
        var a = new Analysis
        {
            Id              = id,
            UserId          = userId,
            FileName        = fileName,
            FileSizeBytes   = fileSizeBytes,
            Status          = status,
            CreatedAt       = createdAt,
            CompletedAt     = completedAt,
            SessionId       = sessionId,
            RowCount        = rowCount,
            ColumnCount     = columnCount,
            OriginalCsvPath = originalCsv,
            CleanedCsvPath  = cleanedCsv,
            PdfReportPath   = pdfPath,
            WordReportPath  = wordPath,
            PptxReportPath  = pptxPath,
            ChartUrls       = chartUrls,
            Customization   = customization,
            CostUsd         = costUsd,
            TokensIn        = tokensIn,
            TokensOut       = tokensOut,
            UsageJson       = usageJson,
        };
        return a;
    }
}
