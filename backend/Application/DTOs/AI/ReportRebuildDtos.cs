using System.Text.Json;
using System.Text.Json.Serialization;

namespace backend.Application.DTOs.AI;

/// <summary>
/// What /report/rebuild is given.
///
/// OriginalJson is version 1, which every edit is applied to; EditedJson is
/// what the person sent, or an older version being gone back to (null rebuilds
/// the original as it is); CurrentJson is the newest version: what DIG added
/// at the owner's request is carried forward from it, and with Warn only
/// figures typed since then are warned about. Charts maps a chart's file
/// number to its PNG.
///
/// ChangesJson is a suggestion from the chat the owner applied, made to
/// CurrentJson in place of an edit; NewCharts maps a change's position in it
/// to the picture DIG drew for it.
/// </summary>
public sealed record ReportRebuildRequest(
    string OriginalJson,
    string? EditedJson,
    string? CurrentJson,
    string? ChatContextJson,
    bool WantWord,
    bool WantPptx,
    IReadOnlyDictionary<int, byte[]> Charts,
    bool Warn = true,
    string? ChangesJson = null,
    IReadOnlyDictionary<int, byte[]>? NewCharts = null);

public sealed class ReportRebuildResponseDto
{
    [JsonPropertyName("document")]           public JsonElement? Document         { get; set; }
    [JsonPropertyName("pdf_report_base64")]  public string?      PdfReportBase64  { get; set; }
    [JsonPropertyName("word_report_base64")] public string?      WordReportBase64 { get; set; }
    [JsonPropertyName("pptx_report_base64")] public string?      PptxReportBase64 { get; set; }
    [JsonPropertyName("warnings")]           public JsonElement? Warnings         { get; set; }
    [JsonPropertyName("chat_context")]       public JsonElement? ChatContext      { get; set; }
    // For applied changes: a change's position → the chart file its picture is stored as.
    [JsonPropertyName("new_chart_files")]    public Dictionary<string, int>? NewChartFiles { get; set; }
    // Set instead of everything above when the edit cannot become a report.
    [JsonPropertyName("error")]              public string?      Error            { get; set; }
}
