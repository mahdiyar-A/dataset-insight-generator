using backend.Domain.Entities;

namespace backend.Application.Interfaces;

public interface ITeamRepository
{
    // ── Teams ─────────────────────────────────────────────────────────────────
    Task<Team?>            GetTeamAsync(Guid teamId);
    Task<List<Team>>       GetUserTeamsAsync(Guid userId);
    Task<Team>             CreateTeamAsync(Team team);
    Task                   UpdateTeamAsync(Team team);
    Task                   DeleteTeamAsync(Guid teamId, Guid ownerId);

    // ── Members ───────────────────────────────────────────────────────────────
    Task<List<TeamMember>> GetMembersAsync(Guid teamId);
    Task                   AddMemberAsync(TeamMember member);
    Task                   UpdateMemberRoleAsync(Guid teamId, Guid userId, string role);
    Task                   RemoveMemberAsync(Guid teamId, Guid userId);
    Task<bool>             IsMemberAsync(Guid teamId, Guid userId);

    // ── Invites ───────────────────────────────────────────────────────────────
    Task<TeamInvite?>      GetInviteByTokenAsync(string token);
    Task<List<TeamInvite>> GetPendingInvitesAsync(Guid teamId);
    Task<TeamInvite>       CreateInviteAsync(TeamInvite invite);
    Task                   AcceptInviteAsync(string token);
    Task                   RevokeInviteAsync(Guid inviteId, Guid teamId);

    /// <summary>
    /// Forget who sent these invites, so the sender's account can be deleted.
    /// The live database refuses to delete a user an invite still points at.
    /// The invites stay valid: they belong to the team, not to the sender.
    /// </summary>
    Task                   ClearInviterAsync(Guid userId);
}
