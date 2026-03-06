namespace backend.Application.DTOs.AI;

public class AnalyzeRequestDto
{
    public Guid    SessionId    { get; set; }
    public Guid?   DatasetId    { get; set; }

    // CSV bytes from temp file
    public byte[]? CsvFileBytes { get; set; }
    public string? CsvFileName  { get; set; }

    // User decisions from chatbot — passed to Python so it knows what to do
    public bool UserWantsCleaning { get; set; } = false;  // user said yes to cleaning
    public bool UserConfirmedLow  { get; set; } = false;  // user said yes despite low confidence
}
