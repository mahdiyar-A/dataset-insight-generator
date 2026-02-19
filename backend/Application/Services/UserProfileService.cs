using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using backend.Application.Interfaces;
using backend.Application.DTOs.User;
using backend.Domain.Entities;

namespace backend.Application.Services;

/// <summary>
/// Concrete implementation of <see cref="IUserProfileService"/>.
/// Contains business logic for profile operations: load user, validate uniqueness,
/// call storage helper for file uploads, and persist via <see cref="IUserRepository"/>.
/// </summary>
public class UserProfileService : IUserProfileService
{
    private readonly IUserRepository _repo;
    private readonly IStorageService _storage;

    /// <summary>Dependencies are injected by DI: repository + storage provider.</summary>
    public UserProfileService(IUserRepository repo, IStorageService storage)
    {
        _repo = repo;
        _storage = storage;
    }

    /// <summary>
    /// Return the user's profile mapped to a DTO. Throws InvalidOperationException when not found.
    /// Services should throw domain-aware exceptions; controllers translate to HTTP status codes.
    /// </summary>
    public async Task<GetMeResponseDto> GetMeAsync(Guid userId)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        return Map(user);
    }

    /// <summary>Update the user's username and persist the change.</summary>
    public async Task<GetMeResponseDto> UpdateUserNameAsync(Guid userId, string userName)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        // Domain entity provides UpdateUserName to encapsulate invariants.
        user.UpdateUserName(userName);
        await _repo.UpdateAsync(user);
        return Map(user);
    }

    /// <summary>
    /// Update user's email. Performs a uniqueness check by querying repository for the email.
    /// Throws InvalidOperationException with message "EMAIL_IN_USE" when conflict detected.
    /// </summary>
    public async Task<GetMeResponseDto> UpdateEmailAsync(Guid userId, string email)
    {
        var existing = await _repo.GetByEmailAsync(email);
        if (existing != null && existing.Id != userId) throw new InvalidOperationException("EMAIL_IN_USE");
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        user.UpdateEmail(email);
        await _repo.UpdateAsync(user);
        return Map(user);
    }

    /// <summary>
    /// Upload profile picture by delegating to the storage service (validates and saves file),
    /// then update the user's ProfilePicture property with the returned path.
    /// </summary>
    public async Task<string> UploadProfilePictureAsync(Guid userId, IFormFile file)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        var path = await _storage.SaveProfilePictureAsync(userId, file);
        user.SetProfilePicture(path);
        await _repo.UpdateAsync(user);
        return path;
    }

    /// <summary>Deactivate the user's account (soft-delete) by changing IsActive flag and persisting.</summary>
    public async Task DeactivateAsync(Guid userId)
    {
        var user = await _repo.GetByIdAsync(userId) ?? throw new InvalidOperationException("User not found");
        user.Deactivate();
        await _repo.UpdateAsync(user);
    }

    /// <summary>Map domain User to the API DTO. Mapping is kept private and simple.</summary>
    private static GetMeResponseDto Map(User u)
    {
        return new GetMeResponseDto
        {
            Id = u.Id,
            Email = u.Email,
            UserName = u.UserName,
            FirstName = null, // Domain entity doesn't have first/last in this project; leave null
            LastName = null,
            PhoneNumber = null,
            ProfilePicture = u.ProfilePicture,
            CreatedAt = u.CreatedAt,
            LastLoginAt = u.LastLoginAt,
            IsActive = u.IsActive
        };
    }
}
