using backend.Application.Interfaces;
using backend.Domain.Entities;

namespace backend.Tests.Helpers;

/// <summary>
/// Doubles for the account-deletion path. Only the calls it makes are kept:
/// anything else fails loudly, so a test can't pass by reaching one by accident.
/// </summary>
public class FakeTeamRepository : ITeamRepository
{
    public List<Guid> ClearedInviters { get; } = new();

    public Task ClearInviterAsync(Guid userId)
    {
        ClearedInviters.Add(userId);
        return Task.CompletedTask;
    }

    // Set a team to answer team, member and invite calls; without one they fail loudly.
    public Team? Team { get; set; }
    public List<TeamMember> MemberRows { get; } = new();
    public List<TeamInvite> CreatedInvites { get; } = new();

    public Task<Team?> GetTeamAsync(Guid teamId) =>
        Team != null ? Task.FromResult<Team?>(Team.Id == teamId ? Team : null) : throw new NotSupportedException();
    public Task<List<Team>> GetUserTeamsAsync(Guid userId) => Task.FromResult(new List<Team>());
    public Task<Team> CreateTeamAsync(Team team) => throw new NotSupportedException();
    public Task UpdateTeamAsync(Team team) => throw new NotSupportedException();
    public Task DeleteTeamAsync(Guid teamId, Guid ownerId) => throw new NotSupportedException();
    public Task<List<TeamMember>> GetMembersAsync(Guid teamId) =>
        Team != null ? Task.FromResult(MemberRows.ToList()) : throw new NotSupportedException();
    public Task AddMemberAsync(TeamMember member) => throw new NotSupportedException();
    public Task UpdateMemberRoleAsync(Guid teamId, Guid userId, string role) => throw new NotSupportedException();
    public Task RemoveMemberAsync(Guid teamId, Guid userId) => throw new NotSupportedException();
    public HashSet<Guid> Members { get; } = new();
    public Task<bool> IsMemberAsync(Guid teamId, Guid userId) => Task.FromResult(Members.Contains(userId));
    public Task<TeamInvite?> GetInviteByTokenAsync(string token) => throw new NotSupportedException();
    public Task<List<TeamInvite>> GetPendingInvitesAsync(Guid teamId) => throw new NotSupportedException();
    public Task<TeamInvite> CreateInviteAsync(TeamInvite invite)
    {
        if (Team == null) throw new NotSupportedException();
        CreatedInvites.Add(invite);
        return Task.FromResult(invite);
    }
    public Task AcceptInviteAsync(string token) => throw new NotSupportedException();
    public Task RevokeInviteAsync(Guid inviteId, Guid teamId) => throw new NotSupportedException();
}

public class FakeWorkspaceRepository : IWorkspaceRepository
{
    public List<Guid> RepliesCleared { get; } = new();

    public Task DeleteRepliesToUserAsync(Guid userId)
    {
        RepliesCleared.Add(userId);
        return Task.CompletedTask;
    }

    public SharedWorkspace? Workspace { get; set; }
    public List<WorkspaceFilePermission> Permissions { get; } = new();

    public Task<SharedWorkspace?> GetWorkspaceAsync(Guid workspaceId) =>
        Task.FromResult(Workspace?.Id == workspaceId ? Workspace : null);
    public Task<List<SharedWorkspace>> GetTeamWorkspacesAsync(Guid teamId) => throw new NotSupportedException();
    public Task<List<SharedWorkspace>> GetUserSharedWorkspacesAsync(Guid userId) =>
        Task.FromResult(new List<SharedWorkspace>());
    public Task<SharedWorkspace> ShareAnalysisAsync(SharedWorkspace workspace) => throw new NotSupportedException();
    public Task UnshareAsync(Guid workspaceId) => throw new NotSupportedException();
    public Task<List<WorkspaceFilePermission>> GetPermissionsAsync(Guid workspaceId) =>
        Task.FromResult(Permissions.ToList());
    public Task SetPermissionAsync(WorkspaceFilePermission permission) => throw new NotSupportedException();
    public Task RemovePermissionAsync(Guid workspaceId, Guid userId, string fileType) => throw new NotSupportedException();
    public Task<List<Annotation>> GetAnnotationsAsync(Guid workspaceId, string? fileType = null) => throw new NotSupportedException();
    public Task<Annotation> AddAnnotationAsync(Annotation annotation) => throw new NotSupportedException();
    public Task EditAnnotationAsync(Guid annotationId, Guid userId, string content) => throw new NotSupportedException();
    public Task ResolveAnnotationAsync(Guid annotationId, Guid userId) => throw new NotSupportedException();
    public Task DeleteAnnotationAsync(Guid annotationId, Guid userId) => throw new NotSupportedException();
}

public class FakeAuthAdmin : IAuthAdmin
{
    public List<Guid> Deleted { get; } = new();

    public Task DeleteUserAsync(Guid userId)
    {
        Deleted.Add(userId);
        return Task.CompletedTask;
    }
}
