using backend.Application.Interfaces;
using backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace backend.Controllers;

[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly AnalysisService     _analysis;
    private readonly IAnalysisRepository _analyses;
    private readonly IStorageService     _storage;
    private readonly IUserRepository     _users;
    private readonly IPythonAiClient     _pythonAi;
    private readonly ChatQuota           _quota;
    private readonly ChatLimits          _limits;
    private readonly ILogger<ChatController> _logger;

    // A question carries the analysed file only up to this size, so the
    // assistant can query the data itself. Above it, answers come from the
    // analysis alone: reading a large file again for every question would cost
    // the AI service more memory than one answer is worth.
    private const long MaxFileForQuestions = 20L * 1024 * 1024;

    // Generous ceilings that only stop abuse. The AI service applies its own,
    // tighter limits to what reaches a model.
    private const int MaxQuestionChars = 1000;
    private const int MaxBriefChars    = 3000;
    private const int MaxHistoryTurns  = 6;
    private const int MaxHistoryChars  = 2000;

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();
    private static readonly JsonElement EmptyArray  = JsonDocument.Parse("[]").RootElement.Clone();

    public ChatController(
        AnalysisService     analysis,
        IAnalysisRepository analyses,
        IStorageService     storage,
        IUserRepository     users,
        IPythonAiClient     pythonAi,
        ChatQuota           quota,
        ChatLimits          limits,
        ILogger<ChatController> logger)
    {
        _analysis = analysis;
        _analyses = analyses;
        _storage  = storage;
        _users    = users;
        _pythonAi = pythonAi;
        _quota    = quota;
        _limits   = limits;
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
        var tempPath = UploadStore.Users.Find(userId);
        var message  = req.Message.Trim().ToLowerInvariant();

        // Check temp file exists for start_analysis / yes / no
        if ((message == "start_analysis" || message == "yes" || message == "no") && tempPath == null)
        {
            return Ok(new ChatMessageResponse
            {
                Reply = "No dataset found. Please upload a data file first.",
                Condition = null, RequiresResponse = false, Done = false, Failed = true,
            });
        }

        if (message == "start_analysis")
        {
            var fileInfo = new System.IO.FileInfo(tempPath!);

            if (fileInfo.Length > FileFormats.MaxUploadBytes)
                return Ok(new ChatMessageResponse
                {
                    Reply = "Your dataset exceeds the 50MB size limit.",
                    Condition = "not_workable", RequiresResponse = false, Done = false, Failed = true,
                });

            // Refuse before running a quality check on an analysis that could not
            // start anyway: plan allowance used up, one already running, or busy.
            var precheck = await _analysis.CheckAsync(userId);
            if (!precheck.Allowed) return Ok(Refused(precheck));

            // Serialize customization to JSON string for storage + forwarding to pipeline
            string? customizationJson = null;
            if (req.Customization.HasValue && req.Customization.Value.ValueKind != JsonValueKind.Null)
            {
                try { customizationJson = req.Customization.Value.GetRawText(); }
                catch { /* ignore malformed customization — pipeline uses defaults */ }
            }

            // ── Call Python /check to get real condition ──────────────────
            string condition;
            string? reason = null;
            try
            {
                var fileBytes = await System.IO.File.ReadAllBytesAsync(tempPath!);
                var fileName  = UploadStore.Users.ReadMeta(userId)?.FileName ?? req.FileName ?? Path.GetFileName(tempPath!);
                var checkJson = await _pythonAi.CheckQualityAsync(fileBytes, fileName, userId);
                var checkResult = JsonSerializer.Deserialize<JsonElement>(checkJson);
                condition = checkResult.GetProperty("condition").GetString() ?? "not_clean";
                // Written for users by the AI service: what is wrong with the file and what to do.
                if (checkResult.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.String)
                    reason = err.GetString();
            }
            catch (Exception ex)
            {
                _logger.LogWarning("[Chat] Python check failed: {Msg} — falling back to not_clean", ex.Message);
                condition = "not_clean";
            }

            // If all_good — kick off analysis immediately, no yes/no needed
            if (condition == "all_good")
            {
                var started = await _analysis.TryStartAsync(userId, req.FileName ?? "data.csv",
                    req.FileSizeBytes ?? fileInfo.Length,
                    req.RowCount ?? 0, req.ColumnCount ?? 0,
                    userWantsCleaning: false, userConfirmedLow: true,
                    customizationJson: customizationJson);
                if (!started.Allowed) return Ok(Refused(started));
            }

            return Ok(condition switch
            {
                "not_workable" => new ChatMessageResponse
                {
                    Reply = string.IsNullOrWhiteSpace(reason)
                        ? "Your dataset cannot be processed — too sparse or missing headers. Please upload a different file."
                        : $"Your dataset cannot be processed: {reason}",
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

            // Recover customization JSON passed through from the frontend
            string? customizationJson = null;
            if (req.Customization.HasValue && req.Customization.Value.ValueKind != JsonValueKind.Null)
            {
                try { customizationJson = req.Customization.Value.GetRawText(); }
                catch { /* ignore */ }
            }

            var startedAfterAnswer = await _analysis.TryStartAsync(
                userId,
                req.FileName      ?? "data.csv",
                req.FileSizeBytes ?? new System.IO.FileInfo(tempPath!).Length,
                req.RowCount      ?? 0,
                req.ColumnCount   ?? 0,
                userWantsCleaning,
                userConfirmedLow,
                customizationJson: customizationJson
            );
            if (!startedAfterAnswer.Allowed) return Ok(Refused(startedAfterAnswer));

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

    /// <summary>A refused analysis, shown in the chat in the user's own words.</summary>
    private static ChatMessageResponse Refused(Admission admission) => new()
    {
        Reply = admission.Message, Condition = null, RequiresResponse = false, Done = false, Failed = true,
    };

    // ── POST /api/chat/brief ──────────────────────────────────────────────────
    // Before an analysis: the user describes the report they want in their own
    // words, and gets back settings for the customization panel. Nothing runs
    // until they review the panel and press Start. Customization is a Pro
    // feature, and so is this.
    [HttpPost("brief")]
    public async Task<IActionResult> Brief([FromBody] ChatBriefRequest req)
    {
        var text = req.Text?.Trim() ?? "";
        if (text.Length == 0)
            return BadRequest(new { error = "EMPTY_MESSAGE", message = "Describe the report you'd like." });
        if (text.Length > MaxBriefChars)
            return BadRequest(new { error = "TOO_LONG", message = $"Please keep it under {MaxBriefChars} characters." });

        var userId = GetUserId();
        var user   = await _users.GetByIdAsync(userId);
        if (user?.Plan is not ("pro" or "admin"))
            return StatusCode(403, new
            {
                error   = "PRO_ONLY",
                message = "Describing your report in your own words is part of Pro, with the rest of the report customization.",
            });

        var key = $"brief:{userId}";
        if (!_quota.TryTake(key, _limits.BriefsPerDay, out var remaining))
            return StatusCode(429, new
            {
                error   = "CHAT_LIMIT",
                message = $"You've used today's {_limits.BriefsPerDay} report descriptions. The panel still works as usual.",
            });

        // The upload's columns let the assistant say "there is no 'region'
        // column" instead of promising a focus the data cannot support.
        var columns = UploadStore.Users.ReadMeta(userId)?.Headers ?? Array.Empty<string>();

        try
        {
            var raw = await _pythonAi.BriefAsync(text, columns.Take(200).ToList(), UiLanguage(req.UiLanguage));
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            return Ok(new
            {
                settings    = root.TryGetProperty("settings", out var s) && s.ValueKind == JsonValueKind.Object
                                  ? s.Clone() : EmptyObject,
                summary     = Text(root, "summary") ?? "",
                notPossible = root.TryGetProperty("notPossible", out var n) && n.ValueKind == JsonValueKind.Array
                                  ? n.Clone() : EmptyArray,
                source      = Text(root, "source") ?? "model",
                remaining,
            });
        }
        catch (Exception ex)
        {
            _quota.Refund(key);
            _logger.LogWarning("[Chat] Brief failed ({Type}: {Msg})", ex.GetType().Name, ex.Message);
            return StatusCode(503, new
            {
                error   = "ASSISTANT_UNAVAILABLE",
                message = "The assistant couldn't be reached just now. You can still set everything in the panel.",
            });
        }
    }

    // ── POST /api/chat/ask ────────────────────────────────────────────────────
    // After an analysis: a question about it, answered from what the report was
    // written from and, for files up to 20 MB, queries on the data itself. The
    // assistant is bounded by the AI service (llm/harness.py): it answers about
    // this analysis only and never runs code. This side meters it per day.
    [HttpPost("ask")]
    public async Task<IActionResult> Ask([FromBody] ChatAskRequest req)
    {
        var question = req.Question?.Trim() ?? "";
        if (question.Length == 0)
            return BadRequest(new { error = "EMPTY_MESSAGE", message = "Type a question about the analysis." });
        if (question.Length > MaxQuestionChars)
            return BadRequest(new { error = "TOO_LONG", message = $"Please keep questions under {MaxQuestionChars} characters." });

        var userId   = GetUserId();
        var analysis = await _analyses.GetByIdAsync(req.AnalysisId, userId);
        if (analysis == null)
            return NotFound(new { error = "NOT_FOUND", message = "That analysis wasn't found." });
        if (analysis.Status != "done")
            return Conflict(new { error = "NOT_READY", message = "Questions open once the analysis has finished." });

        var context = await _storage.ReadChatContextAsync(userId, analysis.Id);
        if (string.IsNullOrWhiteSpace(context))
            return Conflict(new
            {
                error   = "NO_CHAT_CONTEXT",
                message = "This analysis was made before questions were available. Run it again to ask about it.",
            });

        var user  = await _users.GetByIdAsync(userId);
        var limit = _limits.QuestionsPerDay(user?.Plan);
        var key   = $"ask:{userId}";
        if (!_quota.TryTake(key, limit, out var remaining))
            return StatusCode(429, new
            {
                error   = "CHAT_LIMIT",
                message = user?.Plan is "pro" or "admin"
                    ? $"You've asked today's {limit} questions. The allowance resets at midnight UTC."
                    : $"The free plan includes {limit} questions a day, and you've used them. Upgrade to Pro for more.",
                limit,
            });

        // Questions read the data the report read, so a total here matches the
        // total there. Cleaning can remove duplicates and cap extreme values.
        var (path, fileName) = AnalysisFiles.Find(analysis, analysis.CleanedCsvPath != null ? "cleaned" : "original");
        byte[]? fileBytes = null;
        if (path != null && analysis.FileSizeBytes is > 0 and <= MaxFileForQuestions)
        {
            fileBytes = await _storage.DownloadAsync(path);
            if (fileBytes?.Length > MaxFileForQuestions) fileBytes = null;   // a CSV can outgrow a compressed upload
        }

        try
        {
            var raw = await _pythonAi.AskAsync(
                question, context, HistoryJson(req.History), UiLanguage(req.UiLanguage),
                fileBytes, fileName);
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;

            // The assistant could not be reached: not the user's fault, so not their allowance.
            var failed = root.TryGetProperty("failed", out var f) && f.ValueKind == JsonValueKind.True;
            if (failed)
            {
                _quota.Refund(key);
                remaining = _quota.Remaining(key, limit);
            }

            return Ok(new
            {
                answer            = Text(root, "answer") ?? "",
                refused           = root.TryGetProperty("refused", out var r) && r.ValueKind == JsonValueKind.True,
                failed,
                grounding         = Text(root, "grounding") ?? "analysis",
                unverifiedNumbers = root.TryGetProperty("unverifiedNumbers", out var u) && u.ValueKind == JsonValueKind.Array
                                        ? u.Clone() : EmptyArray,
                queries           = root.TryGetProperty("queries", out var q) && q.ValueKind == JsonValueKind.Array
                                        ? q.Clone() : EmptyArray,
                remaining,
                limit,
            });
        }
        catch (Exception ex)
        {
            _quota.Refund(key);
            _logger.LogWarning("[Chat] Ask failed for analysis {Id} ({Type}: {Msg})",
                analysis.Id, ex.GetType().Name, ex.Message);
            return StatusCode(503, new
            {
                error   = "ASSISTANT_UNAVAILABLE",
                message = "The assistant couldn't be reached just now. Please try again in a minute.",
            });
        }
    }

    private static string? Text(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static string UiLanguage(string? lang) =>
        string.IsNullOrWhiteSpace(lang) ? "en" : lang.Trim().ToLowerInvariant()[..Math.Min(5, lang.Trim().Length)];

    /// <summary>The last few turns, re-serialised with only the two fields the AI service reads.</summary>
    private static string HistoryJson(List<ChatTurn>? history)
    {
        var turns = (history ?? new())
            .Where(t => t.Role is "user" or "assistant" && !string.IsNullOrWhiteSpace(t.Content))
            .TakeLast(MaxHistoryTurns)
            .Select(t => new { role = t.Role, content = t.Content!.Length > MaxHistoryChars ? t.Content[..MaxHistoryChars] : t.Content });
        return JsonSerializer.Serialize(turns);
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
    // Analysis ID — sent by the frontend when referencing an existing analysis row
    [JsonPropertyName("analysisId")]       public string? AnalysisId       { get; set; }
    // Pro customization settings from ChatCustomizationPanel
    // Stored as raw JSON so we can pass it straight to the pipeline and the Analysis entity
    [JsonPropertyName("customization")]    public JsonElement? Customization { get; set; }
}

public class ChatMessageResponse
{
    [JsonPropertyName("reply")]            public string  Reply            { get; set; } = "";
    [JsonPropertyName("condition")]        public string? Condition        { get; set; }
    [JsonPropertyName("requiresResponse")] public bool    RequiresResponse { get; set; }
    [JsonPropertyName("done")]             public bool    Done             { get; set; }
    [JsonPropertyName("failed")]           public bool    Failed           { get; set; }
}

public class ChatBriefRequest
{
    [JsonPropertyName("text")]       public string? Text       { get; set; }
    [JsonPropertyName("uiLanguage")] public string? UiLanguage { get; set; }
}

public class ChatAskRequest
{
    [JsonPropertyName("analysisId")] public Guid            AnalysisId { get; set; }
    [JsonPropertyName("question")]   public string?         Question   { get; set; }
    [JsonPropertyName("history")]    public List<ChatTurn>? History    { get; set; }
    [JsonPropertyName("uiLanguage")] public string?         UiLanguage { get; set; }
}

public class ChatTurn
{
    [JsonPropertyName("role")]    public string? Role    { get; set; }
    [JsonPropertyName("content")] public string? Content { get; set; }
}
