using backend.Domain.Entities;

namespace backend.Application.Interfaces;

public interface IWorkspaceRepository
{
    // ── Shared workspaces ─────────────────────────────────────────────────────
    Task<SharedWorkspace?>      GetWorkspaceAsync(Guid workspaceId);
    Task<List<SharedWorkspace>> GetTeamWorkspacesAsync(Guid teamId);
    Task<List<SharedWorkspace>> GetUserSharedWorkspacesAsync(Guid userId); // workspaces the user has access to
    Task<SharedWorkspace>       ShareAnalysisAsync(SharedWorkspace workspace);
    Task                        UnshareAsync(Guid workspaceId);

    // ── Permissions ───────────────────────────────────────────────────────────
    Task<List<WorkspaceFilePermission>> GetPermissionsAsync(Guid workspaceId);
    Task                                SetPermissionAsync(WorkspaceFilePermission permission);
    Task                                RemovePermissionAsync(Guid workspaceId, Guid userId, string fileType);

    // ── Annotations ───────────────────────────────────────────────────────────
    Task<List<Annotation>> GetAnnotationsAsync(Guid workspaceId, string? fileType = null);
    Task<Annotation>       AddAnnotationAsync(Annotation annotation);
    Task                   EditAnnotationAsync(Guid annotationId, Guid userId, string content);
    Task                   ResolveAnnotationAsync(Guid annotationId, Guid userId);
    Task                   DeleteAnnotationAsync(Guid annotationId, Guid userId);

    /// <summary>
    /// Delete other people's replies to this user's comments, so the user's
    /// account can be deleted. The database refuses to delete a comment that
    /// still has replies, and deleting a user deletes their comments.
    /// </summary>
    Task                   DeleteRepliesToUserAsync(Guid userId);
}
