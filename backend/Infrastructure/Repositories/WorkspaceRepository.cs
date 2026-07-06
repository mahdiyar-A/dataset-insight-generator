using backend.Application.Interfaces;
using backend.Domain.Entities;
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
    [Column("position")]                    public string?   Position          { get; set; }
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
        await _db.From<SharedWorkspaceRow>().Upsert(new SharedWorkspaceRow
        {
            Id         = ws.Id.ToString(),
            TeamId     = ws.TeamId.ToString(),
            AnalysisId = ws.AnalysisId.ToString(),
            SharedBy   = ws.SharedBy.ToString(),
            SharedAt   = ws.SharedAt,
        });
        return ws;
    }

    public async Task UnshareAsync(Guid workspaceId, Guid requestingUserId)
    {
        // Only the person who shared it (or team owner) can unshare
        await _db.From<SharedWorkspaceRow>()
            .Filter("id",        Operator.Equals, workspaceId.ToString())
            .Filter("shared_by", Operator.Equals, requestingUserId.ToString())
            .Delete();
    }

    // ── Permissions ───────────────────────────────────────────────────────────

    public async Task<List<WorkspaceFilePermission>> GetPermissionsAsync(Guid workspaceId)
    {
        var result = await _db.From<WorkspacePermissionRow>()
            .Filter("shared_workspace_id", Operator.Equals, workspaceId.ToString()).Get();
        return result.Models.Select(PermToDomain).ToList();
    }

    public async Task SetPermissionAsync(WorkspaceFilePermission perm)
    {
        await _db.From<WorkspacePermissionRow>().Upsert(new WorkspacePermissionRow
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

    public async Task DeleteAnnotationAsync(Guid annotationId, Guid userId) =>
        await _db.From<AnnotationRow>()
            .Filter("id",      Operator.Equals, annotationId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Delete();

    // ── Mappers ───────────────────────────────────────────────────────────────

    private static SharedWorkspace WorkspaceToDomain(SharedWorkspaceRow r) => new(
        Guid.Parse(r.TeamId), Guid.Parse(r.AnalysisId), Guid.Parse(r.SharedBy))
    {
        // We need SharedWorkspace to expose a Restore for Id/SharedAt
    };

    private static WorkspaceFilePermission PermToDomain(WorkspacePermissionRow r) =>
        new(Guid.Parse(r.SharedWorkspaceId), Guid.Parse(r.UserId),
            r.FileType, r.Permission,
            r.GrantedBy != null ? Guid.Parse(r.GrantedBy) : Guid.Empty);

    private static Annotation AnnToDomain(AnnotationRow r) => new(
        Guid.Parse(r.SharedWorkspaceId), Guid.Parse(r.UserId),
        r.FileType, r.Content, r.Position,
        r.ParentId != null ? Guid.Parse(r.ParentId) : null);
}
