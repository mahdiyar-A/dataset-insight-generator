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
}
