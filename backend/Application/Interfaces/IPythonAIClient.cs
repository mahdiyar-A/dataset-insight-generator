using backend.Application.DTOs.AI;

namespace backend.Application.Interfaces;

public interface IPythonAiClient
{
    Task<string> CallPythonAiAsync(AnalyzeRequestDto request);
    Task<string> CheckQualityAsync(byte[] csvBytes, string fileName, Guid sessionId);

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
}
