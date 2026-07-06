using backend.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace backend.Controllers;

/// <summary>
/// Admin-only endpoints for monitoring the platform.
/// Access is restricted to users whose plan == "admin".
/// The admin account is a regular user record in Supabase — you promote
/// someone to admin by running: UPDATE users SET plan = 'admin' WHERE email = '...';
/// </summary>
[ApiController]
[Route("api/admin")]
[Authorize]
public class AdminController : ControllerBase
{
    private readonly IUserRepository _users;
    private readonly IAnalysisRepository _analyses;
    private readonly ILogger<AdminController> _logger;

    public AdminController(
        IUserRepository users, IAnalysisRepository analyses,
        ILogger<AdminController> logger)
    {
        _users    = users;
        _analyses = analyses;
        _logger   = logger;
    }

    private async Task<bool> IsAdminAsync()
    {
        var c = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(c, out var id)) return false;
        var user = await _users.GetByIdAsync(id);
        return user?.Plan == "admin";
    }

    // ── GET /api/admin/stats ──────────────────────────────────────────────────
    // Platform-wide health snapshot for the admin dashboard
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        if (!await IsAdminAsync())
            return Forbid();

        var allUsers = await _users.GetAllAsync();
        var now      = DateTime.UtcNow;

        return Ok(new
        {
            totalUsers     = allUsers.Count,
            freeUsers      = allUsers.Count(u => u.Plan == "free"),
            proUsers       = allUsers.Count(u => u.Plan == "pro"),
            adminUsers     = allUsers.Count(u => u.Plan == "admin"),
            activeToday    = allUsers.Count(u => u.LastActive.HasValue
                && (now - u.LastActive.Value).TotalHours < 24),
            activeThisWeek = allUsers.Count(u => u.LastActive.HasValue
                && (now - u.LastActive.Value).TotalDays < 7),
            generatedAt    = now,
        });
    }

    // ── GET /api/admin/users ──────────────────────────────────────────────────
    // Paginated user list
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(
        [FromQuery] int page = 1,
        [FromQuery] int size = 25,
        [FromQuery] string? plan = null,
        [FromQuery] string? search = null)
    {
        if (!await IsAdminAsync()) return Forbid();

        var all = await _users.GetAllAsync();

        if (!string.IsNullOrWhiteSpace(plan))
            all = all.Where(u => u.Plan == plan).ToList();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.ToLowerInvariant();
            all = all.Where(u =>
                u.Email.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                u.UserName.Contains(q, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        var total  = all.Count;
        var paged  = all.Skip((page - 1) * size).Take(size).ToList();

        return Ok(new
        {
            total,
            page,
            size,
            users = paged.Select(u => new
            {
                u.Id, u.Email, u.UserName, u.Plan,
                u.IsActive, u.IsEmailVerified,
                u.CreatedAt, u.LastActive,
                u.StripeCustomerId, u.StripeSubscriptionId, u.PlanExpiresAt,
            })
        });
    }

    // ── PATCH /api/admin/users/{id}/plan ──────────────────────────────────────
    // Manually set a user's plan (for granting admin or comping pro)
    [HttpPatch("users/{id:guid}/plan")]
    public async Task<IActionResult> SetPlan(Guid id, [FromBody] AdminSetPlanRequest req)
    {
        if (!await IsAdminAsync()) return Forbid();

        if (req.Plan is not ("free" or "pro" or "admin"))
            return BadRequest(new { error = "INVALID_PLAN" });

        await _users.SetPlanAsync(id, req.Plan,
            planExpiresAt: req.ExpiresAt,
            stripeSubscriptionId: null);

        _logger.LogInformation("[Admin] Plan changed — user {Id} → {Plan}", id, req.Plan);
        return Ok(new { message = $"User {id} plan set to {req.Plan}" });
    }

    // ── DELETE /api/admin/users/{id} ──────────────────────────────────────────
    // Hard-delete a user account (irreversible)
    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        if (!await IsAdminAsync()) return Forbid();

        await _users.DeleteAsync(id);
        _logger.LogWarning("[Admin] User {Id} deleted by admin", id);
        return NoContent();
    }

    // ── GET /api/admin/health ─────────────────────────────────────────────────
    // Checks backend + Supabase connectivity
    [HttpGet("health")]
    public async Task<IActionResult> Health()
    {
        if (!await IsAdminAsync()) return Forbid();

        return Ok(new
        {
            backend   = "ok",
            timestamp = DateTime.UtcNow,
            version   = "2.0.0",
        });
    }
}

public record AdminSetPlanRequest(string Plan, DateTime? ExpiresAt = null);
