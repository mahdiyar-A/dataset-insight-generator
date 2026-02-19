using System.ComponentModel.DataAnnotations;

namespace backend.Application.DTOs.User;

/// <summary>
/// Request DTO for updating the user's email address.
/// Uses DataAnnotations to ensure the incoming value is a valid email.
/// </summary>
public class UpdateEmailRequestDto
{
    /// <summary>New email to set on the account.</summary>
    [Required]
    [EmailAddress]
    public string Email { get; set; } = default!;
}
