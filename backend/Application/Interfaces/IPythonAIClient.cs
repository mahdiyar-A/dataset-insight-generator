using backend.Application.DTOs.AI;

namespace backend.Application.Interfaces;

public interface IPythonAiClient
{
    Task<string> CallPythonAiAsync(AnalyzeRequestDto request);
    /// <summary>
    /// Whether the file can be analysed as it is. With <paramref name="withDomain"/>
    /// the answer also carries "domain": what the AI service takes the data to
    /// be, whether it is sure, and the classification to hand back to the
    /// analysis. That part asks a model; the rest does not.
    /// </summary>
    Task<string> CheckQualityAsync(byte[] csvBytes, string fileName, Guid sessionId, bool withDomain = false);

    /// <summary>
    /// How the AI service reads a file: format, rows, columns, headers and a
    /// preview, or {"ok": false, "error"} with a reason written for the user.
    /// No model calls.
    /// </summary>
    Task<string> InspectAsync(byte[] fileBytes, string fileName);

    /// <summary>Report settings from the user's own description of the report they want.</summary>
    Task<string> BriefAsync(string text, IReadOnlyList<string> columns, string uiLanguage);

    /// <summary>
    /// Answer a question about a finished analysis. contextJson is the
    /// chat_context the analysis returned; the file, when given, lets the
    /// assistant query the data itself.
    /// </summary>
    Task<string> AskAsync(string question, string contextJson, string historyJson, string uiLanguage,
                          byte[]? fileBytes, string? fileName);

    /// <summary>
    /// Whether the models DIG uses are still offered, what is left of today's
    /// free allowance and how the last day went, with a "problems" list of
    /// plain sentences. No model calls. See ai_engine/llm/model_watch.py.
    /// </summary>
    Task<string> ModelStatusAsync();

    /// <summary>
    /// The files for a report rebuilt from its document, with the document an
    /// edit makes, figures worth a second look and the chat context carrying
    /// the edited words. No model calls. An edit that cannot become a report
    /// comes back as {"error": code}, not as an exception. See
    /// ai_engine/report_document.py.
    /// </summary>
    Task<string> RebuildReportAsync(ReportRebuildRequest request);
}
