using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Text.Json;

namespace backend.Controllers;

/// <summary>
/// Manages the user's analysis history (up to 5 for free, 15 for pro).
/// Also handles the upload → temp-file flow and polling.
///
/// Every login gives a clean dashboard — the user explicitly loads a history
/// item or starts a fresh analysis. Nothing auto-loads.
/// </summary>
[ApiController]
[Route("api/analyses")]
[Authorize]
public class AnalysisController : ControllerBase
{
    private readonly IAnalysisRepository     _repo;
    private readonly IStorageService         _storage;
    private readonly IUserRepository         _users;
    private readonly AnalysisService         _analysis;
    private readonly ILogger<AnalysisController> _logger;

    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_uploads");

    public AnalysisController(
        IAnalysisRepository repo,
        IStorageService     storage,
        IUserRepository     users,
        AnalysisService     analysis,
        ILogger<AnalysisController> logger)
    {
        _repo     = repo;
        _storage  = storage;
        _users    = users;
        _analysis = analysis;
        _logger   = logger;
        Directory.CreateDirectory(TempDir);
    }

    private Guid UserId()
    {
        var c = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(c) || !Guid.TryParse(c, out var id))
            throw new UnauthorizedAccessException("Missing user id claim");
        return id;
    }

    // ── GET /api/analyses/history ─────────────────────────────────────────────
    // Returns the user's last N completed analyses (5 free, 15 pro)
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory()
    {
        var userId = UserId();
        var user   = await _users.GetByIdAsync(userId);
        var limit  = user?.Plan == "pro" || user?.Plan == "admin" ? 15 : 5;

        var list = await _repo.GetHistoryAsync(userId, limit);

        // The history tape shows a chart thumbnail per entry. The signed URLs
        // stored in ChartUrls expire after 24 hours, so anything older than a
        // day would render broken images — they are re-signed here instead.
        //
        // Signing is best-effort per entry: a missing or unreadable chart must
        // degrade to a card without a thumbnail, never fail the whole list.
        var dtos = new List<object>(list.Count);
        foreach (var a in list)
        {
            string? thumb = null;
            if (a.ChartUrls != null)
            {
                try
                {
                    thumb = await _storage.GetSignedUrlAsync(
                        $"users/{userId}/analyses/{a.Id}/chart_0.png", 3600);
                }
                catch
                {
                    // No chart, or an analysis written under the old flat layout.
                }
            }
            dtos.Add(ToDto(a, thumb));
        }

        return Ok(dtos);
    }

    // ── GET /api/analyses/{id} ────────────────────────────────────────────────
    // Load a specific history item into the dashboard
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var analysis = await _repo.GetByIdAsync(id, UserId());
        if (analysis == null) return NotFound(new { error = "NOT_FOUND" });
        return Ok(ToDto(analysis));
    }

    // ── GET /api/analyses/active ──────────────────────────────────────────────
    // Returns the currently-processing analysis if one is running
    [HttpGet("active")]
    public async Task<IActionResult> GetActive()
    {
        var active = await _repo.GetActiveAsync(UserId());
        if (active == null) return NotFound(new { error = "NO_ACTIVE" });
        return Ok(ToDto(active));
    }

    // ── POST /api/analyses/upload ─────────────────────────────────────────────
    // Saves the CSV to the server temp folder.
    // The file is NOT in the DB yet — that only happens after the pipeline succeeds.
    [HttpPost("upload")]
    [RequestSizeLimit(52_428_800)]
    public async Task<IActionResult> Upload(
        [FromForm] IFormFile file,
        [FromForm] int?      rows,
        [FromForm] int?      columns)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "NO_FILE" });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".csv" && ext != ".xlsx")
            return BadRequest(new { error = "INVALID_TYPE", message = "Only .csv and .xlsx files accepted." });

        if (file.Length > 50 * 1024 * 1024)
            return BadRequest(new { error = "TOO_LARGE", message = "Max 50 MB." });

        // Check if user has hit their 48h report quota (free users only)
        var userId = UserId();
        var user   = await _users.GetByIdAsync(userId);
        if (user != null && user.Plan == "free")
        {
            // Reset counter if the 48h window has passed
            var windowAge = DateTime.UtcNow - user.ReportsResetAt;
            if (windowAge.TotalHours >= 48)
            {
                await _users.ResetReportQuotaAsync(userId);
            }
            else if (user.ReportsUsed >= 2)
            {
                return StatusCode(429, new
                {
                    error   = "QUOTA_EXCEEDED",
                    message = "Free plan allows 2 analyses per 48 hours.",
                    resetsAt = user.ReportsResetAt.AddHours(48),
                });
            }
        }

        var tempPath = Path.Combine(TempDir, $"{userId}{ext}");
        using (var stream = System.IO.File.Create(tempPath))
            await file.CopyToAsync(stream);

        int rowCount = rows ?? 0, colCount = columns ?? 0;
        if (!rows.HasValue || !columns.HasValue)
        {
            var lines = System.IO.File.ReadAllLines(tempPath)
                .Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
            rowCount = Math.Max(0, lines.Length - 1);
            colCount = lines.Length > 0 ? lines[0].Split(',').Length : 0;
        }

        _logger.LogInformation("[Analysis] Temp upload — user {UserId}, {Name} ({Rows}r × {Cols}c)",
            userId, file.FileName, rowCount, colCount);

        return Ok(new
        {
            fileName      = file.FileName,
            fileSizeBytes = file.Length,
            rowCount,
            columnCount   = colCount,
            status        = "pending",
            isPending     = true,
        });
    }

    // ── GET /api/analyses/{id}/status ─────────────────────────────────────────
    // Lightweight poll endpoint used during pipeline execution
    [HttpGet("{id:guid}/status")]
    public async Task<IActionResult> GetStatus(Guid id)
    {
        var analysis = await _repo.GetByIdAsync(id, UserId());
        if (analysis == null) return NotFound(new { error = "NOT_FOUND" });
        return Ok(new
        {
            status        = analysis.Status,
            hasCleanedCsv = analysis.CleanedCsvPath  != null,
            hasPdfReport  = analysis.PdfReportPath   != null,
            hasWordReport = analysis.WordReportPath  != null,
            hasPptx       = analysis.PptxReportPath  != null,
        });
    }

    // ── DELETE /api/analyses/{id} ─────────────────────────────────────────────
    // Deletes a history entry and its Supabase Storage files
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId   = UserId();
        var analysis = await _repo.GetByIdAsync(id, userId);
        if (analysis == null) return NotFound(new { error = "NOT_FOUND" });

        // Delete storage files first (best effort)
        await _storage.DeleteAnalysisFilesAsync(userId, id);
        await _repo.DeleteAsync(id, userId);

        // Clean up temp file if it still exists
        var tempCsv  = Path.Combine(TempDir, $"{userId}.csv");
        var tempXlsx = Path.Combine(TempDir, $"{userId}.xlsx");
        if (System.IO.File.Exists(tempCsv))  System.IO.File.Delete(tempCsv);
        if (System.IO.File.Exists(tempXlsx)) System.IO.File.Delete(tempXlsx);

        return NoContent();
    }

    // ── GET /api/analyses/{id}/download/{type} ───────────────────────────────
    // Returns a signed Supabase URL for downloading a specific file
    [HttpGet("{id:guid}/download/{type}")]
    public async Task<IActionResult> Download(Guid id, string type)
    {
        var analysis = await _repo.GetByIdAsync(id, UserId());
        if (analysis == null) return NotFound(new { error = "NOT_FOUND" });

        string? path = type switch
        {
            "original" => analysis.OriginalCsvPath,
            "cleaned"  => analysis.CleanedCsvPath,
            "report"   => analysis.PdfReportPath,
            "word"     => analysis.WordReportPath,
            "pptx"     => analysis.PptxReportPath,
            _          => null,
        };

        if (path == null) return NotFound(new { error = "FILE_NOT_READY" });

        var url      = await _storage.GetSignedUrlAsync(path, 3600);
        var fileName = type switch
        {
            "original" => analysis.FileName,
            "cleaned"  => $"cleaned_{analysis.FileName}",
            "word"     => analysis.ReportFileName.Replace(".pdf", ".docx"),
            "pptx"     => analysis.ReportFileName.Replace(".pdf", ".pptx"),
            _          => analysis.ReportFileName,
        };

        return Ok(new { url, fileName });
    }

    // ── GET /api/analyses/{id}/visualizations ─────────────────────────────────
    [HttpGet("{id:guid}/visualizations")]
    public async Task<IActionResult> GetVisualizations(Guid id)
    {
        var analysis = await _repo.GetByIdAsync(id, UserId());
        if (analysis == null || analysis.ChartUrls == null)
            return Ok(Array.Empty<object>());

        try
        {
            var charts = JsonSerializer.Deserialize<List<object>>(analysis.ChartUrls);
            return Ok(charts ?? new List<object>());
        }
        catch { return Ok(Array.Empty<object>()); }
    }

    // ── DTO mapper ────────────────────────────────────────────────────────────
    private static object ToDto(Analysis a, string? thumbnailUrl = null) => new
    {
        id              = a.Id,
        fileName        = a.FileName,
        reportFileName  = a.ReportFileName,
        rowCount        = a.RowCount,
        columnCount     = a.ColumnCount,
        fileSizeBytes   = a.FileSizeBytes,
        status          = a.Status,
        createdAt       = a.CreatedAt,
        completedAt     = a.CompletedAt,
        hasCleanedCsv   = a.CleanedCsvPath  != null,
        hasPdfReport    = a.PdfReportPath   != null,
        hasWordReport   = a.WordReportPath  != null,
        hasPptx         = a.PptxReportPath  != null,
        customization   = a.Customization,
        isPending       = false,

        // Signed at request time for the history tape. Null when the analysis
        // produced no charts, or was written before outputs were keyed by id.
        thumbnailUrl,
    };
}
