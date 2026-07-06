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

    // ── Pro customization ─────────────────────────────────────────────────────
    // Parsed from the JSON stored in Analysis.Customization.
    // All fields have safe defaults so free-tier analyses work unchanged.
    public string Language      { get; set; } = "en";    // en|fr|es|de|zh|ar|pt
    public string Tone          { get; set; } = "professional";
    public int    InsightsCount { get; set; } = 5;       // 3|5|7
    public string Occasion      { get; set; } = "general";
    public bool   WantWord      { get; set; } = false;
    public bool   WantPptx      { get; set; } = false;
}
