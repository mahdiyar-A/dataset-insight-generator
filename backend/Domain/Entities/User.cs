namespace backend.Domain.Entities;

public class User
{
    public Guid Id { get; private set; }

    // Public
    public string UserName { get; private set; } = null!;
    public string Email { get; private set; } = null!;
    public string? ProfilePicture { get; private set; }

    // Security (never expose)
    public string PasswordHash { get; private set; } = null!;

    // State
    public bool IsActive { get; private set; } = true;
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; private set; }

    private User() { } // EF Core

    public User(string userName, string email, string passwordHash, string? profilePicture = null)
    {
        Id = Guid.NewGuid();
        UserName = userName;
        Email = email;
        PasswordHash = passwordHash;
        ProfilePicture = profilePicture;
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
    public void UpdateLastLogin() => LastLoginAt = DateTime.UtcNow;

    public void UpdateEmail(string newEmail) => Email = newEmail;
    public void UpdateUserName(string newUserName) => UserName = newUserName;

    // Call this only from AuthService
    public void SetPasswordHash(string newPasswordHash) => PasswordHash = newPasswordHash;

    public void SetProfilePicture(string? profilePicture) => ProfilePicture = profilePicture;
}
