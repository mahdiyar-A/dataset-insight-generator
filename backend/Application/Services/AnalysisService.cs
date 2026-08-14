using System.Text.Json;
using backend.Application.DTOs.AI;
using backend.Application.Interfaces;
using backend.Domain.Entities;

namespace backend.Application.Services;

/// <summary>
/// Orchestrates the full analysis pipeline for authenticated users.
///
/// Flow:
///   1. Read the temp CSV the user uploaded earlier
///   2. Create an Analysis row (pending) so the frontend can poll status immediately
///   3. Store any Pro customization JSON on the Analysis entity
///   4. Send the file + customization to the Python AI service (8-phase pipeline)
///   5. Save all outputs (original CSV, cleaned CSV, PDF, Word, PPTX, charts) to Supabase Storage
///   6. Update the Analysis row with final status + storage paths
///
/// StartInBackground() fires-and-forgets so the HTTP request to /api/chat/message
/// returns immediately and the frontend polls /api/analyses/active for status.
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
    private readonly ILogger<AnalysisService> _logger;

    // Same temp directory as DatasetsController — files land here on upload
    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_uploads");

    public AnalysisService(
        IAnalysisRepository      analyses,
        IStorageService          storage,
        IPythonAiClient          pythonAi,
        IUserRepository          users,
        ILogger<AnalysisService> logger)
    {
        _analyses = analyses;
        _storage  = storage;
        _pythonAi = pythonAi;
        _users    = users;
        _logger   = logger;
    }

    // ── Public entry point ─────────────────────────────────────────────────────

    /// <summary>
    /// Kick off analysis without awaiting — returns immediately to the HTTP caller.
    /// The frontend polls /api/analyses/active to track progress.
    /// </summary>
    public void StartInBackground(
        Guid   userId,
        string fileName,
        long   fileSizeBytes,
        int    rowCount,
        int    columnCount,
        bool   userWantsCleaning   = false,
        bool   userConfirmedLow    = false,
        string? customizationJson  = null)
    {
        _ = Task.Run(() => RunAsync(userId, fileName, fileSizeBytes, rowCount, columnCount,
                                   userWantsCleaning, userConfirmedLow, customizationJson));
    }

    // ── Pipeline implementation ────────────────────────────────────────────────

    public async Task RunAsync(
        Guid   userId,
        string fileName,
        long   fileSizeBytes,
        int    rowCount,
        int    columnCount,
        bool   userWantsCleaning   = false,
        bool   userConfirmedLow    = false,
        string? customizationJson  = null)
    {
        _logger.LogInformation("[Analysis] Starting for user {UserId}", userId);
        var tempPath = Path.Combine(TempDir, $"{userId}.csv");

        // analysisId is set once the DB row is created; used for all subsequent updates
        Guid? analysisId = null;

        try
        {
            // ── Step 1: Make sure the temp file is there ──────────────────────
            if (!File.Exists(tempPath))
            {
                _logger.LogError("[Analysis] Temp file missing for user {UserId}", userId);
                return;  // nothing to set failed — no DB row yet
            }

            // ── Step 2: Create a DB placeholder so the frontend can poll status ─
            var analysis = new Analysis(userId, fileName, fileSizeBytes);
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

            // ── Step 5a: Save original CSV ────────────────────────────────────
            var originalCsvPath = await _storage.SaveOriginalCsvAsync(userId, analysisId.Value, csvBytes);
            await _analyses.UpdateOriginalCsvPathAsync(analysisId.Value, originalCsvPath);

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

            // ── Step 6: Mark analysis done in DB ─────────────────────────────
            await _analyses.UpdateChartUrlsAsync(analysisId.Value, JsonSerializer.Serialize(chartMeta));
            await _analyses.UpdateStatusAsync(
                analysisId.Value, "done",
                cleanedCsvPath: cleanedCsvPath,
                pdfPath:         pdfPath,
                wordPath:        wordPath,
                pptxPath:        pptxPath);

            // Clean up temp file now everything is safely in Supabase Storage
            File.Delete(tempPath);
            _logger.LogInformation("[Analysis] Complete for user {UserId}, analysisId={Id}", userId, analysisId);

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

        try
        {
            var cust = JsonSerializer.Deserialize<JsonElement>(customizationJson);

            // Standard
            req.Language      = cust.TryGetProperty("language",      out var l)  ? l.GetString()  ?? "en"            : "en";
            req.Tone          = cust.TryGetProperty("tone",          out var t)  ? t.GetString()  ?? "professional"   : "professional";
            req.InsightsCount = cust.TryGetProperty("insightsCount", out var ic) ? ic.GetInt32()                      : 5;
            req.Occasion      = cust.TryGetProperty("occasion",      out var oc) ? oc.GetString() ?? "general"        : "general";

            // Deep customization
            req.Audience    = cust.TryGetProperty("audience",    out var au) ? au.GetString() ?? "general"   : "general";
            req.Depth       = cust.TryGetProperty("depth",       out var dp) ? dp.GetString() ?? "standard"  : "standard";
            req.FocusOn     = cust.TryGetProperty("focusOn",     out var fo) ? fo.GetString() ?? ""           : "";
            req.Comparisons = cust.TryGetProperty("comparisons", out var cp) ? cp.GetString() ?? ""           : "";
            req.ChartStyle  = cust.TryGetProperty("chartStyle",  out var cs) ? cs.GetString() ?? "mixed"      : "mixed";

            req.IncludeMethodology = !cust.TryGetProperty("includeMethodology", out var im) || im.GetBoolean();
            req.IncludeConfidence  = !cust.TryGetProperty("includeConfidence",  out var iconf) || iconf.GetBoolean();

            // mustMention — stored as JSON array, forwarded as comma-separated string
            if (cust.TryGetProperty("mustMention", out var mm))
            {
                if (mm.ValueKind == JsonValueKind.Array)
                    req.MustMention = string.Join(",", mm.EnumerateArray().Select(x => x.GetString() ?? ""));
                else if (mm.ValueKind == JsonValueKind.String)
                    req.MustMention = mm.GetString() ?? "";
            }

            // Output formats
            if (cust.TryGetProperty("outputFormat", out var fmt))
            {
                req.WantWord = fmt.TryGetProperty("word", out var w) && w.GetBoolean();
                req.WantPptx = fmt.TryGetProperty("pptx", out var p) && p.GetBoolean();
            }
        }
        catch (Exception)
        {
            // Malformed customization JSON — use defaults, never abort the pipeline
        }

        return req;
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
