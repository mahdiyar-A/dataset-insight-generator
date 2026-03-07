using backend.Application.Interfaces;
using backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Text.Json.Serialization;

namespace backend.Controllers;

[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly IDatasetRepository _datasets;
    private readonly AnalysisService    _analysis;
    private readonly IPythonAiClient    _pythonAi;
    private readonly ILogger<ChatController> _logger;

    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_uploads");

    public ChatController(IDatasetRepository datasets, AnalysisService analysis, IPythonAiClient pythonAi, ILogger<ChatController> logger)
    {
        _datasets = datasets;
        _analysis = analysis;
        _pythonAi = pythonAi;
        _logger   = logger;
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var id))
            throw new UnauthorizedAccessException("Missing user id claim");
        return id;
    }

    [HttpGet("history")]
    public IActionResult GetHistory() => Ok(Array.Empty<object>());

    [HttpPost("message")]
    public async Task<IActionResult> SendMessage([FromBody] ChatMessageRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Message))
            return BadRequest(new { error = "EMPTY_MESSAGE" });

        var userId   = GetUserId();
        var tempPath = Path.Combine(TempDir, $"{userId}.csv");
        var message  = req.Message.Trim().ToLowerInvariant();

        // Check temp file exists for start_analysis / yes / no
        if ((message == "start_analysis" || message == "yes" || message == "no")
            && !System.IO.File.Exists(tempPath))
        {
            return Ok(new ChatMessageResponse
            {
                Reply = "No dataset found. Please upload a CSV file first.",
                Condition = null, RequiresResponse = false, Done = false, Failed = true,
            });
        }

        if (message == "start_analysis")
        {
            var fileInfo = new System.IO.FileInfo(tempPath);

            if (fileInfo.Length > 50 * 1024 * 1024)
                return Ok(new ChatMessageResponse
                {
                    Reply = "Your dataset exceeds the 50MB size limit.",
                    Condition = "not_workable", RequiresResponse = false, Done = false, Failed = true,
                });

            // ── Call Python /check to get real condition ──────────────────
            string condition;
            try
            {
                var csvBytes = await System.IO.File.ReadAllBytesAsync(tempPath);
                var checkJson = await _pythonAi.CheckQualityAsync(csvBytes, req.FileName ?? "data.csv", userId);
                var checkResult = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(checkJson);
                condition = checkResult.GetProperty("condition").GetString() ?? "not_clean";
            }
            catch (Exception ex)
            {
                _logger.LogWarning("[Chat] Python check failed: {Msg} — falling back to not_clean", ex.Message);
                condition = "not_clean";
            }

            // If all_good — kick off analysis immediately, no yes/no needed
            if (condition == "all_good")
            {
                _analysis.StartInBackground(userId, req.FileName ?? "data.csv",
                    req.FileSizeBytes ?? new System.IO.FileInfo(tempPath).Length,
                    req.RowCount ?? 0, req.ColumnCount ?? 0,
                    userWantsCleaning: false, userConfirmedLow: true);
            }

            return Ok(condition switch
            {
                "not_workable" => new ChatMessageResponse
                {
                    Reply = "Your dataset cannot be processed — too sparse or missing headers. Please upload a different file.",
                    Condition = "not_workable", RequiresResponse = false, Done = false, Failed = true,
                },
                "not_clean" => new ChatMessageResponse
                {
                    Reply = "Your dataset has quality issues — missing values or duplicates detected. Would you like me to clean it automatically?",
                    Condition = "not_clean", RequiresResponse = true, Done = false, Failed = false,
                },
                "low_accuracy" => new ChatMessageResponse
                {
                    Reply = "Your dataset may produce lower-accuracy insights due to limited rows. Would you like to proceed anyway?",
                    Condition = "low_accuracy", RequiresResponse = true, Done = false, Failed = false,
                },
                _ => new ChatMessageResponse
                {
                    Reply = "Your dataset looks great — starting full analysis now. This may take a minute.",
                    Condition = "all_good", RequiresResponse = false, Done = false, Failed = false,
                },
            });
        }

        if (message == "yes" || message == "no")
        {
            var reply = message == "yes"
                ? "Running the full analysis pipeline now. Your report and charts will appear when done."
                : "Skipping that step and running analysis as-is. Results will appear shortly.";

            // Determine which flag to set based on what question was asked
            // Frontend passes condition so we know what yes/no was answering
            bool userWantsCleaning = message == "yes" && req.PendingCondition == "not_clean";
            bool userConfirmedLow  = message == "yes" && req.PendingCondition == "low_accuracy";

            // If no condition was pending (all_good) and user said yes → just proceed
            if (req.PendingCondition == "all_good" || req.PendingCondition == null)
            {
                userWantsCleaning = false;
                userConfirmedLow  = true; // no confirmation needed, just proceed
            }

            _analysis.StartInBackground(
                userId,
                req.FileName      ?? "data.csv",
                req.FileSizeBytes ?? new System.IO.FileInfo(tempPath).Length,
                req.RowCount      ?? 0,
                req.ColumnCount   ?? 0,
                userWantsCleaning,
                userConfirmedLow
            );

            return Ok(new ChatMessageResponse
            {
                Reply = reply, Condition = null, RequiresResponse = false, Done = false, Failed = false,
            });
        }

        return Ok(new ChatMessageResponse
        {
            Reply = "I didn't understand that. Use Start Analysis or reply Yes/No.",
            Condition = null, RequiresResponse = false, Done = false, Failed = false,
        });
    }

}

public class ChatMessageRequest
{
    [JsonPropertyName("message")]          public string  Message          { get; set; } = "";
    [JsonPropertyName("fileName")]         public string? FileName         { get; set; }
    [JsonPropertyName("fileSizeBytes")]    public long?   FileSizeBytes    { get; set; }
    [JsonPropertyName("rowCount")]         public int?    RowCount         { get; set; }
    [JsonPropertyName("columnCount")]      public int?    ColumnCount      { get; set; }
    // What condition the chatbot was displaying when user hit Yes/No
    [JsonPropertyName("pendingCondition")] public string? PendingCondition { get; set; }
}

public class ChatMessageResponse
{
    [JsonPropertyName("reply")]            public string  Reply            { get; set; } = "";
    [JsonPropertyName("condition")]        public string? Condition        { get; set; }
    [JsonPropertyName("requiresResponse")] public bool    RequiresResponse { get; set; }
    [JsonPropertyName("done")]             public bool    Done             { get; set; }
    [JsonPropertyName("failed")]           public bool    Failed           { get; set; }
}