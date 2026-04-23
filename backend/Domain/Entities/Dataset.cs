using System.Text.Json.Serialization;

namespace backend.Domain.Entities;

/// <summary>
/// Represents one dataset upload for a user.
/// A user can only have one active dataset at a time — uploading a new file
/// replaces the previous one in both the DB and Supabase Storage.
///
/// Status lifecycle:  pending → processing → done | failed
/// </summary>
public class Dataset
{
    public Guid     Id            { get; private set; }
    public Guid     UserId        { get; private set; }

    // ── File metadata ────────────────────────────────────────────────────────
    public string   FileName      { get; private set; } = null!;
    public long     FileSizeBytes { get; private set; }
    public DateTime UploadedAt    { get; private set; } = DateTime.UtcNow;

    // ── Supabase Storage paths (relative, e.g. "users/{id}/report.pdf") ─────
    // Null means that file hasn't been produced yet
    public string   OriginalCsvPath { get; private set; } = null!;
    public string?  CleanedCsvPath  { get; private set; }
    public string?  PdfReportPath   { get; private set; }

    // ── Dataset shape (rows / columns) ───────────────────────────────────────
    public int?     RowCount    { get; private set; }
    public int?     ColumnCount { get; private set; }

    // ── Analysis state ───────────────────────────────────────────────────────
    // "pending"    — file uploaded, waiting for user to start analysis
    // "processing" — AI pipeline is running
    // "done"       — report, charts, and optional cleaned CSV are ready
    // "failed"     — pipeline errored, user should re-upload
    public string   Status { get; private set; } = "pending";

    // ── Chart metadata (JSON blob) ───────────────────────────────────────────
    // Serialised list of { type, label, url, desc, color } objects.
    // Written by AnalysisService once the pipeline completes.
    public string?  ChartUrls { get; private set; }

    // Auto-generated report filename shown to the user in the downloads card
    public string ReportFileName =>
        $"analysis_report_{UploadedAt:yyyy-MM-dd}.pdf";

    [JsonConstructor]
    private Dataset() { }

    public Dataset(Guid userId, string fileName, long fileSizeBytes, string originalCsvPath)
    {
        Id              = Guid.NewGuid();
        UserId          = userId;
        FileName        = fileName;
        FileSizeBytes   = fileSizeBytes;
        OriginalCsvPath = originalCsvPath;
        Status          = "pending";
    }

    // ── Mutators ─────────────────────────────────────────────────────────────

    public void SetShape(int rows, int columns)
    {
        RowCount    = rows;
        ColumnCount = columns;
    }

    public void SetStatus(string status)     => Status        = status;
    public void AttachCleanedCsv(string path) => CleanedCsvPath = path;
    public void SetPdfReport(string path)    => PdfReportPath  = path;
    public void SetChartUrls(string json)    => ChartUrls      = json;
}
