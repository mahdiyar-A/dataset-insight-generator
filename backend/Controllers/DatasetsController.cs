using backend.Application.Interfaces;
using backend.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Text.Json;

namespace backend.Controllers;

[ApiController]
[Route("api/datasets")]
[Authorize]
public class DatasetsController : ControllerBase
{
    private readonly IDatasetRepository      _datasets;
    private readonly IStorageService         _storage;
    private readonly ILogger<DatasetsController> _logger;

    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_uploads");

    public DatasetsController(IDatasetRepository datasets, IStorageService storage, ILogger<DatasetsController> logger)
    {
        _datasets = datasets;
        _storage  = storage;
        _logger   = logger;
        Directory.CreateDirectory(TempDir);
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var id))
            throw new UnauthorizedAccessException("Missing user id claim");
        return id;
    }

    // POST /api/datasets/upload
    // Saves CSV to server temp folder ONLY — nothing goes to Supabase until analysis succeeds
    [HttpPost("upload")]
    [RequestSizeLimit(52_428_800)]
    public async Task<IActionResult> Upload(
        [FromForm] IFormFile file,
        [FromForm] int? rows,
        [FromForm] int? columns)
    {
        _logger.LogInformation("[Upload] Incoming file: {Name} ({Size} bytes)", file?.FileName, file?.Length);

        if (file == null || file.Length == 0)
            return BadRequest(new { error = "NO_FILE", message = "No file provided." });

        if (Path.GetExtension(file.FileName).ToLowerInvariant() != ".csv")
            return BadRequest(new { error = "INVALID_TYPE", message = "Only .csv files are accepted." });

        if (file.Length > 50 * 1024 * 1024)
            return BadRequest(new { error = "TOO_LARGE", message = "File exceeds 50 MB limit." });

        var userId   = GetUserId();
        _logger.LogInformation("[Upload] User {UserId} uploading {Name} ({SizeMB:0.##} MB)", userId, file.FileName, file.Length / 1_048_576.0);
        var tempPath = Path.Combine(TempDir, $"{userId}.csv");

        using (var stream = System.IO.File.Create(tempPath))
            await file.CopyToAsync(stream);

        int rowCount    = rows    ?? 0;
        int columnCount = columns ?? 0;

        if (!rows.HasValue || !columns.HasValue)
        {
            var lines   = System.IO.File.ReadAllLines(tempPath)
                              .Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
            rowCount    = Math.Max(0, lines.Length - 1);
            columnCount = lines.Length > 0 ? lines[0].Split(',').Length : 0;
        }

        _logger.LogInformation("[Upload] ✓ Saved to temp — rows={Rows}, cols={Cols}", rowCount, columnCount);
        return Ok(new
        {
            fileName      = file.FileName,
            fileSizeBytes = file.Length,
            rowCount,
            columnCount,
            status        = "pending",
            uploadedAt    = DateTime.UtcNow,
            hasCleanedCsv = false,
            hasPdfReport  = false,
            isPending     = true,
        });
    }

    // GET /api/datasets/current — only returns data that's been through analysis
    [HttpGet("current")]
    public async Task<IActionResult> GetCurrent()
    {
        var userId  = GetUserId();
        _logger.LogInformation("[Datasets] GET current — user {UserId}", userId);
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null)
            return NotFound(new { error = "NO_DATASET" });
        _logger.LogInformation("[Datasets] Returning dataset {Id} status={Status}", dataset.Id, dataset.Status);
        return Ok(ToDto(dataset));
    }

    // GET /api/datasets/current/status
    [HttpGet("current/status")]
    public async Task<IActionResult> GetStatus()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null)
            return NotFound(new { error = "NO_DATASET" });
        return Ok(new
        {
            status        = dataset.Status,
            hasCleanedCsv = dataset.CleanedCsvPath != null,
            hasPdfReport  = dataset.PdfReportPath  != null,
        });
    }

    // GET /api/datasets/visualizations
    [HttpGet("visualizations")]
    public async Task<IActionResult> GetVisualizations()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null || dataset.ChartUrls == null)
            return Ok(Array.Empty<object>());
        try
        {
            var charts = JsonSerializer.Deserialize<List<object>>(dataset.ChartUrls);
            return Ok(charts ?? new List<object>());
        }
        catch { return Ok(Array.Empty<object>()); }
    }

    // GET /api/datasets/temp/exists — frontend checks before allowing Start
    [HttpGet("temp/exists")]
    public IActionResult TempExists()
    {
        var userId   = GetUserId();
        var tempPath = Path.Combine(TempDir, $"{userId}.csv");
        return Ok(new { exists = System.IO.File.Exists(tempPath) });
    }

    // GET /api/datasets/download/original
    [HttpGet("download/original")]
    public async Task<IActionResult> DownloadOriginal()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null) return NotFound(new { error = "NO_DATASET" });
        var url = await _storage.GetSignedUrlAsync(dataset.OriginalCsvPath, 3600);
        return Ok(new { url, fileName = dataset.FileName });
    }

    // GET /api/datasets/download/cleaned
    [HttpGet("download/cleaned")]
    public async Task<IActionResult> DownloadCleaned()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null) return NotFound(new { error = "NO_DATASET" });
        if (dataset.CleanedCsvPath == null)
            return NotFound(new { error = "NOT_READY", message = "Cleaned CSV not ready yet." });
        var url = await _storage.GetSignedUrlAsync(dataset.CleanedCsvPath, 3600);
        return Ok(new { url, fileName = $"cleaned_{dataset.FileName}" });
    }

    // GET /api/datasets/download/report
    [HttpGet("download/report")]
    public async Task<IActionResult> DownloadReport()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null) return NotFound(new { error = "NO_DATASET" });
        if (dataset.PdfReportPath == null)
            return NotFound(new { error = "NOT_READY", message = "PDF report not ready yet." });
        var url = await _storage.GetSignedUrlAsync(dataset.PdfReportPath, 3600);
        return Ok(new { url, fileName = dataset.ReportFileName });
    }

    // POST /api/datasets/email-report
    [HttpPost("email-report")]
    public async Task<IActionResult> EmailReport([FromBody] EmailReportRequest req)
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null) return NotFound(new { error = "NO_DATASET" });
        if (dataset.PdfReportPath == null)
            return BadRequest(new { error = "NOT_READY", message = "Report not ready yet." });
        // TODO: wire to SendGrid
        return Ok(new { message = "Report queued for delivery.", fileName = dataset.ReportFileName });
    }

    // DELETE /api/datasets/current
    [HttpDelete("current")]
    public async Task<IActionResult> DeleteCurrent()
    {
        var userId   = GetUserId();
        var tempPath = Path.Combine(TempDir, $"{userId}.csv");

        // Always clean temp file
        if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath);

        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null) return NotFound(new { error = "NO_DATASET" });

        await _storage.DeleteUserFilesAsync(userId);
        await _datasets.DeleteByUserIdAsync(userId);
        return NoContent();
    }

    private static object ToDto(Dataset d) => new
    {
        id             = d.Id,
        fileName       = d.FileName,
        reportFileName = d.ReportFileName,
        rowCount       = d.RowCount,
        columnCount    = d.ColumnCount,
        fileSizeBytes  = d.FileSizeBytes,
        status         = d.Status,
        uploadedAt     = d.UploadedAt,
        hasCleanedCsv  = d.CleanedCsvPath != null,
        hasPdfReport   = d.PdfReportPath  != null,
        isPending      = false,
    };
}

public record EmailReportRequest(string? Subject, bool IncludeAttachment = true);