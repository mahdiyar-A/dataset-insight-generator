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
        // Set the HttpClient timeout to the analyze timeout — the longest operation.
        // /check uses its own CancellationToken so it is not affected by this.
        _http.Timeout = TimeSpan.FromSeconds(
            _config.GetValue<int>("AIService:TimeoutSeconds", 360));
    }

    public async Task<string> CallPythonAiAsync(AnalyzeRequestDto request)
    {
        if (request.CsvFileBytes == null && request.CsvUrl == null)
            throw new ArgumentException("Either CsvFileBytes or CsvUrl must be provided.");

        var baseUrl = _config["AIService:BaseUrl"]
            ?? throw new InvalidOperationException("AIService:BaseUrl not configured.");

        // Do not retry analyze — if it times out, retrying would start a second
        // concurrent pipeline run. One attempt; let Python's own retry logic handle transients.
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

            content.Add(new StringContent(request.UserWantsCleaning.ToString().ToLower()), "user_wants_cleaning");
            content.Add(new StringContent(request.UserConfirmedLow.ToString().ToLower()),  "user_confirmed_low");

            var response = await _http.PostAsync($"{baseUrl}/analyze", content);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }
        catch (TaskCanceledException)
        {
            throw new TimeoutException("Python AI service timed out.");
        }
    }

    public async Task<string> CheckQualityAsync(byte[] csvBytes, string fileName, Guid sessionId)
    {
        var baseUrl = _config["AIService:BaseUrl"]
            ?? throw new InvalidOperationException("AIService:BaseUrl not configured.");

        // /check is fast (no LLM) — use its own short timeout independent of HttpClient.Timeout.
        var checkTimeout = _config.GetValue<int>("AIService:CheckTimeoutSeconds", 30);
        using var cts    = new CancellationTokenSource(TimeSpan.FromSeconds(checkTimeout));

        using var content    = new MultipartFormDataContent();
        var byteContent      = new ByteArrayContent(csvBytes);
        byteContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("text/csv");
        content.Add(byteContent, "file", fileName);
        content.Add(new StringContent(sessionId.ToString()), "session_id");

        try
        {
            var response = await _http.PostAsync($"{baseUrl}/check", content, cts.Token);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync(cts.Token);
        }
        catch (TaskCanceledException)
        {
            throw new TimeoutException("Python quality check timed out.");
        }
    }
}