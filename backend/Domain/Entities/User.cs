using System.Text.Json.Serialization;

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

    // Dashboard pointers (latest-only design)
    public Guid? LatestDatasetId { get; private set; }
    public Guid? LatestJobId { get; private set; }
    public Guid? LatestReportId { get; private set; }

    // State
    public bool IsActive { get; private set; } = true;
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; private set; }

    //  EF Core needs this
    protected User() { }

    // Optional: keep for JSON tools if you want
    [JsonConstructor]
    private User(Guid id, string userName, string email, string passwordHash, string? profilePicture,
        Guid? latestDatasetId, Guid? latestJobId, Guid? latestReportId,
        bool isActive, DateTime createdAt, DateTime? lastLoginAt)
    {
        Id = id;
        UserName = userName;
        Email = email;
        PasswordHash = passwordHash;
        ProfilePicture = profilePicture;
        LatestDatasetId = latestDatasetId;
        LatestJobId = latestJobId;
        LatestReportId = latestReportId;
        IsActive = isActive;
        CreatedAt = createdAt;
        LastLoginAt = lastLoginAt;
    }

    public User(string userName, string email, string passwordHash, string? profilePicture = null)
    {
        Id = Guid.NewGuid();
        UserName = userName.Trim();
        Email = NormalizeEmail(email);
        PasswordHash = passwordHash;
        ProfilePicture = profilePicture;
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
    public void UpdateLastLogin() => LastLoginAt = DateTime.UtcNow;

    public void UpdateEmail(string newEmail) => Email = NormalizeEmail(newEmail);
    public void UpdateUserName(string newUserName) => UserName = newUserName.Trim();

    public void SetPasswordHash(string newPasswordHash) => PasswordHash = newPasswordHash;
    public void SetProfilePicture(string? profilePicture) => ProfilePicture = profilePicture;

    public void SetLatestDataset(Guid datasetId) => LatestDatasetId = datasetId;
    public void SetLatestJob(Guid jobId) => LatestJobId = jobId;
    public void SetLatestReport(Guid reportId) => LatestReportId = reportId;

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}