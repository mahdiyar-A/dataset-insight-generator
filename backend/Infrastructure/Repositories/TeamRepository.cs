using backend.Application.Interfaces;
using backend.Domain.Entities;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

// ── Row models ────────────────────────────────────────────────────────────────

[Table("teams")]
public class TeamRow : BaseModel
{
    [PrimaryKey("id", false)]   public string   Id          { get; set; } = "";
    [Column("name")]            public string   Name        { get; set; } = "";
    [Column("owner_id")]        public string   OwnerId     { get; set; } = "";
    [Column("invite_code")]     public string   InviteCode  { get; set; } = "";
    [Column("created_at")]      public DateTime CreatedAt   { get; set; }
}

[Table("team_members")]
public class TeamMemberRow : BaseModel
{
    [PrimaryKey("id", false)]   public string   Id       { get; set; } = "";
    [Column("team_id")]         public string   TeamId   { get; set; } = "";
    [Column("user_id")]         public string   UserId   { get; set; } = "";
    [Column("role")]            public string   Role     { get; set; } = "viewer";
    [Column("joined_at")]       public DateTime JoinedAt { get; set; }
}

[Table("team_invites")]
public class TeamInviteRow : BaseModel
{
    [PrimaryKey("id", false)]   public string    Id         { get; set; } = "";
    [Column("team_id")]         public string    TeamId     { get; set; } = "";
    [Column("email")]           public string    Email      { get; set; } = "";
    [Column("token")]           public string    Token      { get; set; } = "";
    [Column("role")]            public string    Role       { get; set; } = "viewer";
    [Column("invited_by")]      public string?   InvitedBy  { get; set; }
    [Column("created_at")]      public DateTime  CreatedAt  { get; set; }
    [Column("expires_at")]      public DateTime  ExpiresAt  { get; set; }
    [Column("accepted_at")]     public DateTime? AcceptedAt { get; set; }
}

// ── Repository ────────────────────────────────────────────────────────────────

public class TeamRepository : ITeamRepository
{
    private readonly Supabase.Client _db;
    public TeamRepository(Supabase.Client db) => _db = db;

    // ── Teams ─────────────────────────────────────────────────────────────────

    public async Task<Team?> GetTeamAsync(Guid teamId)
    {
        var row = await _db.From<TeamRow>()
            .Filter("id", Operator.Equals, teamId.ToString()).Single();
        return row == null ? null : TeamToDomain(row);
    }

    public async Task<List<Team>> GetUserTeamsAsync(Guid userId)
    {
        // Get teams where the user is a member (or owner)
        var memberRows = await _db.From<TeamMemberRow>()
            .Filter("user_id", Operator.Equals, userId.ToString()).Get();
        var teamIds = memberRows.Models.Select(m => m.TeamId).Distinct().ToList();

        var teams = new List<Team>();
        foreach (var tid in teamIds)
        {
            var row = await _db.From<TeamRow>()
                .Filter("id", Operator.Equals, tid).Single();
            if (row != null) teams.Add(TeamToDomain(row));
        }
        return teams;
    }

    public async Task<Team> CreateTeamAsync(Team team)
    {
        await _db.From<TeamRow>().Insert(new TeamRow
        {
            Id         = team.Id.ToString(),
            Name       = team.Name,
            OwnerId    = team.OwnerId.ToString(),
            InviteCode = team.InviteCode,
            CreatedAt  = team.CreatedAt,
        });
        // Auto-add owner as a member with "owner" role
        await AddMemberAsync(new TeamMember(team.Id, team.OwnerId, "owner"));
        return team;
    }

    public async Task UpdateTeamAsync(Team team) =>
        await _db.From<TeamRow>()
            .Filter("id", Operator.Equals, team.Id.ToString())
            .Set(r => r.Name,       team.Name)
            .Set(r => r.InviteCode, team.InviteCode)
            .Update();

    public async Task DeleteTeamAsync(Guid teamId, Guid ownerId) =>
        await _db.From<TeamRow>()
            .Filter("id",       Operator.Equals, teamId.ToString())
            .Filter("owner_id", Operator.Equals, ownerId.ToString())
            .Delete();

