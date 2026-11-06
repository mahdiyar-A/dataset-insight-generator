using backend.Application.Interfaces;
using backend.Domain.Entities;
using Newtonsoft.Json;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

// ── Row models ────────────────────────────────────────────────────────────────

[Table("shared_workspaces")]
public class SharedWorkspaceRow : BaseModel
{
    [PrimaryKey("id", false)]   public string   Id          { get; set; } = "";
    [Column("team_id")]         public string   TeamId      { get; set; } = "";
    [Column("analysis_id")]     public string   AnalysisId  { get; set; } = "";
    [Column("shared_by")]       public string   SharedBy    { get; set; } = "";
    [Column("shared_at")]       public DateTime SharedAt    { get; set; }
}

[Table("workspace_file_permissions")]
public class WorkspacePermissionRow : BaseModel
{
    [PrimaryKey("id", false)]               public string   Id                { get; set; } = "";
    [Column("shared_workspace_id")]         public string   SharedWorkspaceId { get; set; } = "";
    [Column("user_id")]                     public string   UserId            { get; set; } = "";
    [Column("file_type")]                   public string   FileType          { get; set; } = "";
    [Column("permission")]                  public string   Permission        { get; set; } = "view";
    [Column("granted_by")]                  public string?  GrantedBy         { get; set; }
    [Column("updated_at")]                  public DateTime UpdatedAt         { get; set; }
}

[Table("annotations")]
public class AnnotationRow : BaseModel
{
    [PrimaryKey("id", false)]               public string    Id                { get; set; } = "";
    [Column("shared_workspace_id")]         public string    SharedWorkspaceId { get; set; } = "";
    [Column("user_id")]                     public string    UserId            { get; set; } = "";
    [Column("file_type")]                   public string    FileType          { get; set; } = "";
    [Column("content")]                     public string    Content           { get; set; } = "";
    [Column("position")]
    [JsonConverter(typeof(JsonbTextConverter))]                 public string?   Position          { get; set; }
    [Column("created_at")]                  public DateTime  CreatedAt         { get; set; }
    [Column("updated_at")]                  public DateTime  UpdatedAt         { get; set; }
    [Column("resolved_at")]                 public DateTime? ResolvedAt        { get; set; }
    [Column("parent_id")]                   public string?   ParentId          { get; set; }
}

// ── Repository ────────────────────────────────────────────────────────────────

public class WorkspaceRepository : IWorkspaceRepository
{
    private readonly Supabase.Client _db;
    public WorkspaceRepository(Supabase.Client db) => _db = db;

    // ── Shared workspaces ─────────────────────────────────────────────────────

    public async Task<SharedWorkspace?> GetWorkspaceAsync(Guid workspaceId)
    {
        var row = await _db.From<SharedWorkspaceRow>()
            .Filter("id", Operator.Equals, workspaceId.ToString()).Single();
        return row == null ? null : WorkspaceToDomain(row);
    }

    public async Task<List<SharedWorkspace>> GetTeamWorkspacesAsync(Guid teamId)
    {
        var result = await _db.From<SharedWorkspaceRow>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Order("shared_at", Ordering.Descending)
            .Get();
        return result.Models.Select(WorkspaceToDomain).ToList();
    }

    public async Task<List<SharedWorkspace>> GetUserSharedWorkspacesAsync(Guid userId)
    {
        // All workspaces the user can access = their teams' workspaces
        var memberships = await _db.From<TeamMemberRow>()
            .Filter("user_id", Operator.Equals, userId.ToString()).Get();
        var teamIds = memberships.Models.Select(m => m.TeamId).Distinct().ToList();

        var workspaces = new List<SharedWorkspace>();
        foreach (var tid in teamIds)
        {
            var result = await _db.From<SharedWorkspaceRow>()
                .Filter("team_id", Operator.Equals, tid).Get();
            workspaces.AddRange(result.Models.Select(WorkspaceToDomain));
        }
        return workspaces.OrderByDescending(w => w.SharedAt).ToList();
    }

