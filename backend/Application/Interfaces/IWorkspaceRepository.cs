using backend.Domain.Entities;

namespace backend.Application.Interfaces;

public interface IWorkspaceRepository
{
    // ── Shared workspaces ─────────────────────────────────────────────────────
    Task<SharedWorkspace?>      GetWorkspaceAsync(Guid workspaceId);
    Task<List<SharedWorkspace>> GetTeamWorkspacesAsync(Guid teamId);
    Task<List<SharedWorkspace>> GetUserSharedWorkspacesAsync(Guid userId); // workspaces the user has access to
    Task<SharedWorkspace>       ShareAnalysisAsync(SharedWorkspace workspace);
    Task                        UnshareAsync(Guid workspaceId, Guid requestingUserId);

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
}
