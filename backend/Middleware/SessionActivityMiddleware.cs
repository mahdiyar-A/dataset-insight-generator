using backend.Application.Interfaces;
using System.Security.Claims;

namespace backend.Middleware;

/// <summary>
/// Updates last_active_at on every authenticated API request.
/// This is used for the session-timeout feature (admin dashboard shows
/// "active today / this week") and to drive inactivity detection.
///
/// We debounce to once per minute per user to avoid hammering Supabase
/// on every single request.
/// </summary>
public class SessionActivityMiddleware
{
    private readonly RequestDelegate _next;

    // In-memory debounce: userId → last DB write time
    private static readonly System.Collections.Concurrent.ConcurrentDictionary
        <Guid, DateTime> _lastUpdated = new();

    public SessionActivityMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        await _next(context);

        // Only update for authenticated requests
        if (!context.User.Identity?.IsAuthenticated ?? true) return;

        var idClaim = context.User.FindFirstValue("sub")
                   ?? context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(idClaim, out var userId)) return;

        var now = DateTime.UtcNow;

        // Debounce: skip if we already updated within the last 60 seconds
        if (_lastUpdated.TryGetValue(userId, out var last) && (now - last).TotalSeconds < 60)
            return;

        _lastUpdated[userId] = now;

        // Fire-and-forget so we don't add latency to the request
        _ = Task.Run(async () =>
        {
            try
            {
                var repo = context.RequestServices.GetService<IUserRepository>();
                if (repo != null) await repo.UpdateLastActiveAsync(userId);
            }
            catch { /* don't let activity tracking errors bubble up */ }
        });
    }
}
