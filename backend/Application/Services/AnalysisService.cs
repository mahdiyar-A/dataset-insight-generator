using System.Text.Json;
using backend.Application.DTOs.AI;
using backend.Application.Interfaces;
using backend.Domain.Entities;

namespace backend.Application.Services;

/// <summary>
/// Orchestrates the full analysis pipeline for authenticated users.
///
/// Flow:
///   1. Read the file the user uploaded earlier (any format in FileFormats)
///   2. Create an Analysis row (pending) so the frontend can poll status immediately
///   3. Store any Pro customization JSON on the Analysis entity
///   4. Send the file + customization to the Python AI service (8-phase pipeline)
///   5. Save all outputs (original file, cleaned CSV, PDF, Word, PPTX, charts,
///      chat context) to Supabase Storage
///   6. Update the Analysis row with final status + storage paths
///
/// TryStartAsync() admits the run through AnalysisGate, then fires-and-forgets so
/// the HTTP request to /api/chat/message returns immediately and the frontend
/// polls /api/analyses/active for status.
///
/// Uses IAnalysisRepository (not the old IDatasetRepository) — each analysis run
/// is a separate row; users keep up to 5 (free) or 15 (pro) in history.
/// </summary>
public class AnalysisService
{
    private readonly IAnalysisRepository      _analyses;
    private readonly IStorageService          _storage;
    private readonly IPythonAiClient          _pythonAi;
    private readonly IUserRepository          _users;
    private readonly AnalysisGate             _gate;
    private readonly ILogger<AnalysisService> _logger;
    private readonly OwnerAlerts?             _alerts;

    // Where uploads wait until their analysis runs. See UploadStore.
    private static UploadStore Uploads => UploadStore.Users;

    public AnalysisService(
        IAnalysisRepository      analyses,
        IStorageService          storage,
        IPythonAiClient          pythonAi,
        IUserRepository          users,
        AnalysisGate             gate,
        ILogger<AnalysisService> logger,
        OwnerAlerts?             alerts = null)
    {
        _analyses = analyses;
        _storage  = storage;
        _pythonAi = pythonAi;
        _users    = users;
        _gate     = gate;
        _logger   = logger;
        _alerts   = alerts;
    }

    // ── Public entry point ─────────────────────────────────────────────────────

    /// <summary>
    /// Would this user be allowed to start an analysis right now? Changes
    /// nothing. Lets the chat refuse before spending a quality check on an
    /// analysis that could not start anyway.
    /// </summary>
    public async Task<Admission> CheckAsync(Guid userId)
    {
        var user = await _users.GetByIdAsync(userId);
        return await FreePlanQuotaAsync(userId, user)
            ?? _gate.Check(AnalysisCaller.ForUser(userId, user?.Plan));
    }

    /// <summary>
    /// Admit the analysis and start it in the background, or say why not. The
    /// HTTP caller returns immediately; the frontend polls /api/analyses/active.
    /// </summary>
    public async Task<Admission> TryStartAsync(
        Guid   userId,
        string fileName,
        long   fileSizeBytes,
        int    rowCount,
        int    columnCount,
        bool   userWantsCleaning   = false,
        bool   userConfirmedLow    = false,
        string? customizationJson  = null)
    {
        var user = await _users.GetByIdAsync(userId);
        var quota = await FreePlanQuotaAsync(userId, user);
        if (quota != null) return quota;

        var caller    = AnalysisCaller.ForUser(userId, user?.Plan);
        var admission = _gate.TryAdmit(caller);
        if (!admission.Allowed)
        {
            _logger.LogInformation("[Analysis] Refused for user {UserId}: {Code}", userId, admission.Code);
            return admission;
        }

        // Chosen here because the row is only written once a slot is free, and
        // the reply needs it now. Without it the page has nothing to follow.
        var analysisId = Guid.NewGuid();
        _ = Task.Run(() => _gate.RunAsync(caller, () =>
            RunAsync(userId, fileName, fileSizeBytes, rowCount, columnCount,
                     userWantsCleaning, userConfirmedLow, customizationJson, analysisId)));
        return admission with { AnalysisId = analysisId };
    }

