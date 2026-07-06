namespace backend.Domain.Entities;

public class SharedWorkspace
{
    public Guid     Id          { get; private set; }
    public Guid     TeamId      { get; private set; }
    public Guid     AnalysisId  { get; private set; }
    public Guid     SharedBy    { get; private set; }
    public DateTime SharedAt    { get; private set; }

    // Populated via JOIN for display
    public Analysis?  Analysis    { get; set; }
    public string?    TeamName    { get; set; }
    public List<WorkspaceFilePermission> Permissions { get; set; } = new();
    public List<Annotation>             Annotations  { get; set; } = new();

    protected SharedWorkspace() { }

    public SharedWorkspace(Guid teamId, Guid analysisId, Guid sharedBy)
    {
        Id         = Guid.NewGuid();
        TeamId     = teamId;
        AnalysisId = analysisId;
        SharedBy   = sharedBy;
        SharedAt   = DateTime.UtcNow;
    }

    public static SharedWorkspace Restore(
        Guid id, Guid teamId, Guid analysisId, Guid sharedBy, DateTime sharedAt) =>
        new() { Id = id, TeamId = teamId, AnalysisId = analysisId, SharedBy = sharedBy, SharedAt = sharedAt };
}

/// <summary>
/// Per-file permission for a specific user in a shared workspace.
/// file_type: "original_csv" | "cleaned_csv" | "pdf" | "word" | "pptx" | "charts" | "all"
/// permission: "view" | "edit" | "none"
/// Default when no row exists: editors get "edit", viewers get "view".
/// </summary>
public class WorkspaceFilePermission
{
    public Guid     Id                { get; private set; }
    public Guid     SharedWorkspaceId { get; private set; }
    public Guid     UserId            { get; private set; }
    public string   FileType          { get; private set; } = null!;
    public string   Permission        { get; private set; } = "view";
    public Guid?    GrantedBy         { get; private set; }
    public DateTime UpdatedAt         { get; private set; }

    protected WorkspaceFilePermission() { }

    public WorkspaceFilePermission(
        Guid workspaceId, Guid userId, string fileType, string permission, Guid grantedBy)
    {
        Id                = Guid.NewGuid();
        SharedWorkspaceId = workspaceId;
        UserId            = userId;
        FileType          = fileType;
        Permission        = permission;
        GrantedBy         = grantedBy;
        UpdatedAt         = DateTime.UtcNow;
    }

    public void SetPermission(string p) { Permission = p; UpdatedAt = DateTime.UtcNow; }
}

/// <summary>
/// A comment or annotation on a file inside a shared workspace.
/// Supports threaded replies via ParentId.
/// Position JSON shape varies by file type:
///   PDF:     { "page": 1, "x": 0.45, "y": 0.30 }
///   CSV:     { "row": 3, "col": 1 }
///   General: { "section": "insight-2" }
/// </summary>
public class Annotation
{
    public Guid      Id                { get; private set; }
    public Guid      SharedWorkspaceId { get; private set; }
    public Guid      UserId            { get; private set; }
    public string    FileType          { get; private set; } = null!;
    public string    Content           { get; private set; } = null!;
    public string?   Position          { get; private set; }
    public DateTime  CreatedAt         { get; private set; }
    public DateTime  UpdatedAt         { get; private set; }
    public DateTime? ResolvedAt        { get; private set; }
    public Guid?     ParentId          { get; private set; }

    // Populated for display
    public string? AuthorName  { get; set; }
    public string? AuthorEmail { get; set; }
    public List<Annotation> Replies { get; set; } = new();

    protected Annotation() { }

    public Annotation(
        Guid workspaceId, Guid userId, string fileType,
        string content, string? position = null, Guid? parentId = null)
    {
        Id                = Guid.NewGuid();
        SharedWorkspaceId = workspaceId;
        UserId            = userId;
        FileType          = fileType;
        Content           = content;
        Position          = position;
        ParentId          = parentId;
        CreatedAt         = DateTime.UtcNow;
        UpdatedAt         = DateTime.UtcNow;
    }

    public void Edit(string content) { Content = content; UpdatedAt = DateTime.UtcNow; }
    public void Resolve()             => ResolvedAt = DateTime.UtcNow;
    public void Reopen()              => ResolvedAt = null;
}
