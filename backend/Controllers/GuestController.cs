using backend.Application.DTOs.AI;
using backend.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Serialization;

namespace backend.Controllers;

/// <summary>
/// Guest endpoints — identical pipeline to authenticated users,
/// but NO database writes and NO Supabase storage.
/// Results are returned directly in the response for in-memory browser storage.
/// </summary>
[ApiController]
[Route("api/guest")]
public class GuestController : ControllerBase
{
    private readonly IPythonAiClient _pythonAi;
    private readonly ILogger<GuestController> _logger;

    // Strip newlines/control chars from user-supplied values before logging (log injection prevention)
    private static string S(string? val) =>
        val is null ? "(null)" : val.Replace("\r", "").Replace("\n", "").Replace("\t", "");

    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_guest");

    public GuestController(IPythonAiClient pythonAi, ILogger<GuestController> logger)
    {
        _pythonAi = pythonAi;
        _logger   = logger;
        Directory.CreateDirectory(TempDir);
    }

    // ── POST /api/guest/upload ────────────────────────────────────────────
    // Saves CSV to server temp keyed by sessionId — no DB
    [HttpPost("upload")]
    [RequestSizeLimit(52_428_800)]
    public async Task<IActionResult> Upload(
        [FromForm] IFormFile file,
        [FromForm] string    sessionId,
        [FromForm] int?      rows,
        [FromForm] int?      columns)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "NO_FILE" });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".csv" && ext != ".xlsx")
            return BadRequest(new { error = "INVALID_TYPE", message = "Only .csv and .xlsx files are accepted." });

        if (file.Length > 50 * 1024 * 1024)
            return BadRequest(new { error = "TOO_LARGE" });

        if (string.IsNullOrWhiteSpace(sessionId))
            return BadRequest(new { error = "NO_SESSION" });

        var tempPath = Path.Combine(TempDir, $"{sessionId}{ext}");

        using (var stream = System.IO.File.Create(tempPath))
            await file.CopyToAsync(stream);

        int rowCount = rows ?? 0, colCount = columns ?? 0;
        if (!rows.HasValue || !columns.HasValue)
        {
            var lines = System.IO.File.ReadAllLines(tempPath)
                            .Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
            rowCount = Math.Max(0, lines.Length - 1);
            colCount = lines.Length > 0 ? lines[0].Split(',').Length : 0;
        }

        return Ok(new
        {
            sessionId,
            fileName      = file.FileName,
            fileSizeBytes = file.Length,
            rowCount,
            columnCount   = colCount,
            isPending     = true,
        });
    }

    // ── POST /api/guest/chat ──────────────────────────────────────────────
    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] GuestChatRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Message))
            return BadRequest(new { error = "EMPTY_MESSAGE" });

        var message = req.Message.Trim().ToLowerInvariant();

        // Check temp file exists for all analysis messages
        var tempPath = FindTempFile(req.SessionId);
        if ((message == "start_analysis" || message == "yes" || message == "no") && tempPath == null)
            return Ok(new GuestChatResponse
            {
                Reply = "No dataset found. Please upload a CSV file first.",
                Condition = null, RequiresResponse = false, Done = false, Failed = true,
            });

        // ── start_analysis: call Python /check for REAL condition ─────────
        if (message == "start_analysis")
        {
            try
            {
                var csvBytes  = await System.IO.File.ReadAllBytesAsync(tempPath!);
                var sessionId = Guid.TryParse(req.SessionId, out var g) ? g : Guid.NewGuid();
                var fileName  = req.FileName ?? "data.csv";

                var checkJson = await _pythonAi.CheckQualityAsync(csvBytes, fileName, sessionId);
                var check     = System.Text.Json.JsonSerializer.Deserialize<CheckResponse>(
                    checkJson, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                var condition = check?.Condition ?? "all_good";

                // all_good → fire analysis immediately, no yes/no needed
                if (condition == "all_good")
                {
                    _ = Task.Run(() => RunGuestAnalysisAsync(
                        req.SessionId ?? "guest", tempPath!, fileName, false, true));

                    return Ok(new GuestChatResponse
                    {
                        Reply = "Your dataset looks great — starting full analysis now. This may take a minute.",
                        Condition = "all_good", RequiresResponse = false, Done = false, Failed = false,
                    });
                }

                return Ok(condition switch
                {
                    "not_workable" => new GuestChatResponse
                    {
                        Reply = "Your dataset cannot be processed — it may be too sparse or missing headers.",
                        Condition = "not_workable", RequiresResponse = false, Done = false, Failed = true,
                    },
                    "not_clean" => new GuestChatResponse
                    {
                        Reply = "Your dataset has quality issues — missing values or duplicates detected. Would you like me to clean it automatically?",
                        Condition = "not_clean", RequiresResponse = true, Done = false, Failed = false,
                    },
                    "low_accuracy" => new GuestChatResponse
                    {
                        Reply = "Your dataset may produce lower-accuracy insights due to limited data. Would you like to proceed anyway?",
                        Condition = "low_accuracy", RequiresResponse = true, Done = false, Failed = false,
                    },
                    _ => new GuestChatResponse
                    {
                        Reply = "Your dataset looks great — starting full analysis now. This may take a minute.",
                        Condition = "all_good", RequiresResponse = false, Done = false, Failed = false,
                    },
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Guest] Python check failed for session {SessionId}", S(req.SessionId));
                return Ok(new GuestChatResponse
                {
                    Reply = "Could not reach the analysis service. Please make sure it is running.",
                    Condition = null, RequiresResponse = false, Done = false, Failed = true,
                });
            }
        }

        // ── yes/no: user responded to not_clean or low_accuracy ──────────
        if (message == "yes" || message == "no")
        {
            bool userWantsCleaning = message == "yes" && req.PendingCondition == "not_clean";
            bool userConfirmedLow  = message == "yes" && req.PendingCondition == "low_accuracy";

            if (message == "no" && req.PendingCondition == "not_clean")
            {
                // User declined cleaning — still run analysis on raw data
                userWantsCleaning = false;
                userConfirmedLow  = true;
            }

            _ = Task.Run(() => RunGuestAnalysisAsync(
                req.SessionId ?? "guest", tempPath!,
                req.FileName ?? "data.csv",
                userWantsCleaning, userConfirmedLow
            ));

            var reply = message == "yes"
                ? "Running the full analysis pipeline now. Your report and charts will appear when done."
                : "Running analysis on the original data. Results will appear shortly.";

            return Ok(new GuestChatResponse
            {
                Reply = reply, Condition = null, RequiresResponse = false, Done = false, Failed = false,
            });
        }

        return Ok(new GuestChatResponse
        {
            Reply = "I didn't understand that. Use Start Analysis or reply Yes/No.",
            Condition = null, RequiresResponse = false, Done = false, Failed = false,
        });
    }

    // Helper DTO for Python /check response
    private class CheckResponse
    {
        public string Condition { get; set; } = "all_good";
        public string? Error    { get; set; }
    }

    // ── GET /api/guest/status/{sessionId} ────────────────────────────────
    // Frontend polls this — returns "pending" | "done" | "failed"
    // When done — returns full result (pdf, charts, cleanedCsv) in one shot
    [HttpGet("status/{sessionId}")]
    public IActionResult GetStatus(string sessionId)
    {
        GuestResult? result;
        lock (_guestResults) { _guestResults.TryGetValue(sessionId, out result); }
        if (result != null)
        {
            return Ok(new
            {
                status           = result.Status,
                condition        = result.Condition,
                error            = result.Error,
                pdfReportBase64  = result.PdfBase64,
                cleanedCsvBase64 = result.CleanedCsvBase64,
                charts           = result.Charts,
            });
        }

        // Check if still processing
        bool processing; lock (_guestProcessing) { processing = _guestProcessing.Contains(sessionId); }
        if (processing)
            return Ok(new { status = "processing" });

        return Ok(new { status = "pending" });
    }

    // ── In-memory store for guest results (cleared after 1 hour) ─────────
    private static readonly Dictionary<string, GuestResult> _guestResults    = new();
    private static readonly HashSet<string>                 _guestProcessing = new();

    private async Task RunGuestAnalysisAsync(
        string sessionId, string tempPath, string fileName,
        bool userWantsCleaning, bool userConfirmedLow)
    {
        lock (_guestProcessing) { _guestProcessing.Add(sessionId); }

        try
        {
            var csvBytes = await System.IO.File.ReadAllBytesAsync(tempPath);

            using var content  = new MultipartFormDataContent();
            var fileContent    = new ByteArrayContent(csvBytes);
            fileContent.Headers.ContentType =
                new System.Net.Http.Headers.MediaTypeHeaderValue("text/csv");
            content.Add(fileContent, "file", fileName);
            content.Add(new StringContent(sessionId),                              "session_id");
            content.Add(new StringContent(userWantsCleaning.ToString().ToLower()), "user_wants_cleaning");
            content.Add(new StringContent(userConfirmedLow.ToString().ToLower()),  "user_confirmed_low");

            var rawJson = await _pythonAi.CallPythonAiAsync(new AnalyzeRequestDto
            {
                SessionId           = Guid.TryParse(sessionId, out var g) ? g : Guid.NewGuid(),
                CsvFileBytes        = csvBytes,
                CsvFileName         = fileName,
                UserWantsCleaning   = userWantsCleaning,
                UserConfirmedLow    = userConfirmedLow,
            });

            var response = System.Text.Json.JsonSerializer.Deserialize<
                backend.Application.DTOs.AI.AnalyzeResponseDto>(rawJson,
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            lock (_guestResults)
            {
                _guestResults[sessionId] = new GuestResult
                {
                    Status           = response?.Status ?? "failed",
                    Condition        = response?.Condition ?? "not_workable",
                    Error            = response?.Error,
                    PdfBase64        = response?.PdfReportBase64,
                    CleanedCsvBase64 = response?.CleanedCsvBase64,
                    Charts           = response?.Charts ?? new(),
                    CreatedAt        = DateTime.UtcNow,
                };
            }

            // Clean up temp file
            try { System.IO.File.Delete(tempPath); } catch { }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Guest] Analysis failed for session {SessionId}", S(sessionId));
            lock (_guestResults)
            {
                _guestResults[sessionId] = new GuestResult
                {
                    Status = "failed", Condition = "not_workable",
                    Error  = "Analysis failed — please try again.",
                    Charts = new(), CreatedAt = DateTime.UtcNow,
                };
            }
        }
        finally
        {
            lock (_guestProcessing) { _guestProcessing.Remove(sessionId); }

            // Clean up results older than 1 hour
            var cutoff = DateTime.UtcNow.AddHours(-1);
            lock (_guestResults)
            {
                var old = _guestResults.Where(kv => kv.Value.CreatedAt < cutoff)
                                       .Select(kv => kv.Key).ToList();
                foreach (var k in old) _guestResults.Remove(k);
            }
        }
    }

    private string? FindTempFile(string? sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return null;
        foreach (var ext in new[] { ".csv", ".xlsx" })
        {
            var p = Path.Combine(TempDir, $"{sessionId}{ext}");
            if (System.IO.File.Exists(p)) return p;
        }
        return null;
    }

}

