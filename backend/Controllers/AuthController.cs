using backend.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Concurrent;
using System.Security.Claims;

namespace backend.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IUserRepository _users;
    private readonly ILogger<AuthController> _logger;

    // Per-user semaphore — prevents duplicate SIGNED_IN events from racing each other
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> _syncLocks = new();

    public AuthController(IUserRepository users, ILogger<AuthController> logger)
    {
        _users  = users;
        _logger = logger;
    }

    public record SyncUserDto(string FirstName, string LastName, string Email);

    [Authorize]
    [HttpPost("sync-supabase-user")]
    public async Task<IActionResult> SyncSupabaseUser([FromBody] SyncUserDto dto)
    {
        var supabaseId = User.FindFirstValue("sub")
                      ?? User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (string.IsNullOrEmpty(supabaseId))
            return Unauthorized(new { error = "Missing user ID in token" });

        if (!Guid.TryParse(supabaseId, out var supabaseGuid))
            return Unauthorized(new { error = "Invalid user ID format in token" });

        // Per-user lock prevents concurrent SIGNED_IN double-fire issues
        var sem = _syncLocks.GetOrAdd(supabaseId, _ => new SemaphoreSlim(1, 1));
        await sem.WaitAsync();
        try
        {
            return await RunSyncAsync(supabaseGuid, dto);
        }
        finally
        {
            sem.Release();
            _syncLocks.TryRemove(supabaseId, out _);
        }
    }

    // Strip newlines/control chars from user-supplied values before logging (log injection prevention)
    private static string S(string? val) =>
        val is null ? "(null)" : val.Replace("\r", "").Replace("\n", "").Replace("\t", "");

    private async Task<IActionResult> RunSyncAsync(Guid supabaseGuid, SyncUserDto dto)
    {
        _logger.LogInformation("[Auth] Sync — JWT sub={Sub}, email={Email}", supabaseGuid, S(dto.Email));

        try
        {
            // Fast path: correct row already exists
            var existing = await _users.GetByIdAsync(supabaseGuid);
            if (existing != null)
            {
                _logger.LogInformation("[Auth] Already synced — id={Id}", supabaseGuid);
                return Ok(new { message = "User already exists", id = existing.Id });
            }

            // Stale row with same email but old UUID — clean it up first
            // This happens when the Supabase project is reset or user is deleted/recreated
            var staleByEmail = await _users.GetByEmailAsync(dto.Email);
            if (staleByEmail != null && staleByEmail.Id != supabaseGuid)
            {
                _logger.LogWarning("[Auth] Stale row — email={Email}, wrongId={WrongId}, correctId={CorrectId}",
                    S(dto.Email), staleByEmail.Id, supabaseGuid);

                await _users.DeleteAsync(staleByEmail.Id);
                _logger.LogInformation("[Auth] Stale row removed — email={Email}", S(dto.Email));
            }

            // Insert (or upsert — UserRepository.AddAsync uses Upsert, so concurrent calls are safe)
            var user = backend.Domain.Entities.User.CreateWithId(
                supabaseGuid,
                $"{dto.FirstName} {dto.LastName}".Trim(),
                dto.Email,
                "supabase-auth"
            );

            await _users.AddAsync(user);
            _logger.LogInformation("[Auth] User synced — email={Email}, id={Id}", S(dto.Email), supabaseGuid);
            return Ok(new { message = "User synced", id = user.Id });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Auth] Sync failed — email={Email}, id={Id}", S(dto.Email), supabaseGuid);
            // Never expose ex.Message to clients — it can leak internal paths/queries
            return StatusCode(500, new { error = "Failed to sync user" });
        }
    }

    [Authorize]
    [HttpGet("me")]
    public IActionResult Me()
    {
        var userId = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        var email  = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
        return Ok(new { userId, email });
    }
}