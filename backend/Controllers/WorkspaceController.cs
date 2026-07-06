using backend.Application.Interfaces;
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
        var workspaces = await _workspaces.GetUserSharedWorkspacesAsync(UserId());
        return Ok(workspaces.Select(WorkspaceToDto));
    }

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

        return Ok(WorkspaceToDetailDto(workspace, userId));
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

        var workspace = new SharedWorkspace(req.TeamId, req.AnalysisId, userId);
        await _workspaces.ShareAnalysisAsync(workspace);

        _logger.LogInformation("[Workspace] User {UserId} shared analysis {AnalysisId} with team {TeamId}",
            userId, req.AnalysisId, req.TeamId);

        return Ok(WorkspaceToDto(workspace));
    }

    // ── DELETE /api/workspaces/{id} ───────────────────────────────────────────
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Unshare(Guid id)
    {
        await _workspaces.UnshareAsync(id, UserId());
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

        // Only the person who shared the workspace can manage permissions
        if (workspace.SharedBy != userId) return Forbid();

        if (!Guid.TryParse(req.TargetUserId, out var targetId))
            return BadRequest(new { error = "INVALID_USER_ID" });

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
        await _workspaces.EditAnnotationAsync(aid, UserId(), req.Content);
        return Ok(new { message = "Annotation updated" });
    }

    // ── POST /api/workspaces/{wid}/annotations/{aid}/resolve ──────────────────
    [HttpPost("{wid:guid}/annotations/{aid:guid}/resolve")]
    public async Task<IActionResult> Resolve(Guid wid, Guid aid)
    {
        await _workspaces.ResolveAnnotationAsync(aid, UserId());
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

    private static object WorkspaceToDetailDto(SharedWorkspace ws, Guid viewingUserId)
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
