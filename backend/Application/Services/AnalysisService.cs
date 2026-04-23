using System.Text.Json;
using backend.Application.DTOs.AI;
using backend.Application.Interfaces;
using backend.Domain.Entities;

namespace backend.Application.Services;

/// <summary>
/// Orchestrates the full analysis pipeline for authenticated users.
///
/// Flow:
///   1. Read the temp CSV file the user uploaded earlier
///   2. Create a "processing" placeholder row in the DB so the frontend can poll status
///   3. Send the file to the Python AI service (7-phase pipeline, may take 30-90s)
///   4. Save the outputs (original CSV, cleaned CSV, PDF, chart images) to Supabase Storage
///   5. Update the DB row with the final status + storage paths
///
/// StartInBackground() fires-and-forgets so the HTTP request to /api/chat/message
/// returns immediately and the frontend polls /api/datasets/current/status.
/// </summary>
public class AnalysisService
{
    private readonly IDatasetRepository       _datasets;
    private readonly IStorageService          _storage;
    private readonly IPythonAiClient          _pythonAi;
    private readonly ILogger<AnalysisService> _logger;

    // Same temp directory as DatasetsController — files land here on upload
    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_uploads");

    public AnalysisService(
        IDatasetRepository       datasets,
        IStorageService          storage,
        IPythonAiClient          pythonAi,
        ILogger<AnalysisService> logger)
    {
        _datasets = datasets;
        _storage  = storage;
        _pythonAi = pythonAi;
        _logger   = logger;
    }

    // Kick off analysis without awaiting — returns immediately to the caller
    public void StartInBackground(Guid userId, string fileName, long fileSizeBytes,
        int rowCount, int columnCount,
        bool userWantsCleaning = false, bool userConfirmedLow = false)
    {
        _ = Task.Run(() => RunAsync(userId, fileName, fileSizeBytes, rowCount, columnCount,
                                   userWantsCleaning, userConfirmedLow));
    }

    public async Task RunAsync(Guid userId, string fileName, long fileSizeBytes,
        int rowCount, int columnCount,
        bool userWantsCleaning = false, bool userConfirmedLow = false)
    {
        _logger.LogInformation("[Analysis] Starting for user {UserId}", userId);
        var tempPath = Path.Combine(TempDir, $"{userId}.csv");

        try
        {
            // ── Step 1: Make sure the temp file is there ──────────────────────
            if (!File.Exists(tempPath))
            {
                _logger.LogError("[Analysis] Temp file missing for user {UserId}", userId);
                await TrySetFailed(userId);
                return;
            }

            // ── Step 2: Create a DB placeholder so the frontend can see status ─
            var placeholder = new Dataset(userId, fileName, fileSizeBytes, "pending");
            placeholder.SetShape(rowCount, columnCount);
            placeholder.SetStatus("processing");
            await _datasets.UpsertAsync(placeholder);

            // ── Step 3: Call the Python AI pipeline ───────────────────────────
            var csvBytes = await File.ReadAllBytesAsync(tempPath);
            _logger.LogInformation("[Analysis] Sending to Python AI for user {UserId}", userId);

            var rawJson = await _pythonAi.CallPythonAiAsync(new AnalyzeRequestDto
            {
                SessionId         = userId,
                DatasetId         = placeholder.Id,
                CsvFileBytes      = csvBytes,
                CsvFileName       = fileName,
                UserWantsCleaning = userWantsCleaning,
                UserConfirmedLow  = userConfirmedLow,
            });

            AnalyzeResponseDto? result;
            try
            {
                result = JsonSerializer.Deserialize<AnalyzeResponseDto>(rawJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Analysis] Failed to parse Python response");
                await _datasets.UpdateStatusAsync(userId, "failed");
                return;
            }

            if (result == null || result.Status == "failed")
            {
                _logger.LogWarning("[Analysis] Pipeline returned failed: {Error}", result?.Error);
                await _datasets.UpdateStatusAsync(userId, "failed");
                return;
            }

            // ── Step 4a: Save original CSV to Supabase Storage ────────────────
            var originalCsvPath = await _storage.SaveCleanedCsvAsync(userId, csvBytes, "original.csv");

            // ── Step 4b: Save cleaned CSV (only produced if user requested cleaning) ─
            string? cleanedCsvPath = null;
            if (!string.IsNullOrEmpty(result.CleanedCsvBase64))
            {
                try
                {
                    var bytes      = Convert.FromBase64String(result.CleanedCsvBase64);
                    cleanedCsvPath = await _storage.SaveCleanedCsvAsync(userId, bytes);
                    _logger.LogInformation("[Analysis] Cleaned CSV saved");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save cleaned CSV — continuing without it");
                }
            }

            // ── Step 4c: Save PDF report ──────────────────────────────────────
            string? pdfPath = null;
            if (!string.IsNullOrEmpty(result.PdfReportBase64))
            {
                try
                {
                    var bytes = Convert.FromBase64String(result.PdfReportBase64);
                    pdfPath   = await _storage.SavePdfReportAsync(userId, bytes);
                    _logger.LogInformation("[Analysis] PDF saved at {Path}", pdfPath);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save PDF — continuing without it");
                }
            }

            // ── Step 4d: Save chart images (up to 5) ─────────────────────────
            // Charts come back as base64 PNG from Python; we upload each to Supabase
            // and store the signed URL so the frontend can render them directly
            var chartMeta = new List<object>();
            foreach (var (chart, i) in (result.Charts ?? new()).Take(5).Select((c, i) => (c, i)))
            {
                try
                {
                    string? chartUrl = null;
                    if (!string.IsNullOrEmpty(chart.ImageBase64))
                    {
                        var pngBytes    = Convert.FromBase64String(chart.ImageBase64);
                        var storagePath = await _storage.SaveChartAsync(userId, i, pngBytes);
                        // 24-hour signed URL — long enough for any typical session
                        chartUrl = await _storage.GetSignedUrlAsync(storagePath, 86400);
                    }
                    chartMeta.Add(new
                    {
                        type  = chart.Type,
                        label = chart.Label,
                        desc  = chart.Desc,
                        color = chart.Color,
                        url   = chartUrl
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save chart {Index} — skipping", i);
                }
            }

            // ── Step 5: Update DB with all storage paths and final status ─────
            await _datasets.UpdateOriginalCsvPathAsync(userId, originalCsvPath);
            await _datasets.UpdateChartUrlsAsync(userId, JsonSerializer.Serialize(chartMeta));
            await _datasets.UpdateStatusAsync(userId, "done",
                cleanedCsvUrl: cleanedCsvPath,
                pdfReportUrl:  pdfPath);

            // Clean up the temp file now that everything is safely in Supabase
            File.Delete(tempPath);
            _logger.LogInformation("[Analysis] Complete for user {UserId}", userId);
        }
        catch (TimeoutException ex)
        {
            _logger.LogError(ex, "[Analysis] Timeout waiting for Python pipeline — user {UserId}", userId);
            await TrySetFailed(userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Analysis] Unexpected error for user {UserId}", userId);
            await TrySetFailed(userId);
        }
    }

    // Best-effort status update — swallows errors so a DB failure during cleanup
    // doesn't mask the original exception in the logs
    private async Task TrySetFailed(Guid userId)
    {
        try { await _datasets.UpdateStatusAsync(userId, "failed"); }
        catch (Exception ex) { _logger.LogError(ex, "[Analysis] Could not set failed status for {UserId}", userId); }
    }
}
