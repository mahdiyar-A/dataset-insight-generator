using System.Security.Claims;
using System.Text.Json;
using backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace backend.Controllers;

/// <summary>
/// The report of one analysis as a document edited in DIG, with every save kept
/// as a version. Its owner edits it, and so do the owner and editors of a team
/// it is shared with; viewers read it (ReportAccess). See ReportService.
///
///   GET  /api/analyses/{id}/report             the newest version and the list of versions
///   PUT  /api/analyses/{id}/report             save an edit; rebuilds the files
///   POST /api/analyses/{id}/report/restore     go back to an older version, as a new one
///   POST /api/analyses/{id}/report/apply       apply a suggestion the chat made, as a new version
///   GET  /api/analyses/{id}/report/next-steps  what might be done next, chosen without a model
///   POST /api/analyses/{id}/report/draw        a chart DIG draws from named columns, as a suggestion
///
/// Nothing here asks a model, so nothing here counts against the chat's
/// allowance: a suggestion in the owner's own words is asked in the chat.
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

    public sealed class ApplyBody
    {
        public Guid ProposalId { get; set; }
    }

    public sealed class DrawBody
    {
        public JsonElement Chart { get; set; }   // {"type", "x", "y", "group", "agg"}
        public string?     Label { get; set; }
    }

    private const int MaxLabelChars = 120;

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
        var me = UserId();
        var result = await _reports.GetAsync(me, id);
        return result.Outcome switch
        {
            ReportOutcome.Ok => Ok(Body(result, me)),
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
        var me = UserId();
        return Answer(await _reports.SaveAsync(me, id, body.BaseVersion, body.Document), me);
    }

    [HttpPost("restore")]
    [EnableRateLimiting("report-save")]
    public async Task<IActionResult> Restore(Guid id, [FromBody] RestoreBody body)
    {
        var me = UserId();
        return Answer(await _reports.RestoreAsync(me, id, body.BaseVersion, body.Version), me);
    }

    [HttpPost("apply")]
    [EnableRateLimiting("report-save")]
    public async Task<IActionResult> Apply(Guid id, [FromBody] ApplyBody body)
    {
        var me = UserId();
        var result = await _reports.ApplyProposalAsync(me, id, body.ProposalId);
        if (result is { Outcome: ReportOutcome.NotFound, Code: "SUGGESTION_EXPIRED" })
            return NotFound(new
            {
                error   = result.Code,
                message = "That suggestion is no longer available. Ask again and DIG will suggest it afresh.",
            });
        return Answer(result, me);
    }

    [HttpGet("next-steps")]
    public async Task<IActionResult> NextSteps(Guid id)
    {
        var (outcome, steps) = await _reports.NextStepsAsync(UserId(), id);
        return outcome == ReportOutcome.Ok ? Ok(new { steps }) : NotFound(new { error = "NOT_FOUND" });
    }

    [HttpPost("draw")]
    [EnableRateLimiting("report-draw")]
    public async Task<IActionResult> Draw(Guid id, [FromBody] DrawBody body)
    {
        var label = body.Label?.Trim() ?? "";
        if (body.Chart.ValueKind != JsonValueKind.Object || label.Length == 0 || label.Length > MaxLabelChars)
            return BadRequest(new { error = "BAD_CHART" });

        var result = await _reports.DrawAsync(UserId(), id, body.Chart, label);
        return result.Outcome switch
        {
            ReportOutcome.Ok          => Ok(new { proposal = Proposal(result.Proposal!) }),
            ReportOutcome.Rejected    => UnprocessableEntity(new { error = "CANNOT_DRAW", message = result.Message }),
            ReportOutcome.NotEditable => UnprocessableEntity(new { error = "NOT_EDITABLE" }),
            ReportOutcome.Unavailable => StatusCode(503, new
            {
                error   = "UNAVAILABLE",
                message = "The chart couldn't be drawn just now. Try again in a moment.",
            }),
            _ => NotFound(new { error = "NOT_FOUND" }),
        };
    }

    /// <summary>A suggestion as the page shows it. The changes themselves stay on the server.</summary>
    public static object Proposal(OfferedProposal p) => new
    {
        id          = p.Id,
        baseVersion = p.BaseVersion,
        preview     = p.Preview,
        warnings    = p.Warnings,
    };

    private IActionResult Answer(ReportResult result, Guid me) => result.Outcome switch
    {
        ReportOutcome.Ok          => Ok(Body(result, me)),
        ReportOutcome.Conflict when result.Code == "SAME_PART_CHANGED" => Conflict(new
        {
            error     = result.Code,
            version   = result.Version,
            parts     = result.Parts,
            savedBy   = SavedBy(result.SavedSince, me),
            message   = "Someone changed the same part of the report since you opened it.",
        }),
        ReportOutcome.Conflict    => Conflict(new
        {
            error   = result.Code,
            version = result.Version,
            message = "This report was changed since you opened it. Reload it to see the newest version.",
        }),
        ReportOutcome.ReadOnly    => StatusCode(403, new
        {
            error   = "READ_ONLY",
            message = "Viewers can read the report and comment. Ask the team owner to make you an editor to change it.",
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

    private static object Body(ReportResult result, Guid me) => new
    {
        editable = true,
        canEdit  = result.CanEdit,
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
            byYou        = v.EditedBy == me,
            byName       = v.EditedBy == me ? null : v.EditedByName,
        }),
        // A save made while someone else saved: whose changes it was combined with.
        combinedWith = result.SavedSince == null ? null : SavedBy(result.SavedSince, me),
        // Links to the charts the document places, by file number, including
        // charts DIG drew later that the analysis's own list does not have.
        pictures = (result.Pictures ?? new Dictionary<int, string>())
            .ToDictionary(p => p.Key.ToString(), p => p.Value),
    };

    /// <summary>Who saved these versions, each person once, oldest first. Names only, never addresses.</summary>
    private static object[] SavedBy(IReadOnlyList<ReportVersionSummary>? versions, Guid me) =>
        (versions ?? Array.Empty<ReportVersionSummary>())
            .GroupBy(v => v.ByDig ? (Guid?)null : v.EditedBy)
            .Select(g => (object)new
            {
                name  = g.Key == me ? null : g.First().EditedByName,
                byYou = g.Key == me,
                byDig = g.Key == null,
            })
            .ToArray();
}