    public async Task<SharedWorkspace> ShareAnalysisAsync(SharedWorkspace ws)
    {
        // An analysis has one workspace per team (a unique rule in the
        // database). Sharing it again gives back the one that exists, with its
        // annotations, instead of an error.
        var existing = await _db.From<SharedWorkspaceRow>()
            .Filter("team_id",     Operator.Equals, ws.TeamId.ToString())
            .Filter("analysis_id", Operator.Equals, ws.AnalysisId.ToString())
            .Get();
        if (existing.Models.FirstOrDefault() is { } row)
            return WorkspaceToDomain(row);

        await _db.From<SharedWorkspaceRow>().Insert(new SharedWorkspaceRow
        {
            Id         = ws.Id.ToString(),
            TeamId     = ws.TeamId.ToString(),
            AnalysisId = ws.AnalysisId.ToString(),
            SharedBy   = ws.SharedBy.ToString(),
            SharedAt   = ws.SharedAt,
        });
        return ws;
    }

    public async Task UnshareAsync(Guid workspaceId) =>
        await _db.From<SharedWorkspaceRow>()
            .Filter("id", Operator.Equals, workspaceId.ToString())
            .Delete();

    // ── Permissions ───────────────────────────────────────────────────────────

    public async Task<List<WorkspaceFilePermission>> GetPermissionsAsync(Guid workspaceId)
    {
        var result = await _db.From<WorkspacePermissionRow>()
            .Filter("shared_workspace_id", Operator.Equals, workspaceId.ToString()).Get();
        return result.Models.Select(PermToDomain).ToList();
    }

    public async Task SetPermissionAsync(WorkspaceFilePermission perm)
    {
        // One row per person per file type (a unique rule in the database), so
        // changing a permission has to find the row it is changing. Upserting
        // on a fresh id made every second change fail.
        var existing = await _db.From<WorkspacePermissionRow>()
            .Filter("shared_workspace_id", Operator.Equals, perm.SharedWorkspaceId.ToString())
            .Filter("user_id",             Operator.Equals, perm.UserId.ToString())
            .Filter("file_type",           Operator.Equals, perm.FileType)
            .Get();
        if (existing.Models.FirstOrDefault() is { } row)
        {
            await _db.From<WorkspacePermissionRow>()
                .Filter("id", Operator.Equals, row.Id)
                .Set(r => r.Permission, perm.Permission)
                .Set(r => r.GrantedBy!, perm.GrantedBy?.ToString())
                .Set(r => r.UpdatedAt,  perm.UpdatedAt)
                .Update();
            return;
        }

        await _db.From<WorkspacePermissionRow>().Insert(new WorkspacePermissionRow
        {
            Id                = perm.Id.ToString(),
            SharedWorkspaceId = perm.SharedWorkspaceId.ToString(),
            UserId            = perm.UserId.ToString(),
            FileType          = perm.FileType,
            Permission        = perm.Permission,
            GrantedBy         = perm.GrantedBy?.ToString(),
            UpdatedAt         = perm.UpdatedAt,
        });
    }

    public async Task RemovePermissionAsync(Guid workspaceId, Guid userId, string fileType) =>
        await _db.From<WorkspacePermissionRow>()
            .Filter("shared_workspace_id", Operator.Equals, workspaceId.ToString())
            .Filter("user_id",             Operator.Equals, userId.ToString())
            .Filter("file_type",           Operator.Equals, fileType)
            .Delete();

    // ── Annotations ───────────────────────────────────────────────────────────

