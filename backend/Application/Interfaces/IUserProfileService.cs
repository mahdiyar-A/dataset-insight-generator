using Microsoft.AspNetCore.Http;

namespace backend.Application.Interfaces;

public interface IUserProfileService
{
    Task<backend.Application.DTOs.User.GetMeResponseDto> GetMeAsync(Guid userId);
    Task<backend.Application.DTOs.User.GetMeResponseDto> UpdateUserNameAsync(Guid userId, string userName);
    Task<backend.Application.DTOs.User.GetMeResponseDto> UpdateEmailAsync(Guid userId, string email);
    Task<backend.Application.DTOs.User.GetMeResponseDto> UpdatePhoneAsync(Guid userId, string? phoneNumber);  // ← NEW
    Task<string> UploadProfilePictureAsync(Guid userId, IFormFile file);
    Task ChangePasswordAsync(Guid userId, string currentPassword, string newPassword);  // ← NEW
    Task DeactivateAsync(Guid userId);
}