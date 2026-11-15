using System.Text.Json;
using System.Text.Json.Serialization;

namespace backend.Application.DTOs.AI;

/// <summary>
/// What /report/rebuild is given.
///
/// OriginalJson is version 1, which every edit is applied to; EditedJson is
/// what the person sent, or an older version being gone back to (null rebuilds
/// the original as it is); CurrentJson is the version the edit started from,
/// so only figures typed since then are warned about. Charts maps a chart's
/// file number to its PNG.
/// </summary>
public sealed record ReportRebuildRequest(
    string OriginalJson,
    string? EditedJson,
    string? CurrentJson,
    string? ChatContextJson,
    bool WantWord,
    bool WantPptx,
    IReadOnlyDictionary<int, byte[]> Charts);

public sealed class ReportRebuildResponseDto
{
    [JsonPropertyName("document")]           public JsonElement? Document         { get; set; }
    [JsonPropertyName("pdf_report_base64")]  public string?      PdfReportBase64  { get; set; }
    [JsonPropertyName("word_report_base64")] public string?      WordReportBase64 { get; set; }
    [JsonPropertyName("pptx_report_base64")] public string?      PptxReportBase64 { get; set; }
    [JsonPropertyName("warnings")]           public JsonElement? Warnings         { get; set; }
    [JsonPropertyName("chat_context")]       public JsonElement? ChatContext      { get; set; }
    // Set instead of everything above when the edit cannot become a report.
    [JsonPropertyName("error")]              public string?      Error            { get; set; }
}
