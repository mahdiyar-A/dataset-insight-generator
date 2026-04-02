using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.Application.DTOs.User;
using backend.Application.Interfaces;

namespace backend.Controllers;

[ApiController]
[Route("api/user")]
[Authorize]
public class UserProfileController : ControllerBase
{
    private readonly IUserProfileService _svc;
    private readonly ILogger<UserProfileController> _logger;

    public UserProfileController(IUserProfileService svc, ILogger<UserProfileController> logger)
    {
        _svc    = svc;
        _logger = logger;
    }

    private Guid GetCurrentUserId()
    {
        var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(idClaim) || !Guid.TryParse(idClaim, out var id))
            throw new UnauthorizedAccessException("Missing user id claim");
        return id;
    }

    // ── GET /api/user/me ─────────────────────────────────────────────────
    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        var id = GetCurrentUserId();
        _logger.LogInformation("[Profile] GET /me — user {UserId}", id);
        try
        {
            var dto = await _svc.GetMeAsync(id);
            _logger.LogInformation("[Profile] ✓ Returning profile for {Email}", dto.Email);
            return Ok(dto);
        }
        catch (InvalidOperationException ex) when (ex.Message == "User not found")
        {
            // User authenticated but not yet synced to public.users — frontend will retry
            _logger.LogWarning("[Profile] User {UserId} authenticated but not yet synced to DB", id);
            return NotFound(new { error = "NOT_SYNCED", message = "User profile not ready yet." });
        }
    }

    // ── PATCH /api/user/me/username ──────────────────────────────────────
    [HttpPatch("me/username")]
    public async Task<IActionResult> UpdateUsername([FromBody] UpdateUserNameRequestDto req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var id = GetCurrentUserId();
        _logger.LogInformation("[Profile] PATCH username — user {UserId} → '{Name}'", id, req.UserName);
        try
        {
            var dto = await _svc.UpdateUserNameAsync(id, req.UserName);
            return Ok(dto);
        }
        catch (InvalidOperationException ex) when (ex.Message == "User not found")
        {
            return NotFound(new { error = "NOT_FOUND", message = "User not found" });
        }
    }

    // ── PATCH /api/user/me/email ─────────────────────────────────────────
    [HttpPatch("me/email")]
    public async Task<IActionResult> UpdateEmail([FromBody] UpdateEmailRequestDto req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var id = GetCurrentUserId();
        try
        {
            var dto = await _svc.UpdateEmailAsync(id, req.Email);
            return Ok(dto);
        }
        catch (InvalidOperationException ex) when (ex.Message == "EMAIL_IN_USE")
        {
            return Conflict(new { error = "EMAIL_IN_USE", message = "Email already in use" });
        }
        catch (InvalidOperationException ex) when (ex.Message == "User not found")
        {
            return NotFound(new { error = "NOT_FOUND", message = "User not found" });
        }
    }

    // ── PATCH /api/user/me/phone ─────────────────────────────────────────  ← NEW
    [HttpPatch("me/phone")]
    public async Task<IActionResult> UpdatePhone([FromBody] UpdatePhoneRequestDto req)
    {
        var id = GetCurrentUserId();
        try
        {
            var dto = await _svc.UpdatePhoneAsync(id, req.PhoneNumber);
            return Ok(dto);
        }
        catch (InvalidOperationException ex) when (ex.Message == "User not found")
        {
            return NotFound(new { error = "NOT_FOUND", message = "User not found" });
        }
    }

    // ── PATCH /api/user/me/password ──────────────────────────────────────  ← NEW
    [HttpPatch("me/password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequestDto req)
    {
        if (string.IsNullOrEmpty(req.CurrentPassword) || string.IsNullOrEmpty(req.NewPassword))
            return BadRequest(new { error = "MISSING_FIELDS", message = "Both current and new password are required." });

        var id = GetCurrentUserId();
        try
        {
            await _svc.ChangePasswordAsync(id, req.CurrentPassword, req.NewPassword);
            return Ok(new { message = "Password updated successfully." });
        }
        catch (InvalidOperationException ex) when (ex.Message == "WRONG_PASSWORD")
        {
            return BadRequest(new { error = "WRONG_PASSWORD", message = "Current password is incorrect." });
        }
        catch (InvalidOperationException ex) when (ex.Message == "PASSWORD_TOO_SHORT")
        {
            return BadRequest(new { error = "PASSWORD_TOO_SHORT", message = "Password must be at least 8 characters." });
        }
        catch (InvalidOperationException ex) when (ex.Message == "User not found")
        {
            return NotFound(new { error = "NOT_FOUND", message = "User not found" });
        }
    }

    // ── POST /api/user/me/profile-picture ────────────────────────────────
    [HttpPost("me/profile-picture")]
    [RequestSizeLimit(5_000_000)]
    public async Task<IActionResult> UploadProfilePicture([FromForm] IFormFile file)
    {
        if (file == null) return BadRequest(new { error = "INVALID", message = "file required" });
        var id = GetCurrentUserId();
        _logger.LogInformation("[Profile] POST profile-picture — user {UserId}, file: {Name} ({Size} bytes)", id, file.FileName, file.Length);
        try
        {
            var path = await _svc.UploadProfilePictureAsync(id, file);
            return Ok(new UploadProfilePictureResponseDto { ProfilePicturePath = path });
        }
        catch (InvalidOperationException ex) when (ex.Message == "User not found")
        {
            return NotFound(new { error = "NOT_FOUND", message = "User not found" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = "INVALID", message = ex.Message });
        }
    }

    // ── DELETE /api/user/me ──────────────────────────────────────────────
    [HttpDelete("me")]
    public async Task<IActionResult> DeleteMe()
    {
        var id = GetCurrentUserId();
        _logger.LogWarning("[Profile] DELETE /me — user {UserId} deactivating account", id);
        await _svc.DeactivateAsync(id);
        _logger.LogInformation("[Profile] ✓ Account deactivated for {UserId}", id);
        return NoContent();
    }
}