using System.Text.Json.Serialization;

namespace backend.Domain.Entities;

public class Dataset
{
    public Guid     Id              { get; private set; }
    public Guid     UserId          { get; private set; }

    public string   FileName        { get; private set; } = null!;
    public long     FileSizeBytes   { get; private set; }
    public DateTime UploadedAt      { get; private set; } = DateTime.UtcNow;

    // Storage paths
    public string   OriginalCsvPath { get; private set; } = null!;
    public string?  CleanedCsvPath  { get; private set; }
    public string?  PdfReportPath   { get; private set; }

    // Shape
    public int?     RowCount        { get; private set; }
    public int?     ColumnCount     { get; private set; }

    // Analysis state  ← NEW
    public string   Status          { get; private set; } = "pending";  // pending | processing | done | failed

    // Chart URLs JSON blob — set by AI service after analysis  ← NEW
    // Stored as raw JSON string, e.g. [{"type":"bar","label":"Distribution","url":"users/x/chart_0.png",...}]
    public string?  ChartUrls       { get; private set; }

    // Preview JSON
    public string?  PreviewJson     { get; private set; }

    // Auto-generated report filename
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

    public void SetShape(int rows, int columns)
    {
        RowCount    = rows;
        ColumnCount = columns;
    }

    public void AttachCleanedCsv(string cleanedCsvPath) => CleanedCsvPath = cleanedCsvPath;
    public void SetPdfReport(string pdfReportPath)       => PdfReportPath  = pdfReportPath;
    public void SetPreview(string previewJson)           => PreviewJson    = previewJson;
    public void SetChartUrls(string chartUrlsJson)       => ChartUrls      = chartUrlsJson;  // ← NEW
    public void SetStatus(string status)                 => Status         = status;           // ← NEW
}