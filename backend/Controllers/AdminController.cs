using backend.Application.Interfaces;
using backend.Application.Services;
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
        IUserRepository users, IAnalysisRepository analyses, ILogger<AdminController> logger)
    {
        _users    = users;
        _analyses = analyses;
        _logger   = logger;
    }

    private Guid? CallerId()
    {
        var c = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(c, out var id) ? id : null;
    }

    private async Task<bool> IsAdminAsync()
    {
        if (CallerId() is not { } id) return false;
        var user = await _users.GetByIdAsync(id);
        return user?.Plan == "admin";
    }

    /// <summary>
    /// Why admin may not be taken away from this account, or null. Nobody may
    /// demote or delete themselves here, and the last admin stays: otherwise one
    /// slip locks everyone out of this page.
    /// </summary>
    private async Task<object?> LockoutAsync(Guid targetId, string targetPlan)
    {
        if (targetPlan != "admin") return null;
        if (CallerId() == targetId)
            return new { error = "SELF", message = "You can't remove admin from your own account. Ask another admin to do it." };
        var admins = (await _users.GetAllAsync()).Count(u => u.Plan == "admin");
        return admins <= 1
            ? new { error = "LAST_ADMIN", message = "This is the only admin account. Make someone else admin first." }
            : null;
    }

    // ── GET /api/admin/models ─────────────────────────────────────────────────
    // What the daily model check sees, on demand: each model DIG uses and
    // whether its provider still offers it, today's free allowance, and how the
    // last day went. Passed through as the AI service wrote it.
    [HttpGet("models")]
    public async Task<IActionResult> GetModels([FromServices] IPythonAiClient ai)
    {
        if (!await IsAdminAsync())
            return Forbid();

        try
        {
            return Content(await ai.ModelStatusAsync(), "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[Admin] Model status unavailable ({Type}: {Msg})", ex.GetType().Name, ex.Message);
            return StatusCode(503, new { error = "AI_SERVICE_UNAVAILABLE", message = "The AI service did not answer." });
        }
    }

    // ── POST /api/admin/alerts/test ───────────────────────────────────────────
    // An alarm nobody has heard ring is a guess. This sends one, through the
    // same path and limits as a real one, so the owner can see it arrive.
    [HttpPost("alerts/test")]
    public async Task<IActionResult> TestAlert([FromServices] OwnerAlerts alerts)
    {
        if (!await IsAdminAsync())
            return Forbid();

        if (!alerts.Enabled)
            return Ok(new { sent = false, to = alerts.Recipient, message = "Alerts are switched off on this server." });

        var sent = await alerts.RaiseAsync($"test:{Guid.NewGuid():N}",
            "DIG: this is a test of the alarm",
            new[]
            {
                "Nothing is wrong. Someone pressed “Send a test alert” on the admin page.",
                "A real alert comes to this inbox when a model DIG uses is withdrawn, when a free allowance runs out, "
                + "or when a report has to be written without AI.",
            });

        return Ok(new
        {
            sent,
            to      = alerts.Recipient,
            message = sent
                ? $"Sent to {alerts.Recipient}. It can take a minute to arrive; check spam the first time."
                : "It was not sent: either the mail server refused it or today's limit of alerts is used up.",
        });
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

    // ── GET /api/admin/analytics ──────────────────────────────────────────────
    // The owner's view of "is this working and can I afford it": analyses per
    // day, success rate, LLM cost, and who is actually using the product.
    // Aggregated on request — at current volumes a full scan of the window is
    // cheaper than maintaining a rollup table would be to build and debug.
    [HttpGet("analytics")]
    public async Task<IActionResult> GetAnalytics([FromQuery] int days = 30)
    {
        if (!await IsAdminAsync()) return Forbid();

        days = Math.Clamp(days, 1, 365);
        var now   = DateTime.UtcNow;
        var since = now.Date.AddDays(-(days - 1));

        var analyses = await _analyses.GetAllSinceAsync(since);
        var allUsers = await _users.GetAllAsync();

        var done   = analyses.Where(a => a.Status == "done").ToList();
        var failed = analyses.Where(a => a.Status == "failed").ToList();

        // Cost aggregates only over runs that recorded usage — averaging in
        // pre-telemetry rows as zero would understate the real per-run cost.
        var costed = done.Where(a => a.CostUsd.HasValue).ToList();

        var perDay = Enumerable.Range(0, days)
            .Select(i => since.AddDays(i))
            .Select(day => new
            {
                date     = day.ToString("yyyy-MM-dd"),
                analyses = done.Count(a => a.CreatedAt.Date == day),
                failed   = failed.Count(a => a.CreatedAt.Date == day),
                costUsd  = Math.Round(
                    done.Where(a => a.CreatedAt.Date == day)
                        .Sum(a => a.CostUsd ?? 0m), 4),
            })
            .ToList();

        var proUsers = allUsers.Count(u => u.Plan == "pro");
        // Only Pro accounts with a Stripe subscription pay. Pro given by hand
        // (a friend, a test) used to be counted as income.
        var payingUsers = allUsers.Count(u => u.Plan == "pro" && !string.IsNullOrEmpty(u.StripeSubscriptionId));
        var finished = done.Count + failed.Count;

        return Ok(new
        {
            windowDays = days,
            generatedAt = now,

            totals = new
            {
                analyses      = done.Count,
                failed        = failed.Count,
                successRate   = finished == 0 ? 1.0
                    : Math.Round((double)done.Count / finished, 4),
                totalCostUsd  = Math.Round(costed.Sum(a => a.CostUsd!.Value), 4),
                avgCostUsd    = costed.Count == 0 ? 0m
                    : Math.Round(costed.Sum(a => a.CostUsd!.Value) / costed.Count, 4),
                costedRuns    = costed.Count,
                tokensIn      = costed.Sum(a => a.TokensIn  ?? 0),
                tokensOut     = costed.Sum(a => a.TokensOut ?? 0),
            },

            users = new
            {
                total          = allUsers.Count,
                free           = allUsers.Count(u => u.Plan == "free"),
                pro            = proUsers,
                activeAnalysts = analyses.Select(a => a.UserId).Distinct().Count(),
                activeThisWeek = allUsers.Count(u => u.LastActive.HasValue
                    && (now - u.LastActive.Value).TotalDays < 7),
                paying         = payingUsers,
                // Paying accounts times the sticker price. Real income net of
                // Stripe fees and proration lives in the Stripe dashboard.
                estimatedMrrUsd = Math.Round(payingUsers * 9.99m, 2),
            },

            perDay,
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
    public async Task<IActionResult> SetPlan(Guid id, [FromBody] AdminSetPlanRequest req,
                                             [FromServices] IServiceProvider services)
    {
        if (!await IsAdminAsync()) return Forbid();

        if (req.Plan is not ("free" or "pro" or "admin"))
            return BadRequest(new { error = "INVALID_PLAN" });

        var target = await _users.GetByIdAsync(id);
        if (target == null) return NotFound(new { error = "NOT_FOUND", message = "That account no longer exists." });

        if (req.Plan != "admin" && await LockoutAsync(id, target.Plan) is { } lockout)
            return Conflict(lockout);

        // Free used to drop the Stripe link and leave the subscription running:
        // the person kept paying and DIG lost track of them. Moving a paying
        // customer to Free now cancels the subscription, and only once the admin
        // has confirmed it. Pro and Admin keep the link as it is.
        if (req.Plan == "free" && target.StripeSubscriptionId is { Length: > 0 } subscription)
        {
            if (req.CancelSubscription != true)
                return Conflict(new
                {
                    error   = "PAYING_CUSTOMER",
                    message = "This person pays for Pro through Stripe. Moving them to Free cancels their subscription.",
                });
            await services.GetRequiredService<IStripeService>().CancelSubscriptionAsync(subscription);
        }

        await _users.SetPlanAsync(id, req.Plan,
            planExpiresAt: req.ExpiresAt,
            stripeSubscriptionId: null);

        _logger.LogWarning("[Admin] {Admin} changed the plan of {Id}: {From} -> {To}",
            CallerId(), id, target.Plan, req.Plan);
        return Ok(new { message = $"Plan set to {req.Plan}." });
    }

    // ── DELETE /api/admin/users/{id} ──────────────────────────────────────────
    // Hard-delete a user account (irreversible)
    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id, [FromServices] AccountDeletion deletion)
    {
        if (!await IsAdminAsync()) return Forbid();

        if (CallerId() == id)
            return Conflict(new { error = "SELF", message = "Delete your own account from Settings, not from here." });
        var target = await _users.GetByIdAsync(id);
        if (target != null && await LockoutAsync(id, target.Plan) is { } lockout)
            return Conflict(lockout);

        await deletion.DeleteAsync(id);

        _logger.LogWarning("[Admin] {Admin} deleted user {Id}", CallerId(), id);
        return NoContent();
    }

    // ── GET /api/admin/health ─────────────────────────────────────────────────
    // Each service is tried when the page asks, with the time it took or the
    // error. It used to answer "ok" whatever the state of the services.
    [HttpGet("health")]
    public async Task<IActionResult> Health(
        [FromServices] IServiceProvider services, [FromServices] IConfiguration config)
    {
        if (!await IsAdminAsync()) return Forbid();
        var me = CallerId()!.Value;

        var key  = config["Stripe:SecretKey"] ?? "";
        var mode = key.StartsWith("sk_live_") ? "live" : key.StartsWith("sk_test_") ? "test" : "";

        var checks = new[]
        {
            await CheckAsync("Database", async () =>
            {
                if (await _users.GetByIdAsync(me) == null) throw new InvalidOperationException("Your own account was not found.");
                return null;
            }),
            await CheckAsync("File storage", async () =>
            {
                // A file that isn't there: "not found" proves storage answered.
                try { await services.GetRequiredService<IStorageService>().GetSignedUrlAsync("health/ping.txt", 60); }
                catch (Exception e) when (e.Message.Contains("not found", StringComparison.OrdinalIgnoreCase)
                                          || e.Message.Contains("not_found", StringComparison.OrdinalIgnoreCase)) { }
                return null;
            }),
            await CheckAsync("Payments", async () =>
            {
                if (mode == "") throw new InvalidOperationException("No Stripe key on this server.");
                // A subscription that can't exist: Stripe answering "not found" proves the key works.
                await services.GetRequiredService<IStripeService>().GetSubscriptionAsync("sub_dig_health_check");
                return $"{mode} mode";
            }),
            await CheckAsync("AI service", async () =>
            {
                if (!await services.GetRequiredService<IPythonAiClient>().HealthAsync())
                    throw new InvalidOperationException("It answered, but not with ok.");
                return null;
            }),
        };

        return Ok(new { backend = "ok", timestamp = DateTime.UtcNow, checks });
    }

    private static async Task<object> CheckAsync(string name, Func<Task<string?>> run)
    {
        var watch = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            var note = await run().WaitAsync(TimeSpan.FromSeconds(8));
            return new { name, ok = true, ms = watch.ElapsedMilliseconds, note };
        }
        catch (Exception e)
        {
            var why = e is TimeoutException ? "No answer within 8 seconds." : e.Message;
            return new { name, ok = false, ms = watch.ElapsedMilliseconds, note = (string?)(why.Length > 160 ? why[..160] : why) };
        }
    }

    // ── GET /api/admin/visits ─────────────────────────────────────────────────
    // Page visits counted without cookies (VisitCounter): daily totals, top
    // pages and the sites visitors came from.
    [HttpGet("visits")]
    public async Task<IActionResult> GetVisits([FromServices] IVisitRepository visits, [FromQuery] int days = 30)
    {
        if (!await IsAdminAsync()) return Forbid();

        days = Math.Clamp(days, 1, 365);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var since = today.AddDays(-(days - 1));
        List<VisitTotal> rows;
        try { rows = await visits.GetSinceAsync(since); }
        catch (Exception ex)
        {
            // Most likely migration 006 hasn't been run on this database yet.
            _logger.LogWarning("[Admin] Visits unavailable ({Type}: {Msg})", ex.GetType().Name, ex.Message);
            return StatusCode(503, new { error = "VISITS_UNAVAILABLE",
                message = "Visit counts aren't available yet: the site_visits table may not exist (migration 006)." });
        }

        var site  = rows.Where(r => r.Path == "*").ToList();
        var pages = rows.Where(r => r.Path != "*").ToList();
        static int Views(IEnumerable<VisitTotal> r) => r.Sum(x => x.Views);
        static int People(IEnumerable<VisitTotal> r) => r.Sum(x => x.Visitors);
        var lastWeek = site.Where(r => r.Day > today.AddDays(-7)).ToList();

        return Ok(new
        {
            windowDays = days,
            today  = new { views = Views(site.Where(r => r.Day == today)), visitors = People(site.Where(r => r.Day == today)) },
            week   = new { views = Views(lastWeek), visitors = People(lastWeek) },
            total  = new { views = Views(site), visitors = People(site) },
            perDay = Enumerable.Range(0, days).Select(i => since.AddDays(i)).Select(d => new
            {
                date     = d.ToString("yyyy-MM-dd"),
                views    = Views(site.Where(r => r.Day == d)),
                visitors = People(site.Where(r => r.Day == d)),
            }),
            // A person is counted once per page per day, so a page's visitors
            // over the window can count the same person on different days.
            topPages = pages.GroupBy(r => r.Path)
                .Select(g => new { path = g.Key, views = Views(g), visitors = People(g) })
                .OrderByDescending(x => x.views).Take(10),
            topSources = pages.Where(r => r.Source != "").GroupBy(r => r.Source)
                .Select(g => new { source = g.Key, views = Views(g) })
                .OrderByDescending(x => x.views).Take(10),
        });
    }
}

public record AdminSetPlanRequest(string Plan, DateTime? ExpiresAt = null, bool? CancelSubscription = null);
