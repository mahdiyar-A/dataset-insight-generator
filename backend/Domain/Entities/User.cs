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

    // ── Email verification ───────────────────────────────────────────────
    public bool      IsEmailVerified         { get; private set; } = false;
    public string?   EmailVerificationToken  { get; private set; }
    public DateTime? EmailVerificationExpiry { get; private set; }

    // ── Password reset ───────────────────────────────────────────────────
    public string?   PasswordResetToken      { get; private set; }
    public DateTime? PasswordResetExpiry     { get; private set; }

    // ── Pending email change ─────────────────────────────────────────────
    public string?   PendingEmail            { get; private set; }
    public string?   PendingEmailToken       { get; private set; }
    public DateTime? PendingEmailExpiry      { get; private set; }

    // ── Phone OTP ────────────────────────────────────────────────────────
    public string?   PhoneOtp                { get; private set; }
    public DateTime? PhoneOtpExpiry          { get; private set; }

    public Guid? LatestDatasetId { get; private set; }
    public Guid? LatestJobId     { get; private set; }
    public Guid? LatestReportId  { get; private set; }

    public bool      IsActive    { get; private set; } = true;
    public DateTime  CreatedAt   { get; private set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; private set; }

    protected User() { }

    public User(string userName, string email, string passwordHash, string? profilePicture = null)
    {
        Id             = Guid.NewGuid();
        UserName       = userName.Trim();
        Email          = NormalizeEmail(email);
        PasswordHash   = passwordHash;
        ProfilePicture = profilePicture;
        IsEmailVerified = false;
    }

    // Used when Supabase Auth creates the user — we use their UUID as our ID
    public static User CreateWithId(Guid id, string userName, string email, string passwordHash)
    {
        var u = new User();
        u.Id            = id;
        u.UserName      = userName.Trim();
        u.Email         = NormalizeEmail(email);
        u.PasswordHash  = passwordHash;
        u.IsEmailVerified = true; // Supabase already verified
        return u;
    }

    public void Deactivate()      => IsActive    = false;
    public void Activate()        => IsActive    = true;
    public void UpdateLastLogin() => LastLoginAt = DateTime.UtcNow;

    public void UpdateUserName(string newUserName) => UserName    = newUserName.Trim();
    public void UpdatePhoneNumber(string? phone)   => PhoneNumber = phone?.Trim();

    public void SetPasswordHash(string newPasswordHash)   => PasswordHash   = newPasswordHash;
    public void SetProfilePicture(string? profilePicture) => ProfilePicture = profilePicture;

    public void SetLatestDataset(Guid datasetId) => LatestDatasetId = datasetId;
    public void SetLatestJob(Guid jobId)         => LatestJobId     = jobId;
    public void SetLatestReport(Guid reportId)   => LatestReportId  = reportId;

    // ── Email verification ───────────────────────────────────────────────
    public string GenerateEmailVerificationToken()
    {
        EmailVerificationToken  = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        EmailVerificationExpiry = DateTime.UtcNow.AddHours(24);
        return EmailVerificationToken;
    }

    public bool VerifyEmail(string token)
    {
        if (EmailVerificationToken != token) return false;
        if (EmailVerificationExpiry < DateTime.UtcNow) return false;
        IsEmailVerified        = true;
        EmailVerificationToken = null;
        EmailVerificationExpiry = null;
        return true;
    }

    // ── Password reset ───────────────────────────────────────────────────
    public string GeneratePasswordResetToken()
    {
        PasswordResetToken  = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        PasswordResetExpiry = DateTime.UtcNow.AddHours(1);
        return PasswordResetToken;
    }

    public bool ValidatePasswordResetToken(string token)
    {
        if (PasswordResetToken != token) return false;
        if (PasswordResetExpiry < DateTime.UtcNow) return false;
        return true;
    }

    public void ClearPasswordResetToken()
    {
        PasswordResetToken  = null;
        PasswordResetExpiry = null;
    }

    // ── Email change ─────────────────────────────────────────────────────
    public string SetPendingEmail(string newEmail)
    {
        PendingEmail       = NormalizeEmail(newEmail);
        PendingEmailToken  = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        PendingEmailExpiry = DateTime.UtcNow.AddHours(1);
        return PendingEmailToken;
    }

    public bool ConfirmEmailChange(string token)
    {
        if (PendingEmailToken != token) return false;
        if (PendingEmailExpiry < DateTime.UtcNow) return false;
        if (PendingEmail == null) return false;
        Email              = PendingEmail;
        PendingEmail       = null;
        PendingEmailToken  = null;
        PendingEmailExpiry = null;
        return true;
    }

    // ── Phone OTP ────────────────────────────────────────────────────────
    public string GeneratePhoneOtp()
    {
        PhoneOtp       = new Random().Next(100000, 999999).ToString();
        PhoneOtpExpiry = DateTime.UtcNow.AddMinutes(10);
        return PhoneOtp;
    }

    public bool VerifyPhoneOtp(string otp)
    {
        if (PhoneOtp != otp) return false;
        if (PhoneOtpExpiry < DateTime.UtcNow) return false;
        PhoneOtp       = null;
        PhoneOtpExpiry = null;
        return true;
    }

    // ── Update email directly (no verification — internal use only) ──────
    public void UpdateEmail(string newEmail) => Email = NormalizeEmail(newEmail);

    // ── Restore from DB ──────────────────────────────────────────────────
    public static User Restore(
        Guid id, string userName, string email, string passwordHash,
        string? profilePicture, string? phoneNumber,
        bool isActive, bool isEmailVerified,
        DateTime createdAt, DateTime? lastLoginAt,
        string? emailVerificationToken  = null, DateTime? emailVerificationExpiry = null,
        string? passwordResetToken      = null, DateTime? passwordResetExpiry     = null,
        string? pendingEmail            = null, string?   pendingEmailToken       = null, DateTime? pendingEmailExpiry = null,
        string? phoneOtp                = null, DateTime? phoneOtpExpiry          = null)
    {
        var u = new User();
        u.Id                       = id;
        u.UserName                 = userName;
        u.Email                    = email;
        u.PasswordHash             = passwordHash;
        u.ProfilePicture           = profilePicture;
        u.PhoneNumber              = phoneNumber;
        u.IsActive                 = isActive;
        u.IsEmailVerified          = isEmailVerified;
        u.CreatedAt                = createdAt;
        u.LastLoginAt              = lastLoginAt;
        u.EmailVerificationToken   = emailVerificationToken;
        u.EmailVerificationExpiry  = emailVerificationExpiry;
        u.PasswordResetToken       = passwordResetToken;
        u.PasswordResetExpiry      = passwordResetExpiry;
        u.PendingEmail             = pendingEmail;
        u.PendingEmailToken        = pendingEmailToken;
        u.PendingEmailExpiry       = pendingEmailExpiry;
        u.PhoneOtp                 = phoneOtp;
        u.PhoneOtpExpiry           = phoneOtpExpiry;
        return u;
    }

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}