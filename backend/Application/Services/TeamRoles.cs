using backend.Application.Interfaces;

namespace backend.Application.Services;

/// <summary>
/// What each team role may do. The invite form offered Viewer and Editor, the
/// choice was saved, and nothing ever read it: a viewer could invite people,
/// even as editors, and share analyses into the team.
///
///   Viewer — read what is shared and comment on it.
///   Editor — also share analyses with the team and invite people.
///   Owner  — everything, including roles, removing members and deleting the team.
/// </summary>
public static class TeamRoles
{
    public const string ViewerCannot = "Viewers can read and comment. Ask the team owner to make you an editor to do this.";

    /// <summary>May this user share analyses into the team and invite people?</summary>
    public static async Task<bool> CanContributeAsync(this ITeamRepository teams, Guid teamId, Guid userId)
    {
        var team = await teams.GetTeamAsync(teamId);
        if (team == null) return false;
        if (team.OwnerId == userId) return true;

        var members = await teams.GetMembersAsync(teamId);
        return members.Any(m => m.UserId == userId && m.Role is ("owner" or "editor"));
    }
}
