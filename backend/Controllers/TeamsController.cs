using backend.Application.Interfaces;
using backend.Domain.Entities;
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

    public TeamsController(
        ITeamRepository teams, IUserRepository users,
        IEmailService email, IConfiguration config,
        ILogger<TeamsController> logger)
    {
        _teams  = teams;
        _users  = users;
        _email  = email;
        _config = config;
        _logger = logger;
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
        var teams = await _teams.GetUserTeamsAsync(UserId());
        return Ok(teams.Select(t => new
        {
            t.Id, t.Name, t.OwnerId, t.InviteCode, t.CreatedAt,
            isOwner = t.OwnerId == UserId()
        }));
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

        var email = req.Email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new { error = "INVALID_EMAIL" });

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
            _logger.LogError(ex, "[Teams] Failed to send invite email to {Email}", email);
        }

        return Ok(new { message = $"Invitation sent to {email}", invite.Id });
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

        await _teams.AddMemberAsync(new TeamMember(invite.TeamId, userId, invite.Role));
        await _teams.AcceptInviteAsync(token);

        return Ok(new { message = "Joined team successfully", teamId = invite.TeamId });
    }

    // ── PATCH /api/teams/{id}/members/{userId}/role ────────────────────────────
    [HttpPatch("{id:guid}/members/{memberId:guid}/role")]
    public async Task<IActionResult> UpdateRole(Guid id, Guid memberId, [FromBody] UpdateRoleRequest req)
    {
        var userId = UserId();
        var team   = await _teams.GetTeamAsync(id);
        if (team == null || team.OwnerId != userId) return Forbid();

        var role = req.Role is "editor" or "viewer" ? req.Role : "viewer";
        await _teams.UpdateMemberRoleAsync(id, memberId, role);
        return Ok(new { message = "Role updated" });
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
