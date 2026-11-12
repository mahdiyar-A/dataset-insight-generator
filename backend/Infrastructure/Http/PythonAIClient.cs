using System.Net.Http.Headers;
using System.Text.Json;
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
        // The shorter calls use their own CancellationToken so they are not affected by this.
        _http.Timeout = TimeSpan.FromSeconds(
            _config.GetValue<int>("AIService:TimeoutSeconds", 360));
    }

    private string BaseUrl => _config["AIService:BaseUrl"]
        ?? throw new InvalidOperationException("AIService:BaseUrl not configured.");

    // The uploaded file goes to Python as opaque bytes: it may be Excel,
    // Parquet or SPSS as well as CSV, and the AI service reads the content to
    // decide which. The file name still travels with it as a hint.
    private static ByteArrayContent FilePart(byte[] bytes)
    {
        var part = new ByteArrayContent(bytes);
        part.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        return part;
    }

    public async Task<string> CallPythonAiAsync(AnalyzeRequestDto request)
    {
        if (request.CsvFileBytes == null && request.CsvUrl == null)
            throw new ArgumentException("Either CsvFileBytes or CsvUrl must be provided.");

        var baseUrl = BaseUrl;

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
                content.Add(FilePart(request.CsvFileBytes), "file", request.CsvFileName ?? "data.csv");
            }
            else if (!string.IsNullOrEmpty(request.CsvUrl))
            {
                content.Add(new StringContent(request.CsvUrl), "csv_url");
            }

            content.Add(new StringContent(request.UserWantsCleaning.ToString().ToLower()), "user_wants_cleaning");
            content.Add(new StringContent(request.UserConfirmedLow.ToString().ToLower()),  "user_confirmed_low");

            // Standard customization
            content.Add(new StringContent(request.Language),                              "language");
            content.Add(new StringContent(request.Tone),                                  "tone");
            content.Add(new StringContent(request.InsightsCount.ToString()),              "insights_count");
            content.Add(new StringContent(request.Occasion),                              "occasion");
            // Deep customization
            content.Add(new StringContent(request.Audience),                              "audience");
            content.Add(new StringContent(request.Depth),                                 "depth");
            content.Add(new StringContent(request.FocusOn),                               "focus_on");
            content.Add(new StringContent(request.Comparisons),                           "comparisons");
            content.Add(new StringContent(request.MustMention),                           "must_mention");
            content.Add(new StringContent(request.ChartStyle),                            "chart_style");
            content.Add(new StringContent(request.IncludeMethodology.ToString().ToLower()),"include_methodology");
            content.Add(new StringContent(request.IncludeConfidence.ToString().ToLower()), "include_confidence");
            // The brief
            content.Add(new StringContent(request.Assumptions),                           "assumptions");
            content.Add(new StringContent(request.Avoid),                                 "avoid");
            content.Add(new StringContent(request.QuestionsJson),                         "questions_json");
            content.Add(new StringContent(request.WritingFormat),                         "writing_format");
            // Output formats
            content.Add(new StringContent(request.WantWord.ToString().ToLower()),         "want_word");
            content.Add(new StringContent(request.WantPptx.ToString().ToLower()),         "want_pptx");

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
        using var content = new MultipartFormDataContent();
        content.Add(FilePart(csvBytes), "file", fileName);
        content.Add(new StringContent(sessionId.ToString()), "session_id");

        // /check is fast (no LLM) — use its own short timeout independent of HttpClient.Timeout.
        return await PostAsync("check", content, "AIService:CheckTimeoutSeconds", 30);
    }

    public async Task<string> InspectAsync(byte[] fileBytes, string fileName)
    {
        using var content = new MultipartFormDataContent();
        content.Add(FilePart(fileBytes), "file", fileName);
        // Reads the whole file once; a 50 MB CSV takes seconds on the server.
        return await PostAsync("inspect", content, "AIService:InspectTimeoutSeconds", 60);
    }

    public async Task<string> BriefAsync(string text, IReadOnlyList<string> columns, string uiLanguage)
    {
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(text),                            "text");
        content.Add(new StringContent(JsonSerializer.Serialize(columns)), "columns_json");
        content.Add(new StringContent(uiLanguage),                      "ui_language");
        // The AI service gives the models 35 seconds in total.
        return await PostAsync("brief", content, "AIService:BriefTimeoutSeconds", 45);
    }

    public async Task<string> AskAsync(string question, string contextJson, string historyJson, string uiLanguage,
                                       byte[]? fileBytes, string? fileName)
    {
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(question),    "question");
        content.Add(new StringContent(contextJson), "context_json");
        content.Add(new StringContent(historyJson), "history_json");
        content.Add(new StringContent(uiLanguage),  "ui_language");
        if (fileBytes is { Length: > 0 })
            content.Add(FilePart(fileBytes), "file", fileName ?? "data.csv");
        // The AI service gives the models 50 seconds in total.
        return await PostAsync("ask", content, "AIService:AskTimeoutSeconds", 70);
    }

    public async Task<string> ModelStatusAsync()
    {
        // The AI service reads two providers' model lists, 20 seconds each at worst.
        using var cts = new CancellationTokenSource(
            TimeSpan.FromSeconds(_config.GetValue("AIService:ModelStatusTimeoutSeconds", 60)));
        try
        {
            var response = await _http.GetAsync($"{BaseUrl}/models/status", cts.Token);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync(cts.Token);
        }
        catch (TaskCanceledException)
        {
            _logger.LogWarning("[PythonAI] /models/status timed out");
            throw new TimeoutException("Python /models/status timed out.");
        }
    }

    private async Task<string> PostAsync(string endpoint, HttpContent content, string timeoutKey, int defaultSeconds)
    {
        var url = $"{BaseUrl}/{endpoint}";
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(_config.GetValue(timeoutKey, defaultSeconds)));
        try
        {
            var response = await _http.PostAsync(url, content, cts.Token);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync(cts.Token);
        }
        catch (TaskCanceledException)
        {
            _logger.LogWarning("[PythonAI] /{Endpoint} timed out", endpoint);
            throw new TimeoutException($"Python /{endpoint} timed out.");
        }
    }
}
