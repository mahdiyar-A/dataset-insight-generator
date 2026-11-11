using backend.Application.Interfaces;
using backend.Domain.Entities;
using backend.Hubs;

namespace backend.Tests.Helpers;

/// <summary>
/// A team held in memory. Without a Team set, only the calls the
/// account-deletion path makes are answered: anything else fails loudly, so a
/// test can't pass by reaching one by accident.
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

    /// <summary>Every invitation ever created, withdrawn or not.</summary>
    public List<TeamInvite> CreatedInvites { get; } = new();
    public List<Guid>       RevokedInvites { get; } = new();
    public List<string>     AcceptedTokens { get; } = new();
    public List<(Guid User, string Role)> RoleChanges { get; } = new();

    private void NeedsTeam() { if (Team == null) throw new NotSupportedException(); }

    public Task<Team?> GetTeamAsync(Guid teamId) =>
        Team != null ? Task.FromResult<Team?>(Team.Id == teamId ? Team : null) : throw new NotSupportedException();
    public Task<List<Team>> GetUserTeamsAsync(Guid userId) => Task.FromResult(new List<Team>());
    public Task<Team> CreateTeamAsync(Team team) => throw new NotSupportedException();
    public Task UpdateTeamAsync(Team team) => throw new NotSupportedException();
    public Task DeleteTeamAsync(Guid teamId, Guid ownerId) => throw new NotSupportedException();
    public Task<List<TeamMember>> GetMembersAsync(Guid teamId) =>
        Team != null ? Task.FromResult(MemberRows.ToList()) : throw new NotSupportedException();

    public Task AddMemberAsync(TeamMember member)
    {
        NeedsTeam();
        MemberRows.Add(member);
        Members.Add(member.UserId);
        return Task.CompletedTask;
    }

    public Task UpdateMemberRoleAsync(Guid teamId, Guid userId, string role)
    {
        NeedsTeam();
        RoleChanges.Add((userId, role));
        var index = MemberRows.FindIndex(m => m.UserId == userId);
        if (index >= 0) MemberRows[index] = new TeamMember(teamId, userId, role);
        return Task.CompletedTask;
    }

    public Task RemoveMemberAsync(Guid teamId, Guid userId)
    {
        NeedsTeam();
        MemberRows.RemoveAll(m => m.UserId == userId);
        Members.Remove(userId);
        return Task.CompletedTask;
    }

    public HashSet<Guid> Members { get; } = new();
    public Task<bool> IsMemberAsync(Guid teamId, Guid userId) => Task.FromResult(Members.Contains(userId));

    private bool Withdrawn(TeamInvite invite) => RevokedInvites.Contains(invite.Id);
    private bool Accepted(TeamInvite invite)  => AcceptedTokens.Contains(invite.Token);

    public Task<TeamInvite?> GetInviteByTokenAsync(string token)
    {
        NeedsTeam();
        var invite = CreatedInvites.FirstOrDefault(i => i.Token == token && !Withdrawn(i));
        if (invite != null && Accepted(invite)) invite.Accept();
        return Task.FromResult(invite);
    }

    public Task<List<TeamInvite>> GetPendingInvitesAsync(Guid teamId)
    {
        NeedsTeam();
        return Task.FromResult(CreatedInvites.Where(i => i.IsPending && !Withdrawn(i) && !Accepted(i)).ToList());
    }

    public Task<TeamInvite> CreateInviteAsync(TeamInvite invite)
    {
        NeedsTeam();
        CreatedInvites.Add(invite);
        return Task.FromResult(invite);
    }

    public Task AcceptInviteAsync(string token)
    {
        NeedsTeam();
        AcceptedTokens.Add(token);
        return Task.CompletedTask;
    }

    public Task RevokeInviteAsync(Guid inviteId, Guid teamId)
    {
        NeedsTeam();
        RevokedInvites.Add(inviteId);
        return Task.CompletedTask;
    }
}

/// <summary>
/// One shared workspace held in memory. As with the team: without a Workspace
/// set, the calls that change one fail loudly.
/// </summary>
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
    public List<Annotation> Annotations { get; } = new();

    private void NeedsWorkspace() { if (Workspace == null) throw new NotSupportedException(); }

    public Task<SharedWorkspace?> GetWorkspaceAsync(Guid workspaceId) =>
        Task.FromResult(Workspace?.Id == workspaceId ? Workspace : null);

    public Task<List<SharedWorkspace>> GetTeamWorkspacesAsync(Guid teamId)
    {
        NeedsWorkspace();
        return Task.FromResult(Workspace!.TeamId == teamId
            ? new List<SharedWorkspace> { Workspace } : new List<SharedWorkspace>());
    }

    public Task<List<SharedWorkspace>> GetUserSharedWorkspacesAsync(Guid userId) =>
        Task.FromResult(new List<SharedWorkspace>());
    public Task<SharedWorkspace> ShareAnalysisAsync(SharedWorkspace workspace) => throw new NotSupportedException();
    public Task UnshareAsync(Guid workspaceId) => throw new NotSupportedException();
    public Task<List<WorkspaceFilePermission>> GetPermissionsAsync(Guid workspaceId) =>
        Task.FromResult(Permissions.ToList());

    public Task SetPermissionAsync(WorkspaceFilePermission permission)
    {
        NeedsWorkspace();
        Permissions.RemoveAll(p => p.UserId == permission.UserId && p.FileType == permission.FileType);
        Permissions.Add(permission);
        return Task.CompletedTask;
    }

    public Task RemovePermissionAsync(Guid workspaceId, Guid userId, string fileType) => throw new NotSupportedException();
    public Task<List<Annotation>> GetAnnotationsAsync(Guid workspaceId, string? fileType = null)
    {
        NeedsWorkspace();
        return Task.FromResult(Annotations
            .Where(a => a.SharedWorkspaceId == workspaceId && a.ParentId == null
                     && (fileType == null || a.FileType == fileType))
            .ToList());
    }

    public Task<Annotation> AddAnnotationAsync(Annotation annotation)
    {
        NeedsWorkspace();
        Annotations.Add(annotation);
        return Task.FromResult(annotation);
    }

    public Task<Annotation?> EditAnnotationAsync(Guid workspaceId, Guid annotationId, Guid userId, string content)
    {
        NeedsWorkspace();
        var own = Annotations.FirstOrDefault(a =>
            a.Id == annotationId && a.SharedWorkspaceId == workspaceId && a.UserId == userId);
        own?.Edit(content);
        return Task.FromResult(own);
    }

    public Task<bool> ResolveAnnotationAsync(Guid workspaceId, Guid annotationId)
    {
        NeedsWorkspace();
        var found = Annotations.FirstOrDefault(a => a.Id == annotationId && a.SharedWorkspaceId == workspaceId);
        found?.Resolve();
        return Task.FromResult(found != null);
    }

    public Task DeleteAnnotationAsync(Guid annotationId, Guid userId) => throw new NotSupportedException();
}

/// <summary>Records what the controllers tell the live channel about membership.</summary>
public class FakeLiveAccess : ILiveAccess
{
    public List<Guid> GrantedTo { get; } = new();
    public List<(Guid Team, Guid User)> RevokedFrom { get; } = new();

    public void Granted(Guid userId) => GrantedTo.Add(userId);

    public Task RevokedAsync(Guid teamId, Guid userId)
    {
        RevokedFrom.Add((teamId, userId));
        return Task.CompletedTask;
    }
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