// ── DTOs ──────────────────────────────────────────────────────────────────

public class GuestChatRequest
{
    [JsonPropertyName("message")]          public string  Message          { get; set; } = "";
    [JsonPropertyName("sessionId")]        public string? SessionId        { get; set; }
    [JsonPropertyName("fileName")]         public string? FileName         { get; set; }
    [JsonPropertyName("fileSizeBytes")]    public long?   FileSizeBytes    { get; set; }
    [JsonPropertyName("rowCount")]         public int?    RowCount         { get; set; }
    [JsonPropertyName("columnCount")]      public int?    ColumnCount      { get; set; }
    [JsonPropertyName("pendingCondition")] public string? PendingCondition { get; set; }
}

public class GuestChatResponse
{
    [JsonPropertyName("reply")]            public string  Reply            { get; set; } = "";
    [JsonPropertyName("condition")]        public string? Condition        { get; set; }
    [JsonPropertyName("requiresResponse")] public bool    RequiresResponse { get; set; }
    [JsonPropertyName("done")]             public bool    Done             { get; set; }
    [JsonPropertyName("failed")]           public bool    Failed           { get; set; }
}

public class GuestResult
{
    public string  Status           { get; set; } = "pending";
    public string? Condition        { get; set; }
    public string? Error            { get; set; }
    public string? PdfBase64        { get; set; }
    public string? CleanedCsvBase64 { get; set; }
    public List<backend.Application.DTOs.AI.ChartResultDto> Charts { get; set; } = new();
    public DateTime CreatedAt       { get; set; }
}