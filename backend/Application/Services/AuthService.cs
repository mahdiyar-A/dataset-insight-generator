using backend.Application.Interfaces;
using backend.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace backend.Application.Services;

public class AuthService
{
    private readonly IUserRepository _users;
    private readonly PasswordHasher<User> _hasher = new();

    public AuthService(IUserRepository users)
    {
        _users = users;
    }

    public async Task<(User? user, string? errorCode, string? message)> RegisterAsync(
        string firstName,
        string lastName,
        string email,
        string password)
    {
        firstName = (firstName ?? "").Trim();
        lastName  = (lastName ?? "").Trim();
        email     = (email ?? "").Trim();

        if (string.IsNullOrWhiteSpace(firstName) ||
            string.IsNullOrWhiteSpace(lastName))
            return (null, "INVALID_NAME", "First and last name are required.");

        if (string.IsNullOrWhiteSpace(email) || !email.Contains("@"))
            return (null, "INVALID_EMAIL", "Invalid email.");

        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
            return (null, "WEAK_PASSWORD", "Password must be at least 8 characters.");

        var existing = await _users.GetByEmailAsync(email);
        if (existing != null)
            return (null, "EMAIL_EXISTS", "Email already registered.");

        var userName = $"{firstName} {lastName}".Trim();

        var user = new User(userName, email.ToLowerInvariant(), "temp");
        user.SetPasswordHash(_hasher.HashPassword(user, password));

        await _users.AddAsync(user);

        return (user, null, null);
    }

    public async Task<(User? user, string? errorCode, string? message)> LoginAsync(
        string email,
        string password)
    {
        email = (email ?? "").Trim();

        var user = await _users.GetByEmailAsync(email);
        if (user == null || !user.IsActive)
            return (null, "INVALID_CREDENTIALS", "Invalid email or password.");

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, password);
        if (result == PasswordVerificationResult.Failed)
            return (null, "INVALID_CREDENTIALS", "Invalid email or password.");

        user.UpdateLastLogin();
        await _users.UpdateAsync(user);

        return (user, null, null);
    }
}