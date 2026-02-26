using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.Application.DTOs.User;
using backend.Application.Interfaces;

namespace backend.Controllers;

/// <summary>
/// API controller exposing endpoints for the current user ("/me" style).
/// All endpoints are protected with [Authorize] and rely on the presence of a user id
/// claim (typically `sub` or `nameidentifier`). The controller never accepts a userId
/// from the request body or route to prevent privilege escalation.
/// </summary>
[ApiController]
[Route("api/user")]
[Authorize]
public class UserProfileController : ControllerBase
{
    private readonly IUserProfileService _svc;

    public UserProfileController(IUserProfileService svc)
    {
        _svc = svc;
    }

    /// <summary>
    /// Helper that extracts the current user's GUID from the claims principal.
    /// Throws UnauthorizedAccessException when the claim is missing or malformed.
    /// Controllers catch and translate domain exceptions to proper HTTP responses.
    /// </summary>
    private Guid GetCurrentUserId()
    {
        // Try common claim types used for user id
        var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(idClaim) || !Guid.TryParse(idClaim, out var id))
            throw new UnauthorizedAccessException("Missing user id claim");
        return id;
    }

    /// <summary>GET /api/user/me -> returns profile info for the authenticated user.</summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        var id = GetCurrentUserId();
        var dto = await _svc.GetMeAsync(id);
        return Ok(dto);
    }

    /// <summary>
    /// PATCH /api/user/me/username -> update username for the current user.
    /// Model validation is enforced by MVC via DataAnnotations on the DTO.
    /// </summary>
    [HttpPatch("me/username")]
    public async Task<IActionResult> UpdateUsername([FromBody] UpdateUserNameRequestDto req)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var id = GetCurrentUserId();
        try
        {
            var dto = await _svc.UpdateUserNameAsync(id, req.UserName);
            return Ok(dto);
        }
        catch (InvalidOperationException ex) when (ex.Message == "User not found")
        {
            // Map domain-level "not found" to 404
            return NotFound(new { error = "NOT_FOUND", message = "User not found" });
        }
    }

    /// <summary>
    /// PATCH /api/user/me/email -> update email for the current user. Checks uniqueness.
    /// Returns 409 when the email is already in use by another account.
    /// </summary>
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
            // Map uniqueness violation to HTTP 409 Conflict
            return Conflict(new { error = "EMAIL_IN_USE", message = "Email already in use" });
        }
        catch (InvalidOperationException ex) when (ex.Message == "User not found")
        {
            return NotFound(new { error = "NOT_FOUND", message = "User not found" });
        }
    }

    /// <summary>
    /// POST /api/user/me/profile-picture -> accepts multipart/form-data with an IFormFile named "file".
    /// Validates presence and delegates to service which performs file validation and storage.
    /// </summary>
    [HttpPost("me/profile-picture")]
    [RequestSizeLimit(5_000_000)]
    public async Task<IActionResult> UploadProfilePicture([FromForm] IFormFile file)
    {
        if (file == null) return BadRequest(new { error = "INVALID", message = "file required" });
        var id = GetCurrentUserId();
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
            // Return validation-like errors as 400 with message
            return BadRequest(new { error = "INVALID", message = ex.Message });
        }
    }

    /// <summary>DELETE /api/user/me -> deactivate (soft-delete) the current user's account.</summary>
    [HttpDelete("me")]
    public async Task<IActionResult> DeleteMe()
    {
        var id = GetCurrentUserId();
        await _svc.DeactivateAsync(id);
        // 204 No Content is idiomatic for successful delete operations with no body.
        return NoContent();
    }
}