    /// <summary>
    /// The free plan's 2-analyses-per-48-hours allowance, or null when it does
    /// not apply or is not used up. Persisted on the user row rather than kept
    /// in the gate, so restarting the server does not refill it.
    /// </summary>
    private async Task<Admission?> FreePlanQuotaAsync(Guid userId, User? user)
    {
        if (user == null || user.Plan != "free") return null;

        if ((DateTime.UtcNow - user.ReportsResetAt).TotalHours >= 48)
        {
            await _users.ResetReportQuotaAsync(userId);
            return null;
        }

        return user.ReportsUsed >= FreePlanAnalysesPer48h
            ? new Admission(false, "QUOTA_EXCEEDED",
                $"The free plan includes {FreePlanAnalysesPer48h} analyses every 48 hours, and you've used them. " +
                "Upgrade to Pro, or try again once the 48 hours are up.")
            : null;
    }

    /// <summary>Must match PlansController's advertised free-plan allowance.</summary>
    public const int FreePlanAnalysesPer48h = 2;

    // ── Pipeline implementation ────────────────────────────────────────────────

    public async Task RunAsync(
        Guid   userId,
        string fileName,
        long   fileSizeBytes,
        int    rowCount,
        int    columnCount,
        bool   userWantsCleaning   = false,
        bool   userConfirmedLow    = false,
        string? customizationJson  = null,
        Guid?  newAnalysisId       = null)
    {
        _logger.LogInformation("[Analysis] Starting for user {UserId}", userId);

        // analysisId is set once the DB row is created; used for all subsequent updates
        Guid? analysisId = null;

        try
        {
            // ── Step 1: Make sure the temp file is there ──────────────────────
            var tempPath = Uploads.Find(userId);
            if (tempPath == null)
            {
                _logger.LogError("[Analysis] Temp file missing for user {UserId}", userId);
                return;  // nothing to set failed — no DB row yet
            }

            // The browser cannot count rows in Excel or Parquet; the upload's
            // own reading of the file can.
            var uploaded = Uploads.ReadMeta(userId);
            if (rowCount <= 0 && uploaded != null)
            {
                rowCount    = uploaded.Rows;
                columnCount = uploaded.Columns;
            }

            // Report customization is a Pro feature. The panel is locked for
            // free users, and the server now agrees: a request crafted to send
            // customization anyway (Word and PowerPoint included) is ignored.
            var user = await _users.GetByIdAsync(userId);
            if (user?.Plan is not ("pro" or "admin"))
                customizationJson = null;

            // ── Step 2: Create a DB placeholder so the frontend can poll status ─
            var analysis = new Analysis(userId, fileName, fileSizeBytes, id: newAnalysisId);
            analysis.SetShape(rowCount, columnCount);
            analysis.SetStatus("processing");

            if (!string.IsNullOrWhiteSpace(customizationJson))
                analysis.SetCustomization(customizationJson);

            var saved  = await _analyses.UpsertAsync(analysis);
            analysisId = saved.Id;
            _logger.LogInformation("[Analysis] DB row created: {AnalysisId}", analysisId);

            // ── Step 3: Parse customization for the Python request ─────────────
            // userWantsCleaning / userConfirmedLow MUST be forwarded here. The Python
            // pipeline gates Phase 3 (cleaning) on user_wants_cleaning; if it arrives
            // false the dataset is analysed dirty even though the chatbot told the user
            // cleaning was applied.
            var request = BuildPythonRequest(
                userId, saved, customizationJson,
                userWantsCleaning, userConfirmedLow);

            // ── Step 4: Call the Python AI pipeline ───────────────────────────
            var csvBytes = await File.ReadAllBytesAsync(tempPath);
            request.CsvFileBytes = csvBytes;
            // The upload's own name is the better hint for the AI service's
            // reader ("sales.parquet"), in case the client sent a generic one.
            request.CsvFileName = uploaded?.FileName ?? fileName;
            _logger.LogInformation("[Analysis] Sending to Python AI, analysisId={Id}", analysisId);

            var rawJson = await _pythonAi.CallPythonAiAsync(request);

            AnalyzeResponseDto? result;
            try
            {
                result = JsonSerializer.Deserialize<AnalyzeResponseDto>(rawJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Analysis] Failed to parse Python response for {Id}", analysisId);
                await TrySetFailed(analysisId.Value);
                return;
            }

            if (result == null || result.Status == "failed")
            {
                _logger.LogWarning("[Analysis] Pipeline returned failed: {Err}", result?.Error);
                await TrySetFailed(analysisId.Value);
                return;
            }

            // ── Step 5a: Save the original upload, in its own format ──────────
            // The extension comes from the stored upload, which was checked
            // against FileFormats when it arrived.
            // Best-effort like every other output: losing this copy costs the
            // user a download and data lookups in the chat, not the report they
            // just waited for.
            try
            {
                var originalPath = await _storage.SaveOriginalFileAsync(
                    userId, analysisId.Value, csvBytes, Path.GetFileName(tempPath));
                await _analyses.UpdateOriginalCsvPathAsync(analysisId.Value, originalPath);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Analysis] Failed to save the original upload — continuing");
            }

            // ── Step 5b: Save cleaned CSV (only if user requested cleaning) ────
            string? cleanedCsvPath = null;
            if (!string.IsNullOrEmpty(result.CleanedCsvBase64))
            {
                try
                {
                    var bytes      = Convert.FromBase64String(result.CleanedCsvBase64);
                    cleanedCsvPath = await _storage.SaveCleanedCsvAsync(userId, analysisId.Value, bytes);
                    _logger.LogInformation("[Analysis] Cleaned CSV saved");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save cleaned CSV — continuing");
                }
            }

            // ── Step 5c: Save PDF report ──────────────────────────────────────
            string? pdfPath = null;
            if (!string.IsNullOrEmpty(result.PdfReportBase64))
            {
                try
                {
                    var bytes = Convert.FromBase64String(result.PdfReportBase64);
                    pdfPath   = await _storage.SavePdfReportAsync(userId, analysisId.Value, bytes);
                    _logger.LogInformation("[Analysis] PDF saved: {Path}", pdfPath);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save PDF — continuing");
                }
            }

            // ── Step 5d: Save Word report (Pro) ───────────────────────────────
            string? wordPath = null;
            if (!string.IsNullOrEmpty(result.WordReportBase64))
            {
                try
                {
                    var bytes = Convert.FromBase64String(result.WordReportBase64);
                    wordPath  = await _storage.SaveWordReportAsync(userId, analysisId.Value, bytes);
                    _logger.LogInformation("[Analysis] Word report saved: {Path}", wordPath);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save Word report — continuing");
                }
            }

            // ── Step 5e: Save PPTX (Pro) ──────────────────────────────────────
            string? pptxPath = null;
            if (!string.IsNullOrEmpty(result.PptxReportBase64))
            {
                try
                {
                    var bytes = Convert.FromBase64String(result.PptxReportBase64);
                    pptxPath  = await _storage.SavePptxReportAsync(userId, analysisId.Value, bytes);
                    _logger.LogInformation("[Analysis] PPTX saved: {Path}", pptxPath);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save PPTX — continuing");
                }
            }

            // ── Step 5f: Save chart images (up to 5) ─────────────────────────
            var chartMeta = new List<object>();
            foreach (var (chart, i) in (result.Charts ?? new()).Take(5).Select((c, i) => (c, i)))
            {
                try
                {
                    string? chartUrl = null;
                    if (!string.IsNullOrEmpty(chart.ImageBase64))
                    {
                        var pngBytes    = Convert.FromBase64String(chart.ImageBase64);
                        var storagePath = await _storage.SaveChartAsync(userId, analysisId.Value, i, pngBytes);
                        // 24-hour signed URL — long enough for any typical session
                        chartUrl = await _storage.GetSignedUrlAsync(storagePath, 86400);
                    }
                    chartMeta.Add(new
                    {
                        type  = chart.Type,
                        label = chart.Label,
                        desc  = chart.Desc,
                        color = chart.Color,
                        url   = chartUrl,
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save chart {Index} — skipping", i);
                }
            }

            // ── Step 5g: Persist LLM usage ────────────────────────────────────
            // Best-effort: telemetry must never fail an analysis the pipeline
            // already completed. A null Usage (older AI service image) is fine —
            // the analytics endpoint treats missing cost as "not recorded".
            if (result.Usage is { } usage)
            {
                try
                {
                    await _analyses.UpdateUsageAsync(
                        analysisId.Value,
                        usage.TotalCostUsd,
                        usage.TotalInputTokens,
                        usage.TotalOutputTokens,
                        JsonSerializer.Serialize(usage));
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to persist usage for {Id} — continuing", analysisId);
                }
            }

            // ── Step 5h: Save what the chat answers from ──────────────────────
            // Best-effort, like usage: without it the report is still complete,
            // only questions about it are unavailable.
            if (result.ChatContext is { ValueKind: JsonValueKind.Object } chatContext)
            {
                try
                {
                    await _storage.SaveChatContextAsync(userId, analysisId.Value, chatContext.GetRawText());
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save chat context for {Id} — continuing", analysisId);
                }
            }

            // ── Step 5i: A report nobody's model wrote ────────────────────────
            // The person still gets a report: the stats-only one. It is the one
            // failure that arrives looking like a result, so the owner hears
            // about it now, not from the daily check. Once a day at most.
            if (result.ReportWriter is { Length: 0 } && _alerts != null)
            {
                _ = _alerts.RaiseAsync("report-without-ai",
                    "DIG: a report was just written without AI",
                    new[]
                    {
                        "No model answered, so an analysis has just been given the plain report built from the statistics alone.",
                        "The usual causes are a free allowance used up for the day, or a provider that is down.",
                        "Further reports like it today will not send another email.",
                    });
            }

            // ── Step 6: Mark analysis done in DB ─────────────────────────────
            await _analyses.UpdateChartUrlsAsync(analysisId.Value, JsonSerializer.Serialize(chartMeta));
            await _analyses.UpdateStatusAsync(
                analysisId.Value, "done",
                cleanedCsvPath: cleanedCsvPath,
                pdfPath:         pdfPath,
                wordPath:        wordPath,
                pptxPath:        pptxPath);

            // Clean up temp file now everything is safely in Supabase Storage
            Uploads.Delete(userId);
            _logger.LogInformation("[Analysis] Complete for user {UserId}, analysisId={Id}", userId, analysisId);

            // Counts toward the free plan's allowance. Only a completed analysis
            // counts, so a failure on our side never costs the user one of
            // theirs. This call used to be missing entirely: the allowance was
            // checked on every upload but nothing ever incremented it, so the
            // free-plan limit was never actually enforced.
            await TryCountUsageAsync(userId);

            // Enforce the plan's history limit. Runs last and swallows its own
            // errors — a pruning failure must never fail an analysis the user
            // has already been told succeeded.
            await TryPruneHistoryAsync(userId);
        }
        catch (TimeoutException ex)
        {
            _logger.LogError(ex, "[Analysis] Timeout for user {UserId}", userId);
            if (analysisId.HasValue) await TrySetFailed(analysisId.Value);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Analysis] Unexpected error for user {UserId}", userId);
            if (analysisId.HasValue) await TrySetFailed(analysisId.Value);
        }
    }

