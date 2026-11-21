using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Domain.Entities;
using Microsoft.AspNetCore.SignalR;

namespace backend.Hubs;

/// <summary>Who was in a team and what it shared, read just before the team is deleted.</summary>
public sealed record TeamSnapshot(Guid TeamId, IReadOnlyList<Guid> Members, IReadOnlyList<SharedWorkspace> Workspaces);

/// <summary>
/// Keeps the live channels in step with team membership.
///
/// The REST routes ask the database who is in a team on every call. The live
/// channels remember the answer, because cursor events arrive far too often to
/// ask each time, and a report open in the editor stays open. So whatever
/// changes membership has to say so here.
/// </summary>
public interface ILiveAccess
{
    /// <summary>The user joined a team: forget any earlier "not a member".</summary>
    void Granted(Guid userId);

    /// <summary>The user left or was removed from a team: end their live access to what it shares.</summary>
    Task RevokedAsync(Guid teamId, Guid userId);

    /// <summary>Read who is in the team and what it shares, before it is deleted.</summary>
    Task<TeamSnapshot> BeforeDeleteAsync(Guid teamId);

    /// <summary>The team is gone: end everyone's live access to what it shared.</summary>
    Task DeletedAsync(TeamSnapshot team);
}

public class LiveAccess : ILiveAccess
{
    private readonly IHubContext<CollaborationHub> _hub;
    private readonly IHubContext<ReportHub>        _reportHub;
    private readonly IWorkspaceRepository          _workspaces;
    private readonly ITeamRepository               _teams;
    private readonly ReportAccess                  _access;
    private readonly ILogger<LiveAccess>           _logger;

    public LiveAccess(IHubContext<CollaborationHub> hub, IHubContext<ReportHub> reportHub,
                      IWorkspaceRepository workspaces, ITeamRepository teams, ReportAccess access,
                      ILogger<LiveAccess> logger)
    {
        _hub        = hub;
        _reportHub  = reportHub;
        _workspaces = workspaces;
        _teams      = teams;
        _access     = access;
        _logger     = logger;
    }

    public void Granted(Guid userId) => CollaborationHub.ForgetUser(userId);

    public async Task RevokedAsync(Guid teamId, Guid userId) =>
        await EndAsync(userId, await _workspaces.GetTeamWorkspacesAsync(teamId));

    public async Task<TeamSnapshot> BeforeDeleteAsync(Guid teamId)
    {
        var members = (await _teams.GetMembersAsync(teamId)).Select(m => m.UserId).ToList();
        if (await _teams.GetTeamAsync(teamId) is { } team) members.Add(team.OwnerId);
        return new TeamSnapshot(teamId, members.Distinct().ToList(), await _workspaces.GetTeamWorkspacesAsync(teamId));
    }

    public async Task DeletedAsync(TeamSnapshot team)
    {
        // The team is already deleted: one person's failure must not leave the rest connected.
        foreach (var member in team.Members)
        {
            try { await EndAsync(member, team.Workspaces); }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[Live] Could not end live access of {User} to deleted team {Team}",
                                   member, team.TeamId);
            }
        }
    }

    private async Task EndAsync(Guid userId, IReadOnlyCollection<SharedWorkspace> shared)
    {
        await CollaborationHub.EvictAsync(_hub, userId, shared.Select(w => w.Id));

        // Reports open through this team, unless the person may still read
        // them another way: their own, or shared with another team of theirs.
        var lost = new List<Guid>();
        foreach (var analysisId in shared.Select(w => w.AnalysisId).Distinct().Intersect(ReportHub.Watching(userId)))
            if ((await _access.ForAsync(userId, analysisId)).Role == ReportRole.None)
                lost.Add(analysisId);
        if (lost.Count > 0) await ReportHub.StopWatchingAsync(_reportHub, userId, lost);
    }
}
