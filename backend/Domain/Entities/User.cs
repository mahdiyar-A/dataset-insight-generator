namespace backend.Domain.Entities;

/// <summary>
/// Core user domain object.
///
/// Auth is delegated to Supabase Auth — we don't store or verify passwords ourselves
/// for Supabase-registered users (passwordHash is set to "supabase-auth" as a sentinel).
/// The User entity exists so we can store DIG-specific profile data (phone, picture, etc.)
/// in our own public.users table alongside the Supabase auth.users record.
///
/// NOTE — partially wired features:
///   Email/phone verification, password reset, and pending-email-change methods exist
///   in this class but their tokens are NOT yet persisted to the database
///   (UserRepository.UserRow doesn't have those columns).
///   They're kept here ready for when we add those columns to Supabase.
/// </summary>
public class User
{
    public Guid    Id             { get; private set; }
    public string  UserName       { get; private set; } = null!;
    public string  Email          { get; private set; } = null!;
    public string? ProfilePicture { get; private set; }
    public string? PhoneNumber    { get; private set; }

    // Stored as "supabase-auth" for Supabase users — not a real hash
    public string  PasswordHash   { get; private set; } = null!;

    // ── Persisted to DB ──────────────────────────────────────────────────────
    public bool      IsActive        { get; private set; } = true;
    public bool      IsEmailVerified { get; private set; } = false;
    public DateTime  CreatedAt       { get; private set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt     { get; private set; }

    // ── Not yet persisted (tokens live in memory only) ───────────────────────
    // These will be wired to DB columns when email-verification and password-reset
    // flows are implemented. Until then they are valid in-process but lost on restart.
    public string?   EmailVerificationToken  { get; private set; }
    public DateTime? EmailVerificationExpiry { get; private set; }

    public string?   PasswordResetToken      { get; private set; }
    public DateTime? PasswordResetExpiry     { get; private set; }

    public string?   PendingEmail            { get; private set; }
    public string?   PendingEmailToken       { get; private set; }
    public DateTime? PendingEmailExpiry      { get; private set; }

    public string?   PhoneOtp                { get; private set; }
    public DateTime? PhoneOtpExpiry          { get; private set; }

    protected User() { }

    // Standard constructor — generates a new UUID
    public User(string userName, string email, string passwordHash, string? profilePicture = null)
    {
        Id              = Guid.NewGuid();
        UserName        = userName.Trim();
        Email           = NormalizeEmail(email);
        PasswordHash    = passwordHash;
        ProfilePicture  = profilePicture;
        IsEmailVerified = false;
    }

    // Used when Supabase Auth creates the user — we adopt their UUID as our primary key
    // so the two tables stay in sync without a foreign-key join
    public static User CreateWithId(Guid id, string userName, string email, string passwordHash)
    {
        var u = new User
        {
            Id              = id,
            UserName        = userName.Trim(),
            Email           = NormalizeEmail(email),
            PasswordHash    = passwordHash,
            IsEmailVerified = true  // Supabase already verified the email
        };
        return u;
    }

    // ── Simple state setters ─────────────────────────────────────────────────

    public void Deactivate()                              => IsActive      = false;
    public void Activate()                                => IsActive      = true;
    public void UpdateLastLogin()                         => LastLoginAt   = DateTime.UtcNow;
    public void UpdateUserName(string name)               => UserName      = name.Trim();
    public void UpdatePhoneNumber(string? phone)          => PhoneNumber   = phone?.Trim();
    public void UpdateEmail(string email)                 => Email         = NormalizeEmail(email);
    public void SetPasswordHash(string hash)              => PasswordHash  = hash;
    public void SetProfilePicture(string? path)           => ProfilePicture = path;

    // ── Email verification ───────────────────────────────────────────────────

    public string GenerateEmailVerificationToken()
    {
        // Two GUIDs concatenated = 64 hex chars, effectively unguessable
        EmailVerificationToken  = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        EmailVerificationExpiry = DateTime.UtcNow.AddHours(24);
        return EmailVerificationToken;
    }

    public bool VerifyEmail(string token)
    {
        if (EmailVerificationToken != token)  return false;
        if (EmailVerificationExpiry < DateTime.UtcNow) return false;

        IsEmailVerified         = true;
        EmailVerificationToken  = null;
        EmailVerificationExpiry = null;
        return true;
    }

    // ── Password reset ───────────────────────────────────────────────────────

    public string GeneratePasswordResetToken()
    {
        PasswordResetToken  = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        PasswordResetExpiry = DateTime.UtcNow.AddHours(1);
        return PasswordResetToken;
    }

    public bool ValidatePasswordResetToken(string token)
    {
        if (PasswordResetToken != token)  return false;
        if (PasswordResetExpiry < DateTime.UtcNow) return false;
        return true;
    }

    public void ClearPasswordResetToken()
    {
        PasswordResetToken  = null;
        PasswordResetExpiry = null;
    }

    // ── Pending email change ─────────────────────────────────────────────────
    // The user requests a new email → we store it as "pending" until they click
    // the verification link sent to the new address

    public string SetPendingEmail(string newEmail)
    {
        PendingEmail       = NormalizeEmail(newEmail);
        PendingEmailToken  = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        PendingEmailExpiry = DateTime.UtcNow.AddHours(1);
        return PendingEmailToken;
    }

    public bool ConfirmEmailChange(string token)
    {
        if (PendingEmailToken != token)  return false;
        if (PendingEmailExpiry < DateTime.UtcNow) return false;
        if (PendingEmail == null)        return false;

        Email              = PendingEmail;
        PendingEmail       = null;
        PendingEmailToken  = null;
        PendingEmailExpiry = null;
        return true;
    }

    // ── Phone OTP ────────────────────────────────────────────────────────────

    public string GeneratePhoneOtp()
    {
        // 6-digit numeric OTP, expires in 10 minutes
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

    // ── Restore from DB (called by UserRepository.ToDomain) ─────────────────
    // Named factory so callers are explicit that this is a DB hydration, not a new user

    public static User Restore(
        Guid id, string userName, string email, string passwordHash,
        string? profilePicture, string? phoneNumber,
        bool isActive, bool isEmailVerified,
        DateTime createdAt, DateTime? lastLoginAt,
        string? emailVerificationToken  = null, DateTime? emailVerificationExpiry = null,
        string? passwordResetToken      = null, DateTime? passwordResetExpiry     = null,
        string? pendingEmail            = null, string?   pendingEmailToken       = null,
        DateTime? pendingEmailExpiry    = null,
        string? phoneOtp                = null, DateTime? phoneOtpExpiry          = null)
    {
        return new User
        {
            Id                       = id,
            UserName                 = userName,
            Email                    = email,
            PasswordHash             = passwordHash,
            ProfilePicture           = profilePicture,
            PhoneNumber              = phoneNumber,
            IsActive                 = isActive,
            IsEmailVerified          = isEmailVerified,
            CreatedAt                = createdAt,
            LastLoginAt              = lastLoginAt,
            EmailVerificationToken   = emailVerificationToken,
            EmailVerificationExpiry  = emailVerificationExpiry,
            PasswordResetToken       = passwordResetToken,
            PasswordResetExpiry      = passwordResetExpiry,
            PendingEmail             = pendingEmail,
            PendingEmailToken        = pendingEmailToken,
            PendingEmailExpiry       = pendingEmailExpiry,
            PhoneOtp                 = phoneOtp,
            PhoneOtpExpiry           = phoneOtpExpiry,
        };
    }

    // Normalize email: trim whitespace and lowercase so "User@MAIL.com" and
    // "user@mail.com" are always treated as the same address
    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}
