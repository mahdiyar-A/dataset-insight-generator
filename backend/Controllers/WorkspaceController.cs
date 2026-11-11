using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace backend.Controllers;

/// <summary>
/// Manages shared workspaces: share an analysis with a team,
/// set per-file permissions, and manage real-time annotations.
/// </summary>
[ApiController]
[Route("api/workspaces")]
[Authorize]
public class WorkspaceController : ControllerBase
{
    private readonly IWorkspaceRepository _workspaces;
    private readonly ITeamRepository      _teams;
    private readonly IAnalysisRepository  _analyses;
    private readonly IUserRepository      _users;
    private readonly ILogger<WorkspaceController> _logger;

    public WorkspaceController(
        IWorkspaceRepository workspaces,
        ITeamRepository      teams,
        IAnalysisRepository  analyses,
        IUserRepository      users,
        ILogger<WorkspaceController> logger)
    {
        _workspaces = workspaces;
        _teams      = teams;
        _analyses   = analyses;
        _users      = users;
        _logger     = logger;
    }

    private Guid UserId()
    {
        var c = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(c) || !Guid.TryParse(c, out var id))
            throw new UnauthorizedAccessException();
        return id;
    }

    // ── GET /api/workspaces ───────────────────────────────────────────────────
    // Returns all workspaces the user has access to (across all their teams)
    [HttpGet]
    public async Task<IActionResult> GetMyWorkspaces()
    {
        var userId     = UserId();
        var workspaces = await _workspaces.GetUserSharedWorkspacesAsync(userId);

        // A list of ids is no use to a person choosing what to open, so each
        // entry carries the file's name and the team it was shared with.
        var teamNames = new Dictionary<Guid, (string? Name, Guid? Owner)>();
        var result    = new List<object>();
        foreach (var ws in workspaces)
        {
            if (!teamNames.TryGetValue(ws.TeamId, out var team))
            {
                var t = await _teams.GetTeamAsync(ws.TeamId);
                teamNames[ws.TeamId] = team = (t?.Name, t?.OwnerId);
            }
            var analysis = await _analyses.GetByIdAsync(ws.AnalysisId, ws.SharedBy);
            result.Add(new
            {
                ws.Id, ws.TeamId, ws.AnalysisId, ws.SharedBy, ws.SharedAt,
                teamName   = team.Name,
                fileName   = analysis?.FileName,
                completedAt = analysis?.CompletedAt,
                canUnshare = ws.SharedBy == userId || team.Owner == userId,
            });
        }
        return Ok(result);
    }

    /// <summary>The person who shared the analysis, and the owner of the team it was shared with.</summary>
    private async Task<bool> CanManageAsync(SharedWorkspace workspace, Guid userId) =>
        workspace.SharedBy == userId || (await _teams.GetTeamAsync(workspace.TeamId))?.OwnerId == userId;

    // ── GET /api/workspaces/{id} ──────────────────────────────────────────────
    // Full workspace detail with analysis metadata, permissions, and annotations
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId    = UserId();
        var workspace = await _workspaces.GetWorkspaceAsync(id);
        if (workspace == null) return NotFound();

        // Verify the user is a member of the workspace's team
        if (!await _teams.IsMemberAsync(workspace.TeamId, userId))
            return Forbid();

        // Load the linked analysis
        var analysis = await _analyses.GetByIdAsync(workspace.AnalysisId, workspace.SharedBy);
        workspace.Analysis = analysis;

        // Load permissions for this user
        workspace.Permissions = await _workspaces.GetPermissionsAsync(id);

        // Load annotations
        workspace.Annotations = await _workspaces.GetAnnotationsAsync(id);

        // Enrich annotations with author names
        foreach (var ann in workspace.Annotations.SelectMany(a => new[] { a }.Concat(a.Replies)))
        {
            var author = await _users.GetByIdAsync(ann.UserId);
            ann.AuthorName  = author?.UserName;
            ann.AuthorEmail = author?.Email;
        }

        return Ok(WorkspaceToDetailDto(workspace, userId, await CanManageAsync(workspace, userId)));
    }

    // ── POST /api/workspaces ──────────────────────────────────────────────────
    // Share an analysis with a team, creating a workspace
    [HttpPost]
    public async Task<IActionResult> Share([FromBody] ShareAnalysisRequest req)
    {
        var userId = UserId();

        // Verify the user owns the analysis
        var analysis = await _analyses.GetByIdAsync(req.AnalysisId, userId);
        if (analysis == null)
            return NotFound(new { error = "ANALYSIS_NOT_FOUND" });

        // Verify the user is in the team
        if (!await _teams.IsMemberAsync(req.TeamId, userId))
            return Forbid();

        // Viewers read and comment; sharing into the team is for editors and the owner.
        if (!await _teams.CanContributeAsync(req.TeamId, userId))
            return StatusCode(403, new { error = "EDITOR_REQUIRED", message = TeamRoles.ViewerCannot });

        var workspace = await _workspaces.ShareAnalysisAsync(
            new SharedWorkspace(req.TeamId, req.AnalysisId, userId));

        _logger.LogInformation("[Workspace] User {UserId} shared analysis {AnalysisId} with team {TeamId}",
            userId, req.AnalysisId, req.TeamId);

        return Ok(WorkspaceToDto(workspace));
    }

    // ── DELETE /api/workspaces/{id} ───────────────────────────────────────────
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Unshare(Guid id)
    {
        var userId    = UserId();
        var workspace = await _workspaces.GetWorkspaceAsync(id);
        if (workspace == null) return NotFound();

        // The person who shared it, or the owner of the team it was shared with
        if (workspace.SharedBy != userId)
        {
            var team = await _teams.GetTeamAsync(workspace.TeamId);
            if (team?.OwnerId != userId) return Forbid();
        }

        await _workspaces.UnshareAsync(id);
        return NoContent();
    }

    // ── GET /api/workspaces/{id}/permissions ──────────────────────────────────
    [HttpGet("{id:guid}/permissions")]
    public async Task<IActionResult> GetPermissions(Guid id)
    {
        var workspace = await _workspaces.GetWorkspaceAsync(id);
        if (workspace == null) return NotFound();
        if (!await _teams.IsMemberAsync(workspace.TeamId, UserId())) return Forbid();

        var perms = await _workspaces.GetPermissionsAsync(id);
        return Ok(perms.Select(p => new
        {
            p.UserId, p.FileType, p.Permission, p.UpdatedAt
        }));
    }

    // ── PUT /api/workspaces/{id}/permissions ──────────────────────────────────
    // Owner sets a permission for a specific user+fileType
    [HttpPut("{id:guid}/permissions")]
    public async Task<IActionResult> SetPermission(Guid id, [FromBody] SetPermissionRequest req)
    {
        var userId    = UserId();
        var workspace = await _workspaces.GetWorkspaceAsync(id);
        if (workspace == null) return NotFound();

        // The person who shared it, or the owner of the team: the same two who
        // may stop sharing it.
        if (!await CanManageAsync(workspace, userId)) return Forbid();

        if (!Guid.TryParse(req.TargetUserId, out var targetId))
            return BadRequest(new { error = "INVALID_USER_ID" });

        // A rule for someone outside the team would sit unseen until they
        // joined. And the two people who manage access always have it.
        if (!await _teams.IsMemberAsync(workspace.TeamId, targetId))
            return BadRequest(new { error = "NOT_A_MEMBER", message = "That person isn't in this team." });
        if (await CanManageAsync(workspace, targetId))
            return BadRequest(new
            {
                error   = "ALWAYS_HAS_ACCESS",
                message = "The team owner and the person who shared this always have access.",
            });

        var validFileTypes  = new[] { "original_csv", "cleaned_csv", "pdf", "word", "pptx", "charts", "all" };
        var validPermissions = new[] { "view", "edit", "none" };

        if (!validFileTypes.Contains(req.FileType))
            return BadRequest(new { error = "INVALID_FILE_TYPE" });
        if (!validPermissions.Contains(req.Permission))
            return BadRequest(new { error = "INVALID_PERMISSION" });

        var perm = new WorkspaceFilePermission(id, targetId, req.FileType, req.Permission, userId);
        await _workspaces.SetPermissionAsync(perm);

        return Ok(new { message = "Permission updated" });
    }

    // ── GET /api/workspaces/{id}/annotations ──────────────────────────────────
    [HttpGet("{id:guid}/annotations")]
    public async Task<IActionResult> GetAnnotations(Guid id, [FromQuery] string? fileType = null)
    {
        var workspace = await _workspaces.GetWorkspaceAsync(id);
        if (workspace == null) return NotFound();
        if (!await _teams.IsMemberAsync(workspace.TeamId, UserId())) return Forbid();

        var annotations = await _workspaces.GetAnnotationsAsync(id, fileType);

        // Enrich with author names
        foreach (var ann in annotations.SelectMany(a => new[] { a }.Concat(a.Replies)))
        {
            var author = await _users.GetByIdAsync(ann.UserId);
            ann.AuthorName  = author?.UserName;
            ann.AuthorEmail = author?.Email;
        }

        return Ok(annotations.Select(AnnToDto));
    }

    // ── POST /api/workspaces/{id}/annotations ─────────────────────────────────
    [HttpPost("{id:guid}/annotations")]
    public async Task<IActionResult> AddAnnotation(Guid id, [FromBody] AddAnnotationRequest req)
    {
        var userId    = UserId();
        var workspace = await _workspaces.GetWorkspaceAsync(id);
        if (workspace == null) return NotFound();
        if (!await _teams.IsMemberAsync(workspace.TeamId, userId)) return Forbid();

        Guid? parentId = req.ParentId.HasValue ? req.ParentId : null;
        var   ann      = new Annotation(id, userId, req.FileType, req.Content, req.Position, parentId);
        await _workspaces.AddAnnotationAsync(ann);

        var author = await _users.GetByIdAsync(userId);
        ann.AuthorName  = author?.UserName;
        ann.AuthorEmail = author?.Email;

        return Ok(AnnToDto(ann));
    }

    // ── PATCH /api/workspaces/{wid}/annotations/{aid} ─────────────────────────
    [HttpPatch("{wid:guid}/annotations/{aid:guid}")]
    public async Task<IActionResult> EditAnnotation(
        Guid wid, Guid aid, [FromBody] EditAnnotationRequest req)
    {
        var userId    = UserId();
        var workspace = await _workspaces.GetWorkspaceAsync(wid);
        if (workspace == null) return NotFound();
        if (!await _teams.IsMemberAsync(workspace.TeamId, userId)) return Forbid();

        var content = req.Content?.Trim();
        if (string.IsNullOrEmpty(content))
            return BadRequest(new { error = "EMPTY_COMMENT", message = "A comment can't be empty." });

        var saved = await _workspaces.EditAnnotationAsync(wid, aid, userId, content);
        if (saved == null)
            return NotFound(new { error = "NOT_YOUR_COMMENT", message = "Only the person who wrote a comment can edit it." });

        var author = await _users.GetByIdAsync(saved.UserId);
        saved.AuthorName  = author?.UserName;
        saved.AuthorEmail = author?.Email;

        // The comment itself, as AddAnnotation returns it. This returned only
        // "Annotation updated", which the page took for the comment: nothing on
        // screen changed, for the editor or for anyone watching, until a reload.
        return Ok(AnnToDto(saved));
    }

    // ── GET /api/workspaces/{id}/download/{fileKey} ───────────────────────
    // The analysis download route is for its owner, so a teammate needs this
    // one. Permissions are checked here, not only in the page: a "none" must
    // hold for anyone calling the API directly.
    [HttpGet("{id:guid}/download/{fileKey}")]
    public async Task<IActionResult> Download(
        Guid id, string fileKey, [FromServices] IStorageService storage)
    {
        var userId    = UserId();
        var workspace = await _workspaces.GetWorkspaceAsync(id);
        if (workspace == null) return NotFound();
        if (!await _teams.IsMemberAsync(workspace.TeamId, userId)) return Forbid();

        var mine = (await _workspaces.GetPermissionsAsync(id)).Where(p => p.UserId == userId).ToList();
        var permission = mine.FirstOrDefault(p => p.FileType == fileKey)
                      ?? mine.FirstOrDefault(p => p.FileType == "all");
        if (permission?.Permission == "none") return Forbid();

        var analysis = await _analyses.GetByIdAsync(workspace.AnalysisId, workspace.SharedBy);
        if (analysis == null) return NotFound();

        var type = fileKey switch
        {
            "pdf"          => "report",
            "cleaned_csv"  => "cleaned",
            "original_csv" => "original",
            _              => fileKey,
        };
        var (path, fileName) = AnalysisFiles.Find(analysis, type);
        if (path == null) return NotFound(new { error = "FILE_NOT_READY" });

        var url = await storage.GetSignedUrlAsync(path, 3600);
        return Ok(new { url, fileName });
    }

    // ── POST /api/workspaces/{wid}/annotations/{aid}/resolve ──────────────────
    [HttpPost("{wid:guid}/annotations/{aid:guid}/resolve")]
    public async Task<IActionResult> Resolve(Guid wid, Guid aid)
    {
        // Anyone in the team may close a thread, as anyone in it may comment.
        // Only the author's own click used to count, with the button offered
        // to everyone.
        var workspace = await _workspaces.GetWorkspaceAsync(wid);
        if (workspace == null) return NotFound();
        if (!await _teams.IsMemberAsync(workspace.TeamId, UserId())) return Forbid();

        if (!await _workspaces.ResolveAnnotationAsync(wid, aid))
            return NotFound(new { error = "NO_SUCH_COMMENT", message = "That comment is no longer there." });
        return Ok(new { message = "Annotation resolved" });
    }

    // ── DELETE /api/workspaces/{wid}/annotations/{aid} ────────────────────────
    [HttpDelete("{wid:guid}/annotations/{aid:guid}")]
    public async Task<IActionResult> DeleteAnnotation(Guid wid, Guid aid)
    {
        await _workspaces.DeleteAnnotationAsync(aid, UserId());
        return NoContent();
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    private static object WorkspaceToDto(SharedWorkspace ws) => new
    {
        ws.Id, ws.TeamId, ws.AnalysisId, ws.SharedBy, ws.SharedAt, ws.TeamName
    };

    private static object WorkspaceToDetailDto(SharedWorkspace ws, Guid viewingUserId, bool canManagePermissions)
    {
        // Determine the viewer's effective permission for each file type
        var perms = ws.Permissions
            .Where(p => p.UserId == viewingUserId)
            .ToDictionary(p => p.FileType, p => p.Permission);

        return new
        {
            ws.Id, ws.TeamId, ws.AnalysisId, ws.SharedBy, ws.SharedAt,
            analysis    = ws.Analysis == null ? null : new
            {
                ws.Analysis.Id,   ws.Analysis.FileName,
                ws.Analysis.RowCount, ws.Analysis.ColumnCount,
                ws.Analysis.Status,   ws.Analysis.CompletedAt,
                ws.Analysis.ReportFileName,
                hasOriginalCsv = ws.Analysis.OriginalCsvPath != null,
                hasCleanedCsv  = ws.Analysis.CleanedCsvPath  != null,
                hasPdf         = ws.Analysis.PdfReportPath   != null,
                hasWord        = ws.Analysis.WordReportPath  != null,
                hasPptx        = ws.Analysis.PptxReportPath  != null,
                ws.Analysis.ChartUrls,
            },
            myPermissions = perms,
            canManagePermissions,
            annotations   = ws.Annotations.Select(AnnToDto),
        };
    }

    private static object AnnToDto(Annotation a) => new
    {
        a.Id,           a.SharedWorkspaceId, a.UserId,
        a.FileType,     a.Content,           a.Position,
        a.CreatedAt,    a.UpdatedAt,         a.ResolvedAt,
        a.ParentId,     a.AuthorName,        a.AuthorEmail,
        replies = a.Replies.Select(r => new
        {
            r.Id, r.UserId, r.Content, r.CreatedAt,
            r.AuthorName, r.AuthorEmail, r.ResolvedAt,
        }),
    };
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

public record ShareAnalysisRequest(Guid AnalysisId, Guid TeamId);
public record SetPermissionRequest(string TargetUserId, string FileType, string Permission);
public record AddAnnotationRequest(
    string FileType, string Content, string? Position = null, Guid? ParentId = null);
public record EditAnnotationRequest(string Content);
