using System.Text.Json.Serialization;

namespace backend.Domain.Entities;

public class Dataset
{
    public Guid     Id              { get; private set; }
    public Guid     UserId          { get; private set; }

    // File metadata
    public string   FileName        { get; private set; } = null!;
    public long     FileSizeBytes   { get; private set; }
    public DateTime UploadedAt      { get; private set; } = DateTime.UtcNow;

    // Storage paths (Supabase Storage)
    public string   OriginalCsvPath { get; private set; } = null!;
    public string?  CleanedCsvPath  { get; private set; }
    public string?  PdfReportPath   { get; private set; }

    // Dashboard preview JSON blob
    public string?  PreviewJson     { get; private set; }

    // Shape metadata
    public int?     RowCount        { get; private set; }
    public int?     ColumnCount     { get; private set; }

    // Auto-generated display name e.g. "analysis_report_2026-03-04.pdf"
    public string   ReportFileName =>
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
    }

    public void SetShape(int rows, int columns)
    {
        RowCount    = rows;
        ColumnCount = columns;
    }

    public void AttachCleanedCsv(string cleanedCsvPath)
        => CleanedCsvPath = cleanedCsvPath;

    public void SetPdfReport(string pdfReportPath)
        => PdfReportPath = pdfReportPath;

    public void SetPreview(string previewJson)
        => PreviewJson = previewJson;
}