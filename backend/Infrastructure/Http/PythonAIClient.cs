using System.Net.Http.Headers;
using backend.Application.DTOs.AI;
using backend.Application.Interfaces;

namespace backend.Infrastructure.Http;

public class PythonAiClient : IPythonAiClient
{
    private readonly HttpClient                _http;
    private readonly IConfiguration            _config;
    private readonly ILogger<PythonAiClient>   _logger;

    public PythonAiClient(HttpClient http, IConfiguration config, ILogger<PythonAiClient> logger)
    {
        _http   = http;
        _config = config;
        _logger = logger;
        _http.Timeout = TimeSpan.FromSeconds(
            _config.GetValue<int?>("AIService:TimeoutSeconds") ?? 120);
    }

    public async Task<string> CallPythonAiAsync(AnalyzeRequestDto request)
    {
        if (request.CsvFileBytes == null && request.CsvUrl == null)
            throw new ArgumentException("Either CsvFileBytes or CsvUrl must be provided.");

        var baseUrl = _config["AIService:BaseUrl"]
            ?? throw new InvalidOperationException("AIService:BaseUrl not configured.");

        var retries = _config.GetValue<int?>("AIService:RetryCount") ?? 3;

        for (int attempt = 1; attempt <= retries; attempt++)
        {
            try
            {
                using var content = new MultipartFormDataContent();
                content.Add(new StringContent(request.SessionId.ToString()), "session_id");

                if (request.DatasetId.HasValue)
                    content.Add(new StringContent(request.DatasetId.Value.ToString()), "dataset_id");

                if (request.CsvFileBytes != null)
                {
                    var byteContent = new ByteArrayContent(request.CsvFileBytes);
                    byteContent.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
                    content.Add(byteContent, "file", request.CsvFileName ?? "data.csv");
                }
                else if (!string.IsNullOrEmpty(request.CsvUrl))
                {
                    content.Add(new StringContent(request.CsvUrl), "csv_url");
                }

                var response = await _http.PostAsync($"{baseUrl}/analyze", content);
                response.EnsureSuccessStatusCode();
                return await response.Content.ReadAsStringAsync();
            }
            catch (HttpRequestException ex) when (attempt < retries)
            {
                _logger.LogWarning("[AI] Attempt {Attempt} failed: {Msg}. Retrying…", attempt, ex.Message);
                await Task.Delay(2000 * attempt);
            }
            catch (TaskCanceledException)
            {
                throw new TimeoutException("Python AI service timed out.");
            }
        }

        throw new HttpRequestException($"Python AI service failed after {retries} attempts.");
    }
}