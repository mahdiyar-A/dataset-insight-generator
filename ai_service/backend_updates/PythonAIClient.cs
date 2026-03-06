using System.Net.Http.Headers;
using backend.Application.DTOs.AI;
using backend.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace backend.Infrastructure.Http;

public class PythonAiClient : IPythonAiClient
{
    private readonly HttpClient              _http;
    private readonly ILogger<PythonAiClient> _logger;
    private readonly string                  _baseUrl;

    public PythonAiClient(HttpClient http, ILogger<PythonAiClient> logger, IConfiguration config)
    {
        _http    = http;
        _logger  = logger;
        _baseUrl = config["AIService:BaseUrl"] ?? "http://localhost:8000";
    }

    public async Task<string> CallPythonAiAsync(AnalyzeRequestDto request)
    {
        if (request.CsvFileBytes == null || request.CsvFileBytes.Length == 0)
            throw new ArgumentException("CsvFileBytes is required.");

        for (int attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                using var form = new MultipartFormDataContent();

                // CSV file
                var fileContent = new ByteArrayContent(request.CsvFileBytes);
                fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
                form.Add(fileContent, "file", request.CsvFileName ?? "dataset.csv");

                // Metadata flags
                form.Add(new StringContent(request.SessionId.ToString()), "session_id");

                if (request.DatasetId.HasValue)
                    form.Add(new StringContent(request.DatasetId.Value.ToString()), "dataset_id");

                // Chatbot flags — user's decisions passed from C# ChatController
                form.Add(new StringContent(request.UserWantsCleaning.ToString().ToLower()), "user_wants_cleaning");
                form.Add(new StringContent(request.UserConfirmedLow.ToString().ToLower()),  "user_confirmed_low");

                _logger.LogInformation(
                    "[Python] Sending {Bytes} bytes, cleaning={Cleaning}, confirmedLow={Low}",
                    request.CsvFileBytes.Length,
                    request.UserWantsCleaning,
                    request.UserConfirmedLow
                );

                var response = await _http.PostAsync($"{_baseUrl}/analyze", form);
                var body     = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                    throw new HttpRequestException($"Python returned {(int)response.StatusCode}: {body}");

                _logger.LogInformation("[Python] Response received ({Bytes} bytes)", body.Length);
                return body;
            }
            catch (TaskCanceledException) when (attempt < 3)
            {
                _logger.LogWarning("[Python] Timeout on attempt {Attempt}, retrying…", attempt);
                await Task.Delay(TimeSpan.FromSeconds(attempt * 2));
            }
            catch (HttpRequestException) when (attempt < 3)
            {
                _logger.LogWarning("[Python] Request failed on attempt {Attempt}, retrying…", attempt);
                await Task.Delay(TimeSpan.FromSeconds(attempt * 2));
            }
        }

        throw new HttpRequestException("Python AI service failed after 3 attempts.");
    }
}
