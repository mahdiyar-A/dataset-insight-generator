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

    // Pro outputs — null if not requested or generation failed
    [JsonPropertyName("word_report_base64")]
    public string? WordReportBase64 { get; set; }

    [JsonPropertyName("pptx_report_base64")]
    public string? PptxReportBase64 { get; set; }

    [JsonPropertyName("charts")]
    public List<ChartResultDto> Charts { get; set; } = new();

    // LLM usage for this run, produced by ai_engine.telemetry. The Python
    // service computes it but holds no database — persistence is this side's
    // job, and dropping it here is what made cost-per-analysis unanswerable.
    [JsonPropertyName("usage")]
    public UsageDto? Usage { get; set; }
}

public class UsageDto
{
    [JsonPropertyName("total_cost_usd")]
    public decimal TotalCostUsd { get; set; }

    [JsonPropertyName("total_input_tokens")]
    public long TotalInputTokens { get; set; }

    [JsonPropertyName("total_output_tokens")]
    public long TotalOutputTokens { get; set; }

    [JsonPropertyName("call_count")]
    public int CallCount { get; set; }

    [JsonPropertyName("failed_call_count")]
    public int FailedCallCount { get; set; }

    [JsonPropertyName("duration_ms")]
    public long DurationMs { get; set; }

    [JsonPropertyName("cost_by_phase")]
    public Dictionary<string, decimal>? CostByPhase { get; set; }
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
