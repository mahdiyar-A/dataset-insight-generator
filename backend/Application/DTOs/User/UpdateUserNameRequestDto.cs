using System.ComponentModel.DataAnnotations;

namespace backend.Application.DTOs.User;

/// <summary>
/// Request DTO for updating the current user's username.
/// Validation attributes are applied so MVC model binding will produce
/// a 400 Bad Request when the input doesn't meet the constraints.
/// </summary>
public class UpdateUserNameRequestDto
{
    /// <summary>New username to set. Minimum/maximum length enforced.</summary>
    [Required]
    [MinLength(3)]
    [MaxLength(30)]
    public string UserName { get; set; } = default!;
}
