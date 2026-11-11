using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Domain.Entities;
using backend.Hubs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace backend.Controllers;

/// <summary>
/// Manages collaboration teams: create, invite, manage members, delete.
/// All endpoints require Pro plan — enforced per-request.
/// </summary>
[ApiController]
[Route("api/teams")]
[Authorize]
public class TeamsController : ControllerBase
{
    private readonly ITeamRepository     _teams;
    private readonly IUserRepository     _users;
    private readonly IEmailService       _email;
    private readonly IConfiguration      _config;
    private readonly ILogger<TeamsController> _logger;
    private readonly ChatQuota           _quota;
    private readonly ILiveAccess         _live;

    /// <summary>
    /// Invitation emails one person can send a day. Every invite is an email
    /// from DIG's own address, on a sending allowance shared with sign-up and
    /// password-reset emails, and there was no limit at all.
    /// </summary>
    public const int InvitesPerDay = 20;

    /// <summary>
    /// People in one team, the owner included. Invitations not yet answered
    /// hold a seat too: otherwise ten could be sent and the sixth person to
    /// accept would find the team full. Nothing enforced a size before.
    /// </summary>
    public const int MaxMembers = 5;

    public TeamsController(
        ITeamRepository teams, IUserRepository users,
        IEmailService email, IConfiguration config,
        ILogger<TeamsController> logger, ChatQuota quota, ILiveAccess live)
    {
        _teams  = teams;
        _users  = users;
        _email  = email;
        _config = config;
        _logger = logger;
        _quota  = quota;
        _live   = live;
    }

