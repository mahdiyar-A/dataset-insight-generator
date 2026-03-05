using backend.Application.Interfaces;
using backend.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

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
    // Returns the user's current dataset (null/404 if none uploaded yet)
    [HttpGet("current")]
    public async Task<IActionResult> GetCurrent()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);

        if (dataset == null)
            return NotFound(new { error = "NO_DATASET", message = "No dataset uploaded yet." });

        return Ok(ToDto(dataset));
    }

    // ── POST /api/datasets/upload ─────────────────────────────────────────
    // Replaces any existing dataset for the user.
    // Accepts: multipart/form-data  file + optional rows + columns
    [HttpPost("upload")]
    [RequestSizeLimit(52_428_800)] // 50 MB
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

        if (file.Length > 50 * 1024 * 1024)
            return BadRequest(new { error = "TOO_LARGE", message = "File exceeds 50 MB limit." });

        var userId = GetUserId();

        try
        {
            // Delete old storage files before uploading new ones
            await _storage.DeleteUserFilesAsync(userId);

            // Upload raw CSV to Supabase Storage
            var csvUrl = await _storage.SaveOriginalCsvAsync(userId, file);

            // Build entity
            var dataset = new Dataset(userId, file.FileName, file.Length, csvUrl);

            // Shape: prefer frontend-parsed values (faster), fallback to server parse
            if (rows.HasValue && columns.HasValue)
            {
                dataset.SetShape(rows.Value, columns.Value);
            }
            else
            {
                using var reader  = new StreamReader(file.OpenReadStream());
                var content = await reader.ReadToEndAsync();
                var lines   = content.Split('\n').Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
                dataset.SetShape(
                    Math.Max(0, lines.Length - 1),
                    lines.Length > 0 ? lines[0].Split(',').Length : 0
                );
            }

            // Upsert (deletes old row, inserts new)
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

    // ── GET /api/datasets/download/original ───────────────────────────────
    // Returns a 1-hour signed URL for the original CSV
    [HttpGet("download/original")]
    public async Task<IActionResult> DownloadOriginal()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);

        if (dataset == null)
            return NotFound(new { error = "NO_DATASET", message = "No dataset found." });

        var url = await _storage.GetSignedUrlAsync(dataset.OriginalCsvPath, 3600);
        return Ok(new { url, fileName = dataset.FileName });
    }

    // ── GET /api/datasets/download/cleaned ────────────────────────────────
    // Returns signed URL for the cleaned CSV (if analysis is done)
    [HttpGet("download/cleaned")]
    public async Task<IActionResult> DownloadCleaned()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);

        if (dataset == null)
            return NotFound(new { error = "NO_DATASET", message = "No dataset found." });

        if (dataset.CleanedCsvPath == null)
            return NotFound(new { error = "NOT_READY", message = "Cleaned CSV not ready yet." });

        var url = await _storage.GetSignedUrlAsync(dataset.CleanedCsvPath, 3600);
        return Ok(new { url, fileName = $"cleaned_{dataset.FileName}" });
    }

    // ── GET /api/datasets/download/report ────────────────────────────────
    // Returns signed URL for the PDF report (if analysis is done)
    [HttpGet("download/report")]
    public async Task<IActionResult> DownloadReport()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);

        if (dataset == null)
            return NotFound(new { error = "NO_DATASET", message = "No dataset found." });

        if (dataset.PdfReportPath == null)
            return NotFound(new { error = "NOT_READY", message = "PDF report not ready yet." });

        var url = await _storage.GetSignedUrlAsync(dataset.PdfReportPath, 3600);
        return Ok(new { url, fileName = dataset.ReportFileName });
    }

    // ── DELETE /api/datasets/current ─────────────────────────────────────
    // Deletes the user's dataset + all associated files
    [HttpDelete("current")]
    public async Task<IActionResult> DeleteCurrent()
    {
        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);

        if (dataset == null)
            return NotFound(new { error = "NO_DATASET", message = "No dataset found." });

        await _storage.DeleteUserFilesAsync(userId);
        await _datasets.DeleteByUserIdAsync(userId);

        return NoContent();
    }

    // ── Shared DTO shape returned to frontend ─────────────────────────────
    private static object ToDto(Dataset d) => new
    {
        id             = d.Id,
        fileName       = d.FileName,
        reportFileName = d.ReportFileName,
        rowCount       = d.RowCount,
        columnCount    = d.ColumnCount,
        fileSizeBytes  = d.FileSizeBytes,
        uploadedAt     = d.UploadedAt,
        hasCleanedCsv  = d.CleanedCsvPath != null,
        hasPdfReport   = d.PdfReportPath  != null,
    };
}