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

    // ── Standard customization ────────────────────────────────────────────────
    public string Language      { get; set; } = "en";             // en|fr|es|de|zh|ar|pt|fa
    public string Tone          { get; set; } = "professional";   // professional|technical|casual|storytelling|academic|simplified
    public int    InsightsCount { get; set; } = 5;                // 3|5|7
    public string Occasion      { get; set; } = "general";        // general|investor|academic|internal|client

    // ── Deep customization ────────────────────────────────────────────────────
    public string Audience           { get; set; } = "general";   // general|executive|technical|client|student
    public string Depth              { get; set; } = "standard";  // quick|standard|deep
    public string FocusOn            { get; set; } = "";          // free text: "focus on revenue vs cost"
    public string Comparisons        { get; set; } = "";          // free text: "compare Q1 vs Q2"
    public string MustMention        { get; set; } = "";          // comma-separated topics/columns
    public string ChartStyle         { get; set; } = "mixed";     // mixed|bar-heavy|trend|distribution|comparison
    public bool   IncludeMethodology { get; set; } = true;
    public bool   IncludeConfidence  { get; set; } = true;

    // ── Output format ─────────────────────────────────────────────────────────
    public bool   WantWord      { get; set; } = false;
    public bool   WantPptx      { get; set; } = false;
}
