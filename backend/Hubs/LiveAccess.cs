using backend.Application.Interfaces;
using Microsoft.AspNetCore.SignalR;

namespace backend.Hubs;

/// <summary>
/// Keeps the live channel in step with team membership.
///
/// The REST routes ask the database who is in a team on every call. The live
/// channel remembers the answer, because cursor events arrive far too often to
/// ask each time. So whatever changes membership has to say so here.
/// </summary>
public interface ILiveAccess
{
    /// <summary>The user joined a team: forget any earlier "not a member".</summary>
    void Granted(Guid userId);

    /// <summary>The user left or was removed from a team: end their live access to what it shares.</summary>
    Task RevokedAsync(Guid teamId, Guid userId);
}

public class LiveAccess : ILiveAccess
{
    private readonly IHubContext<CollaborationHub> _hub;
    private readonly IWorkspaceRepository          _workspaces;

    public LiveAccess(IHubContext<CollaborationHub> hub, IWorkspaceRepository workspaces)
    {
        _hub        = hub;
        _workspaces = workspaces;
    }

    public void Granted(Guid userId) => CollaborationHub.ForgetUser(userId);

    public async Task RevokedAsync(Guid teamId, Guid userId)
    {
        var shared = await _workspaces.GetTeamWorkspacesAsync(teamId);
        await CollaborationHub.EvictAsync(_hub, userId, shared.Select(w => w.Id));
    }
}