    // ── Members ───────────────────────────────────────────────────────────────

    public async Task<List<TeamMember>> GetMembersAsync(Guid teamId)
    {
        var result = await _db.From<TeamMemberRow>()
            .Filter("team_id", Operator.Equals, teamId.ToString()).Get();
        return result.Models.Select(MemberToDomain).ToList();
    }

    public async Task AddMemberAsync(TeamMember member) =>
        await _db.From<TeamMemberRow>().Upsert(new TeamMemberRow
        {
            Id       = member.Id.ToString(),
            TeamId   = member.TeamId.ToString(),
            UserId   = member.UserId.ToString(),
            Role     = member.Role,
            JoinedAt = member.JoinedAt,
        });

    public async Task UpdateMemberRoleAsync(Guid teamId, Guid userId, string role) =>
        await _db.From<TeamMemberRow>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Set(r => r.Role, role).Update();

    public async Task RemoveMemberAsync(Guid teamId, Guid userId) =>
        await _db.From<TeamMemberRow>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Delete();

    public async Task<bool> IsMemberAsync(Guid teamId, Guid userId)
    {
        var row = await _db.From<TeamMemberRow>()
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Single();
        return row != null;
    }

    // ── Invites ───────────────────────────────────────────────────────────────

    public async Task<TeamInvite?> GetInviteByTokenAsync(string token)
    {
        var row = await _db.From<TeamInviteRow>()
            .Filter("token", Operator.Equals, token).Single();
        return row == null ? null : InviteToDomain(row);
    }

    public async Task<List<TeamInvite>> GetPendingInvitesAsync(Guid teamId)
    {
        var result = await _db.From<TeamInviteRow>()
            .Filter("team_id",     Operator.Equals,  teamId.ToString())
            .Filter("accepted_at", Operator.Is, "null")
            .Get();
        return result.Models
            .Select(InviteToDomain)
            .Where(i => i.IsPending)
            .ToList();
    }

    public async Task<TeamInvite> CreateInviteAsync(TeamInvite invite)
    {
        await _db.From<TeamInviteRow>().Insert(new TeamInviteRow
        {
            Id        = invite.Id.ToString(),
            TeamId    = invite.TeamId.ToString(),
            Email     = invite.Email,
            Token     = invite.Token,
            Role      = invite.Role,
            InvitedBy = invite.InvitedBy?.ToString(),
            CreatedAt = invite.CreatedAt,
            ExpiresAt = invite.ExpiresAt,
        });
        return invite;
    }

    public async Task AcceptInviteAsync(string token) =>
        await _db.From<TeamInviteRow>()
            .Filter("token", Operator.Equals, token)
            .Set(r => r.AcceptedAt!, DateTime.UtcNow)
            .Update();

    public async Task RevokeInviteAsync(Guid inviteId, Guid teamId) =>
        await _db.From<TeamInviteRow>()
            .Filter("id",      Operator.Equals, inviteId.ToString())
            .Filter("team_id", Operator.Equals, teamId.ToString())
            .Delete();

    // ── Mappers ───────────────────────────────────────────────────────────────

    private static Team TeamToDomain(TeamRow r)
    {
        var t = new Team(Guid.Parse(r.OwnerId), r.Name);
        // Use reflection-free approach with object initializer through Restore
        return Team.Restore(Guid.Parse(r.Id), r.Name, Guid.Parse(r.OwnerId), r.InviteCode, r.CreatedAt);
    }

    private static TeamMember MemberToDomain(TeamMemberRow r) =>
        new(Guid.Parse(r.TeamId), Guid.Parse(r.UserId), r.Role);

    private static TeamInvite InviteToDomain(TeamInviteRow r) =>
        TeamInvite.Restore(
            Guid.Parse(r.Id), Guid.Parse(r.TeamId), r.Email, r.Token, r.Role,
            r.InvitedBy != null ? Guid.Parse(r.InvitedBy) : null,
            r.CreatedAt, r.ExpiresAt, r.AcceptedAt);
}