    public async Task<List<Annotation>> GetAnnotationsAsync(Guid workspaceId, string? fileType = null)
    {
        var q = _db.From<AnnotationRow>()
            .Filter("shared_workspace_id", Operator.Equals, workspaceId.ToString());

        if (fileType != null)
            q = q.Filter("file_type", Operator.Equals, fileType);

        var result = await q.Order("created_at", Ordering.Ascending).Get();
        var all    = result.Models.Select(AnnToDomain).ToList();

        // Build thread structure: nest replies under their parents
        var topLevel = all.Where(a => a.ParentId == null).ToList();
        foreach (var ann in topLevel)
            ann.Replies = all.Where(a => a.ParentId == ann.Id).ToList();

        return topLevel;
    }

    public async Task<Annotation> AddAnnotationAsync(Annotation ann)
    {
        await _db.From<AnnotationRow>().Insert(new AnnotationRow
        {
            Id                = ann.Id.ToString(),
            SharedWorkspaceId = ann.SharedWorkspaceId.ToString(),
            UserId            = ann.UserId.ToString(),
            FileType          = ann.FileType,
            Content           = ann.Content,
            Position          = ann.Position,
            CreatedAt         = ann.CreatedAt,
            UpdatedAt         = ann.UpdatedAt,
            ParentId          = ann.ParentId?.ToString(),
        });
        return ann;
    }

    public async Task EditAnnotationAsync(Guid annotationId, Guid userId, string content) =>
        await _db.From<AnnotationRow>()
            .Filter("id",      Operator.Equals, annotationId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Set(r => r.Content,    content)
            .Set(r => r.UpdatedAt,  DateTime.UtcNow)
            .Update();

    public async Task ResolveAnnotationAsync(Guid annotationId, Guid userId) =>
        await _db.From<AnnotationRow>()
            .Filter("id",      Operator.Equals, annotationId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Set(r => r.ResolvedAt!, DateTime.UtcNow)
            .Update();

    public async Task DeleteAnnotationAsync(Guid annotationId, Guid userId)
    {
        var own = await _db.From<AnnotationRow>()
            .Filter("id",      Operator.Equals, annotationId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get();
        if (own.Models.Count == 0) return;

        // The database refuses to delete a comment that still has replies.
        await _db.From<AnnotationRow>()
            .Filter("parent_id", Operator.Equals, annotationId.ToString())
            .Delete();
        await _db.From<AnnotationRow>()
            .Filter("id", Operator.Equals, annotationId.ToString())
            .Delete();
    }

    public async Task DeleteRepliesToUserAsync(Guid userId)
    {
        var own = await _db.From<AnnotationRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get();

        foreach (var annotation in own.Models)
            await _db.From<AnnotationRow>()
                .Filter("parent_id", Operator.Equals, annotation.Id)
                .Delete();
    }

    // ── Mappers ───────────────────────────────────────────────────────────────

    // Restore, never the constructors. Those are for new records and make up a
    // fresh id and date, so a saved workspace came back with an id nothing could
    // find, and a reply could never match its parent.

    private static SharedWorkspace WorkspaceToDomain(SharedWorkspaceRow r) => SharedWorkspace.Restore(
        Guid.Parse(r.Id), Guid.Parse(r.TeamId), Guid.Parse(r.AnalysisId), Guid.Parse(r.SharedBy), r.SharedAt);

    private static WorkspaceFilePermission PermToDomain(WorkspacePermissionRow r) =>
        WorkspaceFilePermission.Restore(
            Guid.Parse(r.Id), Guid.Parse(r.SharedWorkspaceId), Guid.Parse(r.UserId),
            r.FileType, r.Permission,
            r.GrantedBy != null ? Guid.Parse(r.GrantedBy) : null,
            r.UpdatedAt);

    private static Annotation AnnToDomain(AnnotationRow r) => Annotation.Restore(
        Guid.Parse(r.Id), Guid.Parse(r.SharedWorkspaceId), Guid.Parse(r.UserId),
        r.FileType, r.Content, r.Position, r.CreatedAt, r.UpdatedAt, r.ResolvedAt,
        r.ParentId != null ? Guid.Parse(r.ParentId) : null);
}
