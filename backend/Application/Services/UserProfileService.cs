using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using backend.Application.Interfaces;
using backend.Application.DTOs.User;
using backend.Domain.Entities;

namespace backend.Application.Services;

public class UserProfileService : IUserProfileService
{
    private readonly IUserRepository          _repo;
    private readonly IStorageService          _storage;
    private readonly PasswordHasher<User>     _hasher = new();

    public UserProfileService(IUserRepository repo, IStorageService storage)
    {
        _repo    = repo;
        _storage = storage;
    }

    public async Task<GetMeResponseDto> GetMeAsync(Guid userId)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        return Map(user);
    }

    public async Task<GetMeResponseDto> UpdateUserNameAsync(Guid userId, string userName)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        user.UpdateUserName(userName);
        await _repo.UpdateAsync(user);
        return Map(user);
    }

    public async Task<GetMeResponseDto> UpdateEmailAsync(Guid userId, string email)
    {
        var existing = await _repo.GetByEmailAsync(email);
        if (existing != null && existing.Id != userId) throw new InvalidOperationException("EMAIL_IN_USE");
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        user.UpdateEmail(email);
        await _repo.UpdateAsync(user);
        return Map(user);
    }

    // ── NEW: update phone number ─────────────────────────────────────────
    public async Task<GetMeResponseDto> UpdatePhoneAsync(Guid userId, string? phoneNumber)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        user.UpdatePhoneNumber(phoneNumber);
        await _repo.UpdateAsync(user);
        return Map(user);
    }

    // ── NEW: change password ─────────────────────────────────────────────
    public async Task ChangePasswordAsync(Guid userId, string currentPassword, string newPassword)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");

        // Verify current password using the same PasswordHasher as AuthService
        var verifyResult = _hasher.VerifyHashedPassword(user, user.PasswordHash, currentPassword);
        if (verifyResult == PasswordVerificationResult.Failed)
            throw new InvalidOperationException("WRONG_PASSWORD");

        if (newPassword.Length < 8)
            throw new InvalidOperationException("PASSWORD_TOO_SHORT");

        var newHash = _hasher.HashPassword(user, newPassword);
        user.SetPasswordHash(newHash);
        await _repo.UpdateAsync(user);
    }

    public async Task<string> UploadProfilePictureAsync(Guid userId, IFormFile file)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        var path = await _storage.SaveProfilePictureAsync(userId, file);
        user.SetProfilePicture(path);
        await _repo.UpdateAsync(user);
        return path;
    }

    public async Task DeactivateAsync(Guid userId)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        user.Deactivate();
        await _repo.UpdateAsync(user);
    }

    // ── Map domain → DTO ─────────────────────────────────────────────────
    private static GetMeResponseDto Map(User u)
    {
        var parts     = u.UserName.Split(' ', 2);
        var firstName = parts[0];
        var lastName  = parts.Length > 1 ? parts[1] : "";

        return new GetMeResponseDto
        {
            Id             = u.Id,
            Email          = u.Email,
            UserName       = u.UserName,
            FirstName      = firstName,
            LastName       = lastName,
            PhoneNumber    = u.PhoneNumber,
            ProfilePicture = u.ProfilePicture,
            CreatedAt      = u.CreatedAt,
            LastLoginAt    = u.LastLoginAt,
            IsActive       = u.IsActive
        };
    }
}