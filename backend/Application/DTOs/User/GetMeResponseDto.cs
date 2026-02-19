using System;

namespace backend.Application.DTOs.User;

/// <summary>
/// Data Transfer Object returned by GET /api/user/me.
/// Contains only the fields safe to expose to the client.
/// This DTO intentionally omits sensitive data like the password hash.
/// </summary>
public class GetMeResponseDto
{
    /// <summary>Primary identifier of the user.</summary>
    public Guid Id { get; set; }

    /// <summary>User email (public-facing).</summary>
    public string Email { get; set; } = default!;

    /// <summary>Username (login/display name).</summary>
    public string UserName { get; set; } = default!;

    /// <summary>Optional first name (not required by domain).</summary>
    public string? FirstName { get; set; }

    /// <summary>Optional last name (not required by domain).</summary>
    public string? LastName { get; set; }

    /// <summary>Optional phone number (stored in user profile).</summary>
    public string? PhoneNumber { get; set; }

    /// <summary>Relative path or URL for the user's profile picture.</summary>
    public string? ProfilePicture { get; set; }

    /// <summary>When the account was created (UTC).</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>Optional timestamp of the last login (UTC).</summary>
    public DateTime? LastLoginAt { get; set; }

    /// <summary>Whether the account is active. Used for soft-deletes.</summary>
    public bool IsActive { get; set; }
}
