using System.Text.Json.Serialization;

namespace backend.Domain.Entities;

public class Dataset
{
    public Guid Id { get; private set; }

    // Ownership
    public Guid UserId { get; private set; }

    // File info
    public string FileName { get; private set; } = null!;
    public long FileSizeBytes { get; private set; }
    public DateTime UploadedAt { get; private set; } = DateTime.UtcNow;

    // File paths (stored on disk)
    public string OriginalCsvPath { get; private set; } = null!;
    public string? CleanedCsvPath { get; private set; }

    // Dashboard preview (small JSON only)
    public string? PreviewJson { get; private set; }

    // Optional metadata
    public int? RowCount { get; private set; }
    public int? ColumnCount { get; private set; }

    // For JSON deserialization (ODM)
    [JsonConstructor]
    private Dataset() { }

    public Dataset(
        Guid userId,
        string fileName,
        long fileSizeBytes,
        string originalCsvPath
    )
    {
        Id = Guid.NewGuid();
        UserId = userId;
        FileName = fileName;
        FileSizeBytes = fileSizeBytes;
        OriginalCsvPath = originalCsvPath;
    }

    // Called when cleaning finishes
    public void AttachCleanedCsv(string cleanedCsvPath)
    {
        CleanedCsvPath = cleanedCsvPath;
    }

    // Called when preview is generated
    public void SetPreview(string previewJson)
    {
        PreviewJson = previewJson;
    }

    // Optional metadata updates
    public void SetShape(int rows, int columns)
    {
        RowCount = rows;
        ColumnCount = columns;
    }
}
