using backend.Application.DTOs.AI;
using backend.Application.Interfaces;

namespace backend.Application.Services;

// AIService is kept for the AIController endpoint (Swagger/testing use)
// Real analysis pipeline is handled by AnalysisService
public class AiService : IAiService
{
    private readonly IPythonAiClient _pythonAiClient;

    public AiService(IPythonAiClient pythonAiClient)
    {
        _pythonAiClient = pythonAiClient;
    }

    public async Task<AnalyzeResponseDto> AnalyzeAsync(AnalyzeRequestDto request)
    {
        if (request.CsvFileBytes == null && request.CsvUrl == null)
            throw new ArgumentException("CsvFileBytes or CsvUrl must be provided.");

        if (request.SessionId == Guid.Empty)
            throw new ArgumentException("SessionId is required.");

        try
        {
            var rawJson = await _pythonAiClient.CallPythonAiAsync(request);
            // Parse and return — if parsing fails return a failed response
            try
            {
                var result = System.Text.Json.JsonSerializer.Deserialize<AnalyzeResponseDto>(rawJson,
                    new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                return result ?? new AnalyzeResponseDto { Status = "failed", Error = "Empty response from AI." };
            }
            catch
            {
                return new AnalyzeResponseDto { Status = "failed", Error = "Failed to parse AI response." };
            }
        }
        catch (HttpRequestException)
        {
            throw new ApplicationException("AI service is unavailable. Please try again later.");
        }
        catch (TaskCanceledException)
        {
            throw new TimeoutException("AI request timed out.");
        }
    }
}