namespace backend.Application.DTOs.AI;

public class AnalyzeRequestDto
{
    public Guid    SessionId    { get; set; }
    public Guid?   DatasetId    { get; set; }

    // CSV sent as raw bytes — streamed directly to Python
    public byte[]? CsvFileBytes { get; set; }
    public string? CsvFileName  { get; set; }

    // Fallback: signed URL if bytes not available
    public string? CsvUrl       { get; set; }

    // User decisions from chatbot
    public bool UserWantsCleaning { get; set; } = false;
    public bool UserConfirmedLow  { get; set; } = false;
}