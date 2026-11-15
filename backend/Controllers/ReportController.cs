using System.Security.Claims;
using System.Text.Json;
using backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace backend.Controllers;

/// <summary>
/// The report of one analysis as a document its owner edits in DIG, with every
/// save kept as a version. See ReportService.
///
///   GET  /api/analyses/{id}/report           the newest version and the list of versions
///   PUT  /api/analyses/{id}/report           save an edit; rebuilds the files
///   POST /api/analyses/{id}/report/restore   go back to an older version, as a new one
/// </summary>
[ApiController]
[Route("api/analyses/{id:guid}/report")]
[Authorize]
public class ReportController : ControllerBase
{
    private readonly ReportService _reports;

    public ReportController(ReportService reports) => _reports = reports;

    public sealed class SaveBody
    {
        public int         BaseVersion { get; set; }
        public JsonElement Document    { get; set; }
    }

    public sealed class RestoreBody
    {
        public int BaseVersion { get; set; }
        public int Version     { get; set; }
    }

    private Guid UserId()
    {
        var c = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(c) || !Guid.TryParse(c, out var id))
            throw new UnauthorizedAccessException("Missing user id claim");
        return id;
    }

    [HttpGet]
    public async Task<IActionResult> Get(Guid id)
    {
        var result = await _reports.GetAsync(UserId(), id);
        return result.Outcome switch
        {
            ReportOutcome.Ok => Ok(Body(result)),
            // Not an error: the report exists, it was made before it could be
            // edited. The page says so instead of showing a failure.
            ReportOutcome.NotEditable => Ok(new { editable = false }),
            _ => NotFound(new { error = "NOT_FOUND" }),
        };
    }

    [HttpPut]
    [EnableRateLimiting("report-save")]
    [RequestSizeLimit(1_000_000)]
    public async Task<IActionResult> Save(Guid id, [FromBody] SaveBody body)
    {
        if (body.Document.ValueKind != JsonValueKind.Object)
            return BadRequest(new { error = "NO_DOCUMENT" });
        return Answer(await _reports.SaveAsync(UserId(), id, body.BaseVersion, body.Document));
    }

    [HttpPost("restore")]
    [EnableRateLimiting("report-save")]
    public async Task<IActionResult> Restore(Guid id, [FromBody] RestoreBody body) =>
        Answer(await _reports.RestoreAsync(UserId(), id, body.BaseVersion, body.Version));

    private IActionResult Answer(ReportResult result) => result.Outcome switch
    {
        ReportOutcome.Ok          => Ok(Body(result)),
        ReportOutcome.Conflict    => Conflict(new
        {
            error   = result.Code,
            version = result.Version,
            message = "This report was changed since you opened it. Reload it to see the newest version.",
        }),
        ReportOutcome.Rejected    => UnprocessableEntity(new { error = result.Code }),
        ReportOutcome.NotEditable => UnprocessableEntity(new { error = "NOT_EDITABLE" }),
        ReportOutcome.Unavailable => StatusCode(503, new
        {
            error   = "UNAVAILABLE",
            message = "The report couldn't be saved just now. Your changes are still here; try again in a moment.",
        }),
        _ => NotFound(new { error = result.Code ?? "NOT_FOUND" }),
    };

    private static object Body(ReportResult result) => new
    {
        editable = true,
        version  = result.Version,
        document = result.Document,
        warnings = result.Warnings,
        versions = (result.Versions ?? Array.Empty<ReportVersionSummary>()).Select(v => new
        {
            version      = v.Version,
            kind         = v.Kind,
            restoredFrom = v.RestoredFrom,
            createdAt    = v.CreatedAt,
            byDig        = v.ByDig,
        }),
    };
}
