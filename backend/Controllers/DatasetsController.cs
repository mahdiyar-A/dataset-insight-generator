using backend.Application.Interfaces;
using backend.Application.Services;
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
    private readonly IUserRepository         _users;
    private readonly IEmailService           _email;
    private readonly UploadIntake            _intake;
    private readonly ILogger<DatasetsController> _logger;

    public DatasetsController(
        IDatasetRepository datasets,
        IStorageService storage,
        IUserRepository users,
        IEmailService email,
        UploadIntake intake,
        ILogger<DatasetsController> logger)
    {
        _datasets = datasets;
        _storage  = storage;
        _users    = users;
        _email    = email;
        _intake   = intake;
        _logger   = logger;
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var id))
            throw new UnauthorizedAccessException("Missing user id claim");
        return id;
    }

    // POST /api/datasets/upload
    // Saves the upload to server temp folder ONLY — nothing goes to Supabase until analysis succeeds
    [HttpPost("upload")]
    [RequestSizeLimit(52_428_800)]
    public async Task<IActionResult> Upload(
        [FromForm] IFormFile file,
        [FromForm] int? rows,
        [FromForm] int? columns)
    {
        _logger.LogInformation("[Upload] Incoming file: {Name} ({Size} bytes)", file?.FileName, file?.Length);

        var userId  = GetUserId();
        var outcome = await _intake.AcceptAsync(UploadStore.Users, userId, file, rows, columns);
        if (!outcome.Accepted)
            return BadRequest(new { error = outcome.Code, message = outcome.Message });

        var body = outcome.Summary!.ToResponse();
        body["uploadedAt"]    = DateTime.UtcNow;
        body["hasCleanedCsv"] = false;
        body["hasPdfReport"]  = false;
        _logger.LogInformation("[Upload] ✓ Saved to temp — rows={Rows}, cols={Cols}",
            outcome.Summary.Rows, outcome.Summary.Columns);
        return Ok(body);
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
        var userId = GetUserId();
        return Ok(new { exists = UploadStore.Users.Find(userId) != null });
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
        return Ok(new { url, fileName = FileFormats.CleanedFileName(dataset.FileName) });
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

    // DELETE /api/datasets/current
    [HttpDelete("current")]
    public async Task<IActionResult> DeleteCurrent()
    {
        var userId = GetUserId();

        // Always clean temp file
        UploadStore.Users.Delete(userId);

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
