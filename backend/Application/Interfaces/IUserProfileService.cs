using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace backend.Application.Interfaces;

/// <summary>
/// Service contract for user profile related operations.
/// The service operates on the current user (userId passed by caller) and
/// returns DTOs suitable for API responses. Business logic (uniqueness checks,
/// validation that requires DB access, and storage operations) lives here.
/// </summary>
public interface IUserProfileService
{
    /// <summary>Return a DTO representing the current user's profile.</summary>
    Task<backend.Application.DTOs.User.GetMeResponseDto> GetMeAsync(Guid userId);

    /// <summary>Update the username for the specified user and return the updated DTO.</summary>
    Task<backend.Application.DTOs.User.GetMeResponseDto> UpdateUserNameAsync(Guid userId, string userName);

    /// <summary>Update the email for the specified user (must check uniqueness) and return updated DTO.</summary>
    Task<backend.Application.DTOs.User.GetMeResponseDto> UpdateEmailAsync(Guid userId, string email);

    /// <summary>Save a profile picture file for the user and return the saved path.</summary>
    Task<string> UploadProfilePictureAsync(Guid userId, IFormFile file);

    /// <summary>Deactivate (or delete) the user's account.</summary>
    Task DeactivateAsync(Guid userId);
}