    /// <summary>Swallows its own errors: the analysis has already succeeded.</summary>
    private async Task TryCountUsageAsync(Guid userId)
    {
        try
        {
            await _users.IncrementReportUsageAsync(userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Analysis] Failed to count usage for user {UserId}", userId);
        }
    }

    // ── History pruning ───────────────────────────────────────────────────────

    /// <summary>History slots by plan. Must match PlansController's advertised limits.</summary>
    public static int HistoryLimitFor(string? plan) =>
        plan is "pro" or "admin" ? 15 : 5;

    /// <summary>
    /// Delete completed analyses beyond the user's plan limit, oldest first,
    /// together with their stored files.
    ///
    /// The limit used to be applied only when reading history. A free user saw
    /// five entries while every run they had ever made stayed in the database
    /// with a full set of files in storage — invisible, permanent, and billed.
    ///
    /// Files are deleted before the row so a failure part-way through leaves an
    /// orphaned row rather than an orphaned file: the row is what the next prune
    /// pass looks at, so the cleanup is retried. The other order would leak
    /// storage with nothing left pointing at it.
    /// </summary>
    private async Task TryPruneHistoryAsync(Guid userId)
    {
        try
        {
            var user  = await _users.GetByIdAsync(userId);
            var keep  = HistoryLimitFor(user?.Plan);
            var stale = await _analyses.GetOverflowAsync(userId, keep);

            if (stale.Count == 0) return;

            foreach (var old in stale)
            {
                await _storage.DeleteAnalysisFilesAsync(userId, old.Id);
                await _analyses.DeleteAsync(old.Id, userId);
            }

            _logger.LogInformation(
                "[Analysis] Pruned {Count} analyses beyond the {Keep}-slot limit for user {UserId}",
                stale.Count, keep, userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Analysis] History pruning failed for user {UserId}", userId);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Build the AnalyzeRequestDto by parsing the customization JSON stored on the analysis.
    /// Always produces a valid request — all customization fields have safe defaults.
    /// </summary>
    private static AnalyzeRequestDto BuildPythonRequest(
        Guid     userId,
        Analysis analysis,
        string?  customizationJson,
        bool     userWantsCleaning = false,
        bool     userConfirmedLow  = false)
    {
        var req = new AnalyzeRequestDto
        {
            SessionId   = userId,
            DatasetId   = analysis.Id,
            CsvFileName = analysis.FileName,

            // Chatbot decisions — these drive Phase 3 (cleaning) and the low-confidence
            // gate in the Python pipeline. Dropping them silently produces a report
            // built on uncleaned data while the UI claims cleaning succeeded.
            UserWantsCleaning = userWantsCleaning,
            UserConfirmedLow  = userConfirmedLow,
        };

        if (string.IsNullOrWhiteSpace(customizationJson))
            return req;

        JsonElement cust;
        try
        {
            cust = JsonSerializer.Deserialize<JsonElement>(customizationJson);
        }
        catch (JsonException)
        {
            return req;  // Malformed customization JSON — use defaults, never abort the pipeline
        }
        if (cust.ValueKind != JsonValueKind.Object)
            return req;

        // Each setting is read on its own. They used to be read in one try
        // block, so a single odd value ("insightsCount": "7", or a null
        // outputFormat) threw and silently reset every other setting too.
        // Values are passed on as given: the AI service checks each against
        // its allowed choices and cleans the free text.

        // Standard
        req.Language      = Str(cust, "language") ?? req.Language;
        req.Tone          = Str(cust, "tone")     ?? req.Tone;
        req.InsightsCount = Math.Clamp(Int(cust, "insightsCount") ?? req.InsightsCount, 1, 10);
        req.Occasion      = Str(cust, "occasion") ?? req.Occasion;

        // Deep customization
        req.Audience    = Str(cust, "audience")    ?? req.Audience;
        req.Depth       = Str(cust, "depth")       ?? req.Depth;
        req.FocusOn     = Str(cust, "focusOn")     ?? "";
        req.Comparisons = Str(cust, "comparisons") ?? "";
        req.ChartStyle  = Str(cust, "chartStyle")  ?? req.ChartStyle;

        req.IncludeMethodology = Bool(cust, "includeMethodology") ?? true;
        req.IncludeConfidence  = Bool(cust, "includeConfidence")  ?? true;

        // mustMention — stored as JSON array, forwarded as comma-separated string
        if (cust.TryGetProperty("mustMention", out var mm))
        {
            if (mm.ValueKind == JsonValueKind.Array)
                req.MustMention = string.Join(",", mm.EnumerateArray()
                    .Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()));
            else if (mm.ValueKind == JsonValueKind.String)
                req.MustMention = mm.GetString() ?? "";
        }

        // The brief
        req.Assumptions   = Str(cust, "assumptions") ?? "";
        req.Avoid         = Str(cust, "avoid")       ?? "";
        var writing = Str(cust, "writingFormat");
        req.WritingFormat = writing is "bullets" or "mixed" ? writing : "narrative";
        req.QuestionsJson = QuestionsJson(cust);

        // Output formats
        if (cust.TryGetProperty("outputFormat", out var fmt) && fmt.ValueKind == JsonValueKind.Object)
        {
            req.WantWord = Bool(fmt, "word") ?? false;
            req.WantPptx = Bool(fmt, "pptx") ?? false;
        }

        return req;
    }

    /// <summary>The questions the report should answer, as the AI service's questions_json.</summary>
    private static string QuestionsJson(JsonElement cust)
    {
        if (!cust.TryGetProperty("questions", out var qs) || qs.ValueKind != JsonValueKind.Array)
            return "";

        var list = new List<Dictionary<string, string>>();
        foreach (var q in qs.EnumerateArray())
        {
            string? question = null, note = null;
            if (q.ValueKind == JsonValueKind.String)
                question = q.GetString();
            else if (q.ValueKind == JsonValueKind.Object)
                (question, note) = (Str(q, "question"), Str(q, "note"));
            if (string.IsNullOrWhiteSpace(question)) continue;
            list.Add(new() { ["question"] = question.Trim(), ["note"] = note?.Trim() ?? "" });
            if (list.Count == 5) break;  // the AI service answers at most five
        }
        return list.Count == 0 ? "" : JsonSerializer.Serialize(list);
    }

    private static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static bool? Bool(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? v.GetBoolean()
            : null;

    private static int? Int(JsonElement e, string name)
    {
        if (!e.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d) && double.IsFinite(d))
            return (int)Math.Clamp(Math.Round(d), int.MinValue, int.MaxValue);
        if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var n))
            return n;
        return null;
    }

    /// <summary>
    /// Best-effort status update to "failed". Swallows errors so a DB failure
    /// during cleanup doesn't mask the original exception in the logs.
    /// </summary>
    private async Task TrySetFailed(Guid analysisId)
    {
        try { await _analyses.UpdateStatusAsync(analysisId, "failed"); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Analysis] Could not set failed status for {Id}", analysisId);
        }
    }
}