    private Guid UserId()
    {
        var c = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(c) || !Guid.TryParse(c, out var id))
            throw new UnauthorizedAccessException();
        return id;
    }

    private async Task<bool> IsProAsync(Guid userId)
    {
        var user = await _users.GetByIdAsync(userId);
        return user?.Plan is "pro" or "admin";
    }

    // ── GET /api/teams ─────────────────────────────────────────────────────────
    // Returns all teams the user belongs to
    [HttpGet]
    public async Task<IActionResult> GetMyTeams()
    {
        var userId = UserId();
        var teams  = await _teams.GetUserTeamsAsync(userId);

        var result = new List<object>();
        foreach (var t in teams)
        {
            // The role decides what the pages offer: only editors and the owner
            // share analyses and invite people.
            var members = await _teams.GetMembersAsync(t.Id);
            var isOwner = t.OwnerId == userId;
            result.Add(new
            {
                t.Id, t.Name, t.OwnerId, t.InviteCode, t.CreatedAt,
                isOwner,
                myRole      = isOwner ? "owner" : members.FirstOrDefault(m => m.UserId == userId)?.Role ?? "viewer",
                memberCount = members.Count,
                maxMembers  = MaxMembers,
            });
        }
        return Ok(result);
    }

    // ── POST /api/teams ────────────────────────────────────────────────────────
    // Create a new team (pro only)
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTeamRequest req)
    {
        var userId = UserId();
        if (!await IsProAsync(userId))
            return StatusCode(402, new { error = "PRO_REQUIRED", message = "Team collaboration requires a Pro plan." });

        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "INVALID_NAME" });

        var team = new Team(userId, req.Name);
        await _teams.CreateTeamAsync(team);

        _logger.LogInformation("[Teams] Created team {Name} by user {UserId}", team.Name, userId);
        return Ok(new { team.Id, team.Name, team.InviteCode, team.CreatedAt });
    }

    // ── GET /api/teams/{id}/members ────────────────────────────────────────────
    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        if (!await _teams.IsMemberAsync(id, UserId()))
            return Forbid();

        var members = await _teams.GetMembersAsync(id);

        // Enrich with user info
        var result = new List<object>();
        foreach (var m in members)
        {
            var u = await _users.GetByIdAsync(m.UserId);
            result.Add(new
            {
                m.Id, m.UserId, m.Role, m.JoinedAt,
                userName = u?.UserName,
                email    = u?.Email,
                plan     = u?.Plan,
            });
        }
        return Ok(result);
    }

    // ── POST /api/teams/{id}/invite ────────────────────────────────────────────
    // Send an email invitation to join the team
    [HttpPost("{id:guid}/invite")]
    public async Task<IActionResult> Invite(Guid id, [FromBody] InviteRequest req)
    {
        var userId = UserId();
        if (!await _teams.IsMemberAsync(id, userId)) return Forbid();

        var team = await _teams.GetTeamAsync(id);
        if (team == null) return NotFound();

        if (!await IsProAsync(userId))
            return StatusCode(402, new { error = "PRO_REQUIRED" });

        if (!await _teams.CanContributeAsync(id, userId))
            return StatusCode(403, new { error = "EDITOR_REQUIRED", message = TeamRoles.ViewerCannot });

        var email = req.Email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || email.Length > 254
            || !System.Net.Mail.MailAddress.TryCreate(email, out var parsed) || parsed.Address != email)
            return BadRequest(new { error = "INVALID_EMAIL", message = "That doesn't look like an email address." });

        // Who this address belongs to, if anyone. The invitation is the same
        // either way; the reply tells the inviter what the person still needs.
        var invitee = await _users.GetByEmailAsync(email);
        var members = await _teams.GetMembersAsync(id);
        var pending = await _teams.GetPendingInvitesAsync(id);

        if (invitee != null && members.Any(m => m.UserId == invitee.Id))
            return Conflict(new { error = "ALREADY_MEMBER", message = $"{email} is already in this team." });

        if (pending.Any(i => i.Email == email))
            return Conflict(new
            {
                error   = "ALREADY_INVITED",
                message = $"{email} already has an invitation waiting. The team owner can revoke it to send a new one.",
            });

        if (members.Count + pending.Count >= MaxMembers)
            return Conflict(new
            {
                error   = "TEAM_FULL",
                message = $"A team holds up to {MaxMembers} people, counting invitations not yet answered. "
                        + "Remove a member or revoke an invitation to make room.",
            });

        if (!_quota.TryTake($"invite:{userId}", InvitesPerDay, out _))
            return StatusCode(429, new
            {
                error   = "INVITE_LIMIT",
                message = $"You've sent today's {InvitesPerDay} invitations. You can send more after midnight UTC.",
            });

        var role   = req.Role is "editor" or "viewer" ? req.Role : "viewer";
        var invite = new TeamInvite(id, email, role, userId);
        await _teams.CreateInviteAsync(invite);

        // Send invitation email
        var appUrl   = _config["AppUrl"]?.TrimEnd('/') ?? "https://datainsightgen.com";
        var inviteUrl = $"{appUrl}/invite/{invite.Token}";
        var inviter   = await _users.GetByIdAsync(userId);

        try
        {
            await _email.SendTeamInviteAsync(email, inviter?.UserName ?? "A DIG user",
                team.Name, inviteUrl, role);
        }
        catch (Exception ex)
        {
            // This used to be logged and then reported as "Invitation sent".
            // An invitation nobody received is not one: take it back, and give
            // back the day's allowance it used.
            _logger.LogError(ex, "[Teams] Failed to send invite email to {Email}", email);
            try { await _teams.RevokeInviteAsync(invite.Id, id); }
            catch (Exception revokeEx) { _logger.LogError(revokeEx, "[Teams] Could not withdraw unsent invite {Id}", invite.Id); }
            _quota.Refund($"invite:{userId}");
            return StatusCode(502, new
            {
                error   = "EMAIL_FAILED",
                message = "The invitation email couldn't be sent, so nothing was saved. Please try again in a few minutes.",
            });
        }

        var status = invitee == null ? "no_account"
                   : invitee.Plan is "pro" or "admin" ? "ready"
                   : "needs_pro";
        var next = status switch
        {
            "ready"     => "They can accept it from the email.",
            "needs_pro" => "They have a DIG account on the Free plan, and will need Pro to join.",
            _           => "They don't have a DIG account yet. They'll need to sign up with this address and be on Pro to join.",
        };

        return Ok(new { message = $"Invitation sent to {email}. {next}", invite.Id, inviteeStatus = status });
    }

    // ── POST /api/teams/accept/{token} ─────────────────────────────────────────
    // Accept an invite by token (from the email link)
    [HttpPost("accept/{token}")]
    public async Task<IActionResult> Accept(string token)
    {
        var userId = UserId();

        if (!await IsProAsync(userId))
            return StatusCode(402, new
            {
                error   = "PRO_REQUIRED",
                message = "You need a Pro plan to join a team workspace."
            });

        var invite = await _teams.GetInviteByTokenAsync(token);
        if (invite == null)     return NotFound(new { error = "INVALID_TOKEN" });
        if (invite.IsExpired)   return BadRequest(new { error = "EXPIRED" });
        if (invite.IsAccepted)  return BadRequest(new { error = "ALREADY_ACCEPTED" });

        // Verify the logged-in user's email matches the invite
        var user = await _users.GetByIdAsync(userId);
        if (user?.Email != invite.Email)
            return Forbid(); // wrong account

        // A second invite to someone already in the team must not fail on the
        // one-membership-per-team rule in the database.
        if (!await _teams.IsMemberAsync(invite.TeamId, userId))
        {
            // An invitation holds a seat, so this only stops one that was sent
            // before the limit existed.
            if ((await _teams.GetMembersAsync(invite.TeamId)).Count >= MaxMembers)
                return Conflict(new
                {
                    error   = "TEAM_FULL",
                    message = $"This team already has {MaxMembers} people. Ask the team owner to make room.",
                });
            await _teams.AddMemberAsync(new TeamMember(invite.TeamId, userId, invite.Role));
        }
        await _teams.AcceptInviteAsync(token);
        _live.Granted(userId);

        return Ok(new { message = "Joined team successfully", teamId = invite.TeamId });
    }

    // ── PATCH /api/teams/{id}/members/{userId}/role ────────────────────────────
    [HttpPatch("{id:guid}/members/{memberId:guid}/role")]
    public async Task<IActionResult> UpdateRole(Guid id, Guid memberId, [FromBody] UpdateRoleRequest req)
    {
        var userId = UserId();
        var team   = await _teams.GetTeamAsync(id);
        if (team == null || team.OwnerId != userId) return Forbid();

        if (req.Role is not ("editor" or "viewer"))
            return BadRequest(new { error = "INVALID_ROLE", message = "A role is either editor or viewer." });
        if (memberId == team.OwnerId)
            return BadRequest(new { error = "OWNER_ROLE_FIXED", message = "The owner's role can't be changed." });
        if (!await _teams.IsMemberAsync(id, memberId))
            return NotFound(new { error = "NOT_A_MEMBER", message = "That person isn't in this team." });

        await _teams.UpdateMemberRoleAsync(id, memberId, req.Role);
        return Ok(new { message = "Role updated", role = req.Role });
    }

    // ── DELETE /api/teams/{id}/members/{memberId} ──────────────────────────────
    [HttpDelete("{id:guid}/members/{memberId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid memberId)
    {
        var userId = UserId();
        var team   = await _teams.GetTeamAsync(id);
        if (team == null) return NotFound();

        // Owners can remove anyone; members can only remove themselves
        if (team.OwnerId != userId && memberId != userId) return Forbid();

        await _teams.RemoveMemberAsync(id, memberId);
        await _live.RevokedAsync(id, memberId);
        return NoContent();
    }

    // ── DELETE /api/teams/{id} ─────────────────────────────────────────────────
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = UserId();
        var team   = await _teams.GetTeamAsync(id);
        if (team == null) return NotFound();
        if (team.OwnerId != userId) return Forbid();

        await _teams.DeleteTeamAsync(id, userId);
        return NoContent();
    }

    // ── GET /api/teams/{id}/invites ────────────────────────────────────────────
    [HttpGet("{id:guid}/invites")]
    public async Task<IActionResult> GetInvites(Guid id)
    {
        if (!await _teams.IsMemberAsync(id, UserId())) return Forbid();
        var invites = await _teams.GetPendingInvitesAsync(id);
        return Ok(invites.Select(i => new
        {
            i.Id, i.Email, i.Role, i.CreatedAt, i.ExpiresAt, i.IsPending
        }));
    }

    // ── DELETE /api/teams/{id}/invites/{inviteId} ──────────────────────────────
    [HttpDelete("{id:guid}/invites/{inviteId:guid}")]
    public async Task<IActionResult> RevokeInvite(Guid id, Guid inviteId)
    {
        var team = await _teams.GetTeamAsync(id);
        if (team == null || team.OwnerId != UserId()) return Forbid();
        await _teams.RevokeInviteAsync(inviteId, id);
        return NoContent();
    }
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

public record CreateTeamRequest(string Name);
public record InviteRequest(string Email, string Role = "viewer");
public record UpdateRoleRequest(string Role);
