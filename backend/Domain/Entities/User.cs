using System.Text.Json.Serialization;

namespace backend.Domain.Entities;

public class User
{
    public Guid Id { get; private set; }

    public string  UserName       { get; private set; } = null!;
    public string  Email          { get; private set; } = null!;
    public string? ProfilePicture { get; private set; }
    public string? PhoneNumber    { get; private set; }

    public string PasswordHash { get; private set; } = null!;

    public Guid? LatestDatasetId { get; private set; }
    public Guid? LatestJobId     { get; private set; }
    public Guid? LatestReportId  { get; private set; }

    public bool      IsActive    { get; private set; } = true;
    public DateTime  CreatedAt   { get; private set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; private set; }

    protected User() { }

    [JsonConstructor]
    private User(Guid id, string userName, string email, string passwordHash,
        string? profilePicture, string? phoneNumber,
        Guid? latestDatasetId, Guid? latestJobId, Guid? latestReportId,
        bool isActive, DateTime createdAt, DateTime? lastLoginAt)
    {
        Id             = id;
        UserName       = userName;
        Email          = email;
        PasswordHash   = passwordHash;
        ProfilePicture = profilePicture;
        PhoneNumber    = phoneNumber;
        LatestDatasetId = latestDatasetId;
        LatestJobId     = latestJobId;
        LatestReportId  = latestReportId;
        IsActive   = isActive;
        CreatedAt  = createdAt;
        LastLoginAt = lastLoginAt;
    }

    public User(string userName, string email, string passwordHash, string? profilePicture = null)
    {
        Id             = Guid.NewGuid();
        UserName       = userName.Trim();
        Email          = NormalizeEmail(email);
        PasswordHash   = passwordHash;
        ProfilePicture = profilePicture;
    }

    public void Deactivate()    => IsActive  = false;
    public void Activate()      => IsActive  = true;
    public void UpdateLastLogin() => LastLoginAt = DateTime.UtcNow;

    public void UpdateEmail(string newEmail)       => Email       = NormalizeEmail(newEmail);
    public void UpdateUserName(string newUserName) => UserName    = newUserName.Trim();
    public void UpdatePhoneNumber(string? phone)   => PhoneNumber = phone?.Trim();

    public void SetPasswordHash(string newPasswordHash)   => PasswordHash   = newPasswordHash;
    public void SetProfilePicture(string? profilePicture) => ProfilePicture = profilePicture;

    public void SetLatestDataset(Guid datasetId) => LatestDatasetId = datasetId;
    public void SetLatestJob(Guid jobId)         => LatestJobId     = jobId;
    public void SetLatestReport(Guid reportId)   => LatestReportId  = reportId;

    // ── Restore from DB row — preserves all persisted fields ─────────────
    public static User Restore(
        Guid id, string userName, string email, string passwordHash,
        string? profilePicture, string? phoneNumber,
        bool isActive, DateTime createdAt, DateTime? lastLoginAt)
    {
        var u = new User();   // protected parameterless ctor
        u.Id             = id;
        u.UserName       = userName;
        u.Email          = email;
        u.PasswordHash   = passwordHash;
        u.ProfilePicture = profilePicture;
        u.PhoneNumber    = phoneNumber;
        u.IsActive       = isActive;
        u.CreatedAt      = createdAt;
        u.LastLoginAt    = lastLoginAt;
        return u;
    }

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}