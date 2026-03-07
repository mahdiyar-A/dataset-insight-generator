using System.Text.Json;
using backend.Application.DTOs.AI;
using backend.Application.Interfaces;
using backend.Domain.Entities;

namespace backend.Application.Services;

public class AnalysisService
{
    private readonly IDatasetRepository      _datasets;
    private readonly IStorageService         _storage;
    private readonly IPythonAiClient         _pythonAi;
    private readonly ILogger<AnalysisService> _logger;

    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_uploads");

    public AnalysisService(
        IDatasetRepository datasets,
        IStorageService    storage,
        IPythonAiClient    pythonAi,
        ILogger<AnalysisService> logger)
    {
        _datasets = datasets;
        _storage  = storage;
        _pythonAi = pythonAi;
        _logger   = logger;
    }

    public void StartInBackground(Guid userId, string fileName, long fileSizeBytes, int rowCount, int columnCount, bool userWantsCleaning = false, bool userConfirmedLow = false)
    {
        _ = Task.Run(() => RunAsync(userId, fileName, fileSizeBytes, rowCount, columnCount, userWantsCleaning, userConfirmedLow));
    }

    public async Task RunAsync(Guid userId, string fileName, long fileSizeBytes, int rowCount, int columnCount, bool userWantsCleaning = false, bool userConfirmedLow = false)
    {
        _logger.LogInformation("[Analysis] Starting for user {UserId}", userId);

        var tempPath = Path.Combine(TempDir, $"{userId}.csv");

        try
        {
            if (!File.Exists(tempPath))
            {
                _logger.LogError("[Analysis] Temp file missing for user {UserId}", userId);
                await TrySetFailed(userId);
                return;
            }

            var placeholderDataset = new Dataset(userId, fileName, fileSizeBytes, "pending");
            placeholderDataset.SetShape(rowCount, columnCount);
            placeholderDataset.SetStatus("processing");
            await _datasets.UpsertAsync(placeholderDataset);

            var csvBytes = await File.ReadAllBytesAsync(tempPath);

            var request = new AnalyzeRequestDto
            {
                SessionId           = userId,
                DatasetId           = placeholderDataset.Id,
                CsvFileBytes        = csvBytes,
                CsvFileName         = fileName,
                UserWantsCleaning   = userWantsCleaning,
                UserConfirmedLow    = userConfirmedLow,
            };

            _logger.LogInformation("[Analysis] Calling Python AI for user {UserId}", userId);
            var rawJson = await _pythonAi.CallPythonAiAsync(request);

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
                _logger.LogWarning("[Analysis] Python returned failed: {Error}", result?.Error);
                await _datasets.UpdateStatusAsync(userId, "failed");
                return;
            }

            // ── 6. Save original CSV ──────────────────────────────────────
            // FIX: UploadBytesAsync now returns the relative storagePath
            var originalCsvPath = await _storage.SaveCleanedCsvAsync(userId, csvBytes, "original.csv");

            // ── 7. Save cleaned CSV ───────────────────────────────────────
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
                    _logger.LogError(ex, "[Analysis] Failed to save cleaned CSV — continuing");
                }
            }

            // ── 8. Save PDF ───────────────────────────────────────────────
            string? pdfPath = null;
            if (!string.IsNullOrEmpty(result.PdfReportBase64))
            {
                try
                {
                    var bytes = Convert.FromBase64String(result.PdfReportBase64);
                    // FIX: SavePdfReportAsync now returns relative path (e.g. "users/{id}/report.pdf")
                    pdfPath   = await _storage.SavePdfReportAsync(userId, bytes);
                    _logger.LogInformation("[Analysis] PDF saved at {Path}", pdfPath);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save PDF — continuing");
                }
            }

            // ── 9. Save charts ────────────────────────────────────────────
            var chartMeta = new List<object>();
            foreach (var (chart, i) in (result.Charts ?? new()).Take(5).Select((c, i) => (c, i)))
            {
                try
                {
                    string? chartUrl = null;
                    if (!string.IsNullOrEmpty(chart.ImageBase64))
                    {
                        var pngBytes    = Convert.FromBase64String(chart.ImageBase64);
                        // FIX: SaveChartAsync returns relative path — pass that directly to GetSignedUrlAsync
                        var storagePath = await _storage.SaveChartAsync(userId, i, pngBytes);
                        chartUrl        = await _storage.GetSignedUrlAsync(storagePath, 86400);
                    }
                    chartMeta.Add(new { type = chart.Type, label = chart.Label, desc = chart.Desc, color = chart.Color, url = chartUrl });
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Analysis] Failed to save chart {Index}", i);
                }
            }

            // ── 10. Update DB ─────────────────────────────────────────────
            await _datasets.UpdateOriginalCsvPathAsync(userId, originalCsvPath);

            var chartUrlsJson = JsonSerializer.Serialize(chartMeta);
            await _datasets.UpdateChartUrlsAsync(userId, chartUrlsJson);
            await _datasets.UpdateStatusAsync(userId, "done",
                cleanedCsvUrl: cleanedCsvPath,
                pdfReportUrl:  pdfPath);

            File.Delete(tempPath);
            _logger.LogInformation("[Analysis] Complete for user {UserId}", userId);
        }
        catch (TimeoutException ex)
        {
            _logger.LogError(ex, "[Analysis] Timeout for user {UserId}", userId);
            await TrySetFailed(userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Analysis] Unexpected error for user {UserId}", userId);
            await TrySetFailed(userId);
        }
    }

    private async Task TrySetFailed(Guid userId)
    {
        try { await _datasets.UpdateStatusAsync(userId, "failed"); }
        catch { /* ignore */ }
    }
}