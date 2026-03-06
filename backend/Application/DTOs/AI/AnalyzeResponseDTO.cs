using System.Text.Json.Serialization;

namespace backend.Application.DTOs.AI;

public class AnalyzeResponseDto
{
    [JsonPropertyName("session_id")]
    public Guid SessionId { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "done";  // "done" or "failed"

    [JsonPropertyName("condition")]
    public string Condition { get; set; } = "all_good";

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }

    [JsonPropertyName("cleaned_csv_base64")]
    public string? CleanedCsvBase64 { get; set; }

    [JsonPropertyName("pdf_report_base64")]
    public string? PdfReportBase64 { get; set; }

    [JsonPropertyName("charts")]
    public List<ChartResultDto> Charts { get; set; } = new();
}

public class ChartResultDto
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "bar";

    [JsonPropertyName("label")]
    public string Label { get; set; } = "";

    [JsonPropertyName("desc")]
    public string Desc { get; set; } = "";

    [JsonPropertyName("color")]
    public string Color { get; set; } = "#3b82f6";

    [JsonPropertyName("image_base64")]
    public string? ImageBase64 { get; set; }
}