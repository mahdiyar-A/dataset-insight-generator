using Microsoft.AspNetCore.Http;
using backend.Application.Interfaces;
using backend.Application.DTOs.User;
using backend.Domain.Entities;

namespace backend.Application.Services;

public class UserProfileService : IUserProfileService
{
    private readonly IUserRepository          _repo;
    private readonly IStorageService          _storage;

    public UserProfileService(IUserRepository repo, IStorageService storage)
    {
        _repo    = repo;
        _storage = storage;
    }

    public async Task<GetMeResponseDto> GetMeAsync(Guid userId)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        var dto  = Map(user);
        dto.ProfilePicture = await PictureUrlAsync(user.ProfilePicture);
        return dto;
    }

    /// <summary>
    /// The row holds a path in a private bucket, which a browser cannot load, so
    /// a saved picture disappeared on the next visit. A broken picture must not
    /// break the profile, so a signing failure means no picture.
    /// </summary>
    private async Task<string?> PictureUrlAsync(string? stored)
    {
        if (string.IsNullOrEmpty(stored) || stored.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            return stored;
        try
        {
            return await _storage.GetSignedUrlAsync(stored, 3600);
        }
        catch (Exception)
        {
            return null;
        }
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

    public async Task<string> UploadProfilePictureAsync(Guid userId, IFormFile file)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        var path = await _storage.SaveProfilePictureAsync(userId, file);
        user.SetProfilePicture(path);
        await _repo.UpdateAsync(user);
        return path;
    }

    public async Task RemoveProfilePictureAsync(Guid userId)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        var stored = user.ProfilePicture;
        if (string.IsNullOrEmpty(stored)) return;

        user.SetProfilePicture(null);
        await _repo.UpdateAsync(user);
        if (!stored.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            await _storage.DeleteFileAsync(stored);
    }

    // ── Map domain → DTO ─────────────────────────────────────────────────
    private static GetMeResponseDto Map(User u)
    {
        var parts     = u.UserName.Split(' ', 2);
        var firstName = parts[0];
        var lastName  = parts.Length > 1 ? parts[1] : "";

        return new GetMeResponseDto
        {
            Id              = u.Id,
            Email           = u.Email,
            UserName        = u.UserName,
            FirstName       = firstName,
            LastName        = lastName,
            PhoneNumber     = u.PhoneNumber,
            ProfilePicture  = u.ProfilePicture,
            CreatedAt       = u.CreatedAt,
            LastLoginAt     = u.LastLoginAt,
            LastActive      = u.LastActive,
            IsActive        = u.IsActive,
            IsEmailVerified = u.IsEmailVerified,
            Plan            = u.Plan,
            PlanExpiresAt   = u.PlanExpiresAt,
            ReportsUsed     = u.ReportsUsed,
            ReportsResetAt  = u.ReportsResetAt,
        };
    }
}