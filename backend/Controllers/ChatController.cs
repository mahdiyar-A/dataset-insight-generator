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
    private readonly ReportService       _reports;
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
    // What a person may say their data is. The AI service cleans it and holds
    // it to the same length before any model sees it.
    private const int MaxDescriptionChars = 300;

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
        ReportService       reports,
        ILogger<ChatController> logger)
    {
        _analysis = analysis;
        _analyses = analyses;
        _storage  = storage;
        _users    = users;
        _pythonAi = pythonAi;
        _quota    = quota;
        _limits   = limits;
        _reports  = reports;
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

        // Check temp file exists for start_analysis / domain_answer / yes / no
        if (message is "start_analysis" or "domain_answer" or "yes" or "no" && tempPath == null)
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

            // ── Call Python /check: can it be analysed, and what is it? ───
            string condition;
            string? reason = null;
            DataReading? reading = null;
            string[]? problems = null;
            var fileName = UploadStore.Users.ReadMeta(userId)?.FileName ?? req.FileName ?? Path.GetFileName(tempPath!);
            try
            {
                var fileBytes = await System.IO.File.ReadAllBytesAsync(tempPath!);
                var checkJson = await _pythonAi.CheckQualityAsync(fileBytes, fileName, userId, withDomain: true);
                var checkResult = JsonSerializer.Deserialize<JsonElement>(checkJson);
                condition = checkResult.GetProperty("condition").GetString() ?? "not_clean";
                // Written for users by the AI service: what is wrong with the file and what to do.
                if (checkResult.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.String)
                    reason = err.GetString();
                reading = DataReading.From(checkResult);
                if (checkResult.TryGetProperty("problems", out var found) && found.ValueKind == JsonValueKind.Array)
                    problems = found.EnumerateArray()
                        .Where(p => p.ValueKind == JsonValueKind.String)
                        .Select(p => p.GetString()!.Trim())
                        .Where(p => p.Length is > 0 and <= 120)
                        .Take(4).ToArray();
            }
            catch (Exception ex)
            {
                _logger.LogWarning("[Chat] Python check failed: {Msg} — falling back to not_clean", ex.Message);
                condition = "not_clean";
            }

            if (condition == "not_workable")
                return Ok(new ChatMessageResponse
                {
                    Reply = string.IsNullOrWhiteSpace(reason)
                        ? "Your dataset cannot be processed — too sparse or missing headers. Please upload a different file."
                        : $"Your dataset cannot be processed: {reason}",
                    Condition = "not_workable", RequiresResponse = false, Done = false, Failed = true,
                });

            // Kept beside the upload: the answer to a question comes back as a
            // separate request, and the analysis reads the reading from here.
            // An earlier answer is dropped, since this is a fresh start.
            var meta = UploadStore.Users.ReadMeta(userId)
                       ?? new UploadMeta(fileName, null, null, 0, 0, Array.Empty<string>());
            UploadStore.Users.SaveMeta(userId, meta with
            {
                CheckCondition  = condition,
                DomainJson      = reading?.ClassificationJson,
                DataDescription = null,
                CheckProblems   = problems,
            });

            // Not sure what the data is: ask before anything runs. The reading
            // steers what the report leads with and sets out to answer, so a
            // wrong one costs the person the whole analysis. An AI service that
            // sent no reading at all (an older one) is not a reason to ask.
            if (reading is { Sure: false })
                return Ok(AskWhatTheDataIs(reading, condition));

            return Ok(await AfterTheReadingAsync(userId, req, condition, customizationJson, fileInfo.Length,
                                                 reading?.UnderstoodAs, problems));
        }

        // The answer to "what is this data about?": DIG's own reading confirmed,
        // another reading chosen, the person's own words, or nothing (skipped).
        if (message == "domain_answer")
        {
            var meta = UploadStore.Users.ReadMeta(userId);
            if (meta?.CheckCondition is not { } condition)
                return Ok(new ChatMessageResponse
                {
                    Reply = "I've lost track of that file's check. Please press Start again.",
                    Condition = null, RequiresResponse = false, Done = false, Failed = true,
                });

            var answer = (req.DomainAnswer ?? "").Trim();
            if (answer.Length > MaxDescriptionChars) answer = answer[..MaxDescriptionChars];
            // Confirming DIG's own reading adds nothing to say; the reading
            // itself is already stored. Only different words are a description.
            var described = req.DomainConfirmed == true || answer.Length == 0 ? null : answer;
            UploadStore.Users.SaveMeta(userId, meta with { DataDescription = described });

            string? customizationJson = null;
            if (req.Customization.HasValue && req.Customization.Value.ValueKind != JsonValueKind.Null)
            {
                try { customizationJson = req.Customization.Value.GetRawText(); }
                catch { /* ignore */ }
            }

            return Ok(await AfterTheReadingAsync(userId, req, condition, customizationJson,
                                                 new System.IO.FileInfo(tempPath!).Length, understoodAs: null,
                                                 meta.CheckProblems));
        }

        // "Proceed anyway?" answered No means do not run. It used to start the
        // analysis regardless, and a free user lost one of their two analyses.
        if (message == "no" && req.PendingCondition == "low_accuracy")
            return Ok(DeclinedLowAccuracy());

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
                AnalysisId = startedAfterAnswer.AnalysisId,
            });
        }

        return Ok(new ChatMessageResponse
        {
            Reply = "I didn't understand that. Use Start Analysis or reply Yes/No.",
            Condition = null, RequiresResponse = false, Done = false, Failed = false,
        });
    }

    /// <summary>
    /// What happens once it is settled what the data is: a clean file starts at
    /// once, and the other two conditions get their yes-or-no question.
    /// </summary>
    private async Task<ChatMessageResponse> AfterTheReadingAsync(
        Guid userId, ChatMessageRequest req, string condition, string? customizationJson,
        long fileSize, string? understoodAs, IReadOnlyList<string>? problems = null)
    {
        // Said when DIG was sure and did not ask, so the person can see what the
        // report will rest on. Never empty text: nothing is better than "".
        var saidAs = string.IsNullOrWhiteSpace(understoodAs) ? null : understoodAs;

        switch (condition)
        {
            case "not_clean":
                return new ChatMessageResponse
                {
                    // Names what was found ("2 duplicate rows, blank cells in 3
                    // columns (…)"), not the same line for every file.
                    Reply = problems is { Count: > 0 }
                        ? $"I found {string.Join(", ", problems)}. Would you like me to clean it automatically?"
                        : "Your dataset has quality issues — missing values or duplicates detected. Would you like me to clean it automatically?",
                    Condition = "not_clean", RequiresResponse = true, Done = false, Failed = false,
                    UnderstoodAs = saidAs,
                };
            case "low_accuracy":
                return new ChatMessageResponse
                {
                    Reply = "Your dataset may produce lower-accuracy insights due to limited rows. Would you like to proceed anyway?",
                    Condition = "low_accuracy", RequiresResponse = true, Done = false, Failed = false,
                    UnderstoodAs = saidAs,
                };
        }

        // all_good — kick off analysis immediately, no yes/no needed
        var started = await _analysis.TryStartAsync(userId, req.FileName ?? "data.csv",
            req.FileSizeBytes ?? fileSize,
            req.RowCount ?? 0, req.ColumnCount ?? 0,
            userWantsCleaning: false, userConfirmedLow: true,
            customizationJson: customizationJson);
        if (!started.Allowed) return Refused(started);

        return new ChatMessageResponse
        {
            Reply = "Your dataset looks great — starting full analysis now. This may take a minute.",
            Condition = "all_good", RequiresResponse = false, Done = false, Failed = false,
            AnalysisId = started.AnalysisId,
            UnderstoodAs = saidAs,
        };
    }

    /// <summary>
    /// The question asked when DIG is not sure what the data is. The choices
    /// are DIG's own reading first, then any other reading the model thought
    /// fitted; the page adds a box for the person's own words and a way to skip.
    /// </summary>
    internal static ChatMessageResponse AskWhatTheDataIs(DataReading reading, string condition)
    {
        var options = new[] { reading.UnderstoodAs }.Concat(reading.Alternatives)
            .Where(o => !string.IsNullOrWhiteSpace(o))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(3)
            .ToList();

        return new ChatMessageResponse
        {
            Reply = options.Count == 0
                ? "Before I start: what is this data about? One line is enough, for example “online orders, one row per order”."
                : "Before I start, I want to be sure what this data is about. Which of these is closest? You can also put it in your own words.",
            // The quality condition waits its turn: it is asked about after this.
            Condition = condition, RequiresResponse = true, Done = false, Failed = false,
            Ask = "domain", Options = options,
        };
    }

    /// <summary>The user chose not to run a file that may give low-accuracy results.</summary>
    internal static ChatMessageResponse DeclinedLowAccuracy() => new()
    {
        Reply = "Okay, nothing was run and your allowance is untouched. A file with more rows will give firmer results.",
        Condition = null, RequiresResponse = false, Done = false, Failed = true,
    };

    /// <summary>A refused analysis, shown in the chat in the user's own words.</summary>
    private static ChatMessageResponse Refused(Admission admission) => new()
    {
        Reply = admission.Message, Condition = null, RequiresResponse = false, Done = false, Failed = true,
        Code = admission.Code,
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
    //
    // Only the owner reaches this (the analysis is looked up by owner), so when
    // the report can be edited it goes along, and the answer may suggest
    // changes to it. The suggestion is kept here; the page gets an id and a
    // preview, and applying it is a save (ReportController "apply").
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

        var report = await _reports.EditableVersionAsync(analysis.Id);

        try
        {
            var raw = await _pythonAi.AskAsync(
                question, context, HistoryJson(req.History), UiLanguage(req.UiLanguage),
                fileBytes, fileName, report?.Document);
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;

            // The assistant could not be reached: not the user's fault, so not their allowance.
            var failed = root.TryGetProperty("failed", out var f) && f.ValueKind == JsonValueKind.True;
            if (failed)
            {
                _quota.Refund(key);
                remaining = _quota.Remaining(key, limit);
            }

            var offered = report != null && !failed && root.TryGetProperty("proposal", out var p)
                ? _reports.Offer(userId, analysis.Id, report.Version, p)
                : null;

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
                proposal          = offered == null ? null : ReportController.Proposal(offered),
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
    // With message "domain_answer": what the person said the data is. The text
    // of the choice they picked or their own words; empty when they skipped.
    [JsonPropertyName("domainAnswer")]     public string? DomainAnswer     { get; set; }
    // True when they picked DIG's own reading, so there is nothing new to tell the analysis.
    [JsonPropertyName("domainConfirmed")]  public bool?   DomainConfirmed  { get; set; }
}

/// <summary>
/// What the AI service took the data to be when the file was checked: the
/// "domain" part of its answer to /check.
/// </summary>
public sealed record DataReading(
    string UnderstoodAs, IReadOnlyList<string> Alternatives, bool Sure, string? ClassificationJson)
{
    private const int MaxPhraseChars = 160;

    /// <summary>Null when the answer carries no reading, as from an AI service that predates it.</summary>
    public static DataReading? From(JsonElement check)
    {
        if (check.ValueKind != JsonValueKind.Object
            || !check.TryGetProperty("domain", out var d) || d.ValueKind != JsonValueKind.Object)
            return null;

        static string Phrase(JsonElement e)
        {
            if (e.ValueKind != JsonValueKind.String) return "";
            var text = (e.GetString() ?? "").Trim();
            return text.Length > MaxPhraseChars ? text[..MaxPhraseChars] : text;
        }

        var understoodAs = d.TryGetProperty("understoodAs", out var u) ? Phrase(u) : "";
        var alternatives = d.TryGetProperty("alternatives", out var a) && a.ValueKind == JsonValueKind.Array
            ? a.EnumerateArray().Select(Phrase).Where(p => p.Length > 0).Take(2).ToList()
            : new List<string>();
        // Anything but a plain "true" is doubt: asking costs a click, a wrong reading costs a report.
        var sure = d.TryGetProperty("sure", out var s2) && s2.ValueKind == JsonValueKind.True;
        var classification = d.TryGetProperty("classification", out var c) && c.ValueKind == JsonValueKind.Object
            ? c.GetRawText() : null;

        return new DataReading(understoodAs, alternatives, sure, classification);
    }
}

public class ChatMessageResponse
{
    [JsonPropertyName("reply")]            public string  Reply            { get; set; } = "";
    [JsonPropertyName("condition")]        public string? Condition        { get; set; }
    [JsonPropertyName("requiresResponse")] public bool    RequiresResponse { get; set; }
    [JsonPropertyName("done")]             public bool    Done             { get; set; }
    [JsonPropertyName("failed")]           public bool    Failed           { get; set; }
    /// <summary>Why a run was refused (e.g. QUOTA_EXCEEDED), for the page to offer a way on.</summary>
    [JsonPropertyName("code")]             public string? Code             { get; set; }

    // The run this reply started. Without it the page checked a blank address
    // for as long as it stayed open and never saw the finished report.
    [JsonPropertyName("analysisId")]       public Guid?   AnalysisId       { get; set; }

    // "domain" when this reply is the question "what is this data about?".
    // The page then offers Options, a box for the person's own words and a
    // skip, and answers with message "domain_answer". Null otherwise.
    [JsonPropertyName("ask")]              public string? Ask              { get; set; }
    [JsonPropertyName("options")]          public IReadOnlyList<string>? Options { get; set; }

    // What DIG took the data to be, when it was sure and did not ask, for the
    // page to say before the reply. Null when there is nothing to say.
    [JsonPropertyName("understoodAs")]     public string? UnderstoodAs     { get; set; }
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
