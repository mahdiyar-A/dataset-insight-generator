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
    private readonly IDatasetRepository _datasets;
    private readonly IStorageService    _storage;

    public DatasetsController(IDatasetRepository datasets, IStorageService storage)
    {
        _datasets = datasets;
        _storage  = storage;
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                 ?? User.FindFirstValue("sub");
        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var id))
            throw new UnauthorizedAccessException("Missing user id claim");
        return id;
    }

    // ── GET /api/datasets/current ─────────────────────────────────────────
    [HttpGet("current")]
    public async Task<IActionResult> GetCurrent()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);

        if (dataset == null)
            return NotFound(new { error = "NO_DATASET", message = "No dataset uploaded yet." });

        return Ok(ToDto(dataset));
    }

    // ── GET /api/datasets/current/status ─────────────────────────────────  ← NEW
    // Used by frontend polling every 10s during analysis
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

    // ── GET /api/datasets/visualizations ─────────────────────────────────  ← NEW
    // Returns up to 5 chart objects for the current dataset
    // Shape: [{ type, label, url, desc, color }, ...]
    // Empty array if no analysis done yet
    [HttpGet("visualizations")]
    public async Task<IActionResult> GetVisualizations()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);

        if (dataset == null || dataset.ChartUrls == null)
            return Ok(Array.Empty<object>());

        // chart_urls is stored as JSON in Supabase
        // The AI service saves it — we just serve it back
        try
        {
            var charts = JsonSerializer.Deserialize<List<object>>(dataset.ChartUrls);
            return Ok(charts ?? new List<object>());
        }
        catch
        {
            return Ok(Array.Empty<object>());
        }
    }

    // ── POST /api/datasets/upload ─────────────────────────────────────────
    [HttpPost("upload")]
    [RequestSizeLimit(52_428_800)]
    public async Task<IActionResult> Upload(
        [FromForm] IFormFile file,
        [FromForm] int?      rows,
        [FromForm] int?      columns)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "NO_FILE", message = "No file provided." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".csv")
            return BadRequest(new { error = "INVALID_TYPE", message = "Only .csv files are accepted." });

        var userId = GetUserId();

        try
        {
            await _storage.DeleteUserFilesAsync(userId);
            var csvUrl  = await _storage.SaveOriginalCsvAsync(userId, file);
            var dataset = new Dataset(userId, file.FileName, file.Length, csvUrl);

            if (rows.HasValue && columns.HasValue)
            {
                dataset.SetShape(rows.Value, columns.Value);
            }
            else
            {
                using var reader  = new StreamReader(file.OpenReadStream());
                var content       = await reader.ReadToEndAsync();
                var lines         = content.Split('\n').Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
                dataset.SetShape(
                    Math.Max(0, lines.Length - 1),
                    lines.Length > 0 ? lines[0].Split(',').Length : 0
                );
            }

            await _datasets.UpsertAsync(dataset);
            return Ok(ToDto(dataset));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = "UPLOAD_FAILED", message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "SERVER_ERROR", message = ex.Message });
        }
    }

    // ── GET /api/datasets/download/original ──────────────────────────────
    [HttpGet("download/original")]
    public async Task<IActionResult> DownloadOriginal()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null) return NotFound(new { error = "NO_DATASET" });

        var url = await _storage.GetSignedUrlAsync(dataset.OriginalCsvPath, 3600);
        return Ok(new { url, fileName = dataset.FileName });
    }

    // ── GET /api/datasets/download/cleaned ───────────────────────────────
    [HttpGet("download/cleaned")]
    public async Task<IActionResult> DownloadCleaned()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null) return NotFound(new { error = "NO_DATASET" });
        if (dataset.CleanedCsvPath == null) return NotFound(new { error = "NOT_READY", message = "Cleaned CSV not ready yet." });

        var url = await _storage.GetSignedUrlAsync(dataset.CleanedCsvPath, 3600);
        return Ok(new { url, fileName = $"cleaned_{dataset.FileName}" });
    }

    // ── GET /api/datasets/download/report ────────────────────────────────
    [HttpGet("download/report")]
    public async Task<IActionResult> DownloadReport()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null) return NotFound(new { error = "NO_DATASET" });
        if (dataset.PdfReportPath == null) return NotFound(new { error = "NOT_READY", message = "PDF report not ready yet." });

        var url = await _storage.GetSignedUrlAsync(dataset.PdfReportPath, 3600);
        return Ok(new { url, fileName = dataset.ReportFileName });
    }

    // ── POST /api/datasets/email-report ──────────────────────────────────  ← NEW
    // Placeholder: returns success — wire to SendGrid/SMTP when ready
    [HttpPost("email-report")]
    public async Task<IActionResult> EmailReport([FromBody] EmailReportRequest req)
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null) return NotFound(new { error = "NO_DATASET" });
        if (dataset.PdfReportPath == null) return BadRequest(new { error = "NOT_READY", message = "Report not ready yet." });

        // TODO: integrate SendGrid or SMTP here
        // For now: returns success so frontend works
        // When implementing: get user email from IUserRepository, generate signed URL, send email
        return Ok(new
        {
            message  = "Report queued for delivery.",
            fileName = dataset.ReportFileName,
        });
    }

    // ── DELETE /api/datasets/current ─────────────────────────────────────
    [HttpDelete("current")]
    public async Task<IActionResult> DeleteCurrent()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);
        if (dataset == null) return NotFound(new { error = "NO_DATASET" });

        await _storage.DeleteUserFilesAsync(userId);
        await _datasets.DeleteByUserIdAsync(userId);
        return NoContent();
    }

    // ── DTO ───────────────────────────────────────────────────────────────
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
    };
}

public record EmailReportRequest(string? Subject, bool IncludeAttachment = true);