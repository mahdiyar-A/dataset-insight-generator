namespace backend.Domain.Entities;

public class Dataset
{
    public Guid Id { get; private set; }

    // Relationship: Dataset belongs to a Project
    public Guid ProjectId { get; private set; }

    // Public info
    public string Name { get; private set; } = null!;

    // Storage pointer (do NOT store the raw CSV in DB)
    public string FilePath { get; private set; } = null!;

    // Metadata (optional but useful)
    public long? RowCount { get; private set; }
    public long? ColumnCount { get; private set; }

    // JSON string for schema/summary (keep it flexible)
    public string ColumnSummaryJson { get; private set; } = "{}";

    public double? SizeInMb { get; private set; }
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;

    private Dataset() { } // EF Core

    public Dataset(Guid projectId, string name, string filePath)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Dataset name cannot be empty.", nameof(name));
        if (string.IsNullOrWhiteSpace(filePath))
            throw new ArgumentException("Dataset file path cannot be empty.", nameof(filePath));

        Id = Guid.NewGuid();
        ProjectId = projectId;
        Name = name.Trim();
        FilePath = filePath.Trim();
    }

    public void Rename(string newName)
    {
        if (string.IsNullOrWhiteSpace(newName))
            throw new ArgumentException("Dataset name cannot be empty.", nameof(newName));

        Name = newName.Trim();
    }

    public void UpdateFilePath(string newFilePath)
    {
        if (string.IsNullOrWhiteSpace(newFilePath))
            throw new ArgumentException("Dataset file path cannot be empty.", nameof(newFilePath));

        FilePath = newFilePath.Trim();
    }

    public void UpdateMetadata(long? rowCount, long? columnCount, double? sizeInMb, string? columnSummaryJson)
    {
        RowCount = rowCount;
        ColumnCount = columnCount;
        SizeInMb = sizeInMb;

        if (!string.IsNullOrWhiteSpace(columnSummaryJson))
            ColumnSummaryJson = columnSummaryJson;
    }
}
