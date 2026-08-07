using backend.Domain.Entities;
using FluentAssertions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// Tests for the User domain entity's security-sensitive methods.
///
/// Risk focus: token generation, expiry enforcement, and email normalization
/// are security primitives. A bug in any of these could let an attacker:
///  - Use an expired password reset token
///  - Change another user's email by guessing a token
///  - Bypass email uniqueness checks via case differences
/// These tests assert the exact security contract, not just "it doesn't crash."
/// </summary>
[TestFixture]
public class UserEntityTests
{
    private User MakeUser() =>
        new User("testuser", "User@Example.COM", "supabase-auth");

    // ── Email normalization ──────────────────────────────────────────────────

    [Test]
    public void Constructor_NormalizesEmail_ToLowercaseTrimmed()
    {
        // Risk: if emails aren't normalized, "User@MAIL.com" and "user@mail.com"
        // are treated as different accounts — duplicate registrations, auth fails.
        var u = new User("name", "  USER@EXAMPLE.COM  ", "hash");
        u.Email.Should().Be("user@example.com");
    }

    [Test]
    public void UpdateEmail_NormalizesNewEmail()
    {
        var u = MakeUser();
        u.UpdateEmail("  NEW@DOMAIN.ORG  ");
        u.Email.Should().Be("new@domain.org");
    }

    // ── Email verification ───────────────────────────────────────────────────

    [Test]
    public void GenerateEmailVerificationToken_ReturnsNonEmptyToken()
    {
        var u = MakeUser();
        var token = u.GenerateEmailVerificationToken();
        token.Should().NotBeNullOrWhiteSpace();
        token.Length.Should().BeGreaterThan(32);  // two GUIDs concatenated = 64 chars
    }

    [Test]
    public void GenerateEmailVerificationToken_EachCallProducesDifferentToken()
    {
        // Risk: if tokens repeat, an attacker who observed one verification link
        // could reuse it for a different account.
        var u = MakeUser();
        var t1 = u.GenerateEmailVerificationToken();
        var t2 = u.GenerateEmailVerificationToken();
        t1.Should().NotBe(t2);
    }

    [Test]
    public void VerifyEmail_WithCorrectToken_ReturnsTrue_AndSetsVerified()
    {
        var u = MakeUser();
        var token = u.GenerateEmailVerificationToken();
        var result = u.VerifyEmail(token);
        result.Should().BeTrue();
        u.IsEmailVerified.Should().BeTrue();
    }

    [Test]
    public void VerifyEmail_WithWrongToken_ReturnsFalse()
    {
        // Risk: accepting any token is a critical security hole.
        var u = MakeUser();
        u.GenerateEmailVerificationToken();
        var result = u.VerifyEmail("wrong-token");
        result.Should().BeFalse();
        u.IsEmailVerified.Should().BeFalse();
    }

    [Test]
    public void VerifyEmail_WithExpiredToken_ReturnsFalse()
    {
        // Risk: if expiry isn't checked, a token from a year ago still works
        // — an attacker who captured an old link gains account access.
        // We can't time-travel without seams, so we verify the expiry field is set
        // and manually test the boundary logic.
        var u = MakeUser();
        u.GenerateEmailVerificationToken();

        // Restore the user with an already-expired token
        var expiredUser = User.Restore(
            u.Id, u.UserName, u.Email, u.PasswordHash,
            null, null, true, false, u.CreatedAt, null,
            emailVerificationToken: "expired-token",
            emailVerificationExpiry: DateTime.UtcNow.AddHours(-1)  // 1 hour in the past
        );

        var result = expiredUser.VerifyEmail("expired-token");
        result.Should().BeFalse();
    }

    // ── Password reset ───────────────────────────────────────────────────────

    [Test]
    public void GeneratePasswordResetToken_ReturnsNonEmptyToken()
    {
        var u = MakeUser();
        var token = u.GeneratePasswordResetToken();
        token.Should().NotBeNullOrWhiteSpace();
    }

    [Test]
    public void ValidatePasswordResetToken_AfterExpiry_ReturnsFalse()
    {
        // Risk: expired reset tokens are a common attack vector — if not enforced,
        // a phishing link from months ago still resets the victim's password.
        var u = User.Restore(
            Guid.NewGuid(), "user", "u@test.com", "hash",
            null, null, true, true, DateTime.UtcNow, null,
            passwordResetToken: "some-token",
            passwordResetExpiry: DateTime.UtcNow.AddHours(-2)  // expired
        );

        u.ValidatePasswordResetToken("some-token").Should().BeFalse();
    }

    [Test]
    public void ValidatePasswordResetToken_WithWrongToken_ReturnsFalse()
    {
        var u = MakeUser();
        u.GeneratePasswordResetToken();
        u.ValidatePasswordResetToken("not-the-right-token").Should().BeFalse();
    }

    [Test]
    public void ClearPasswordResetToken_RemovesToken()
    {
        // Risk: if the token isn't cleared after use, the same reset link works
        // indefinitely — allowing repeated password resets via one captured email.
        var u = MakeUser();
        var token = u.GeneratePasswordResetToken();
        u.ClearPasswordResetToken();
        u.ValidatePasswordResetToken(token).Should().BeFalse();
    }

    // ── Pending email change ─────────────────────────────────────────────────

    [Test]
    public void ConfirmEmailChange_WithValidToken_UpdatesEmail()
    {
        var u = MakeUser();
        var token = u.SetPendingEmail("new@domain.com");
        var result = u.ConfirmEmailChange(token);
        result.Should().BeTrue();
        u.Email.Should().Be("new@domain.com");
    }

    [Test]
    public void ConfirmEmailChange_WithWrongToken_DoesNotChangeEmail()
    {
        // Risk: if the token check is bypassed, any user could change another
        // user's email to take over their account.
        var u = MakeUser();
        var original = u.Email;
        u.SetPendingEmail("new@domain.com");
        var result = u.ConfirmEmailChange("wrong-token");
        result.Should().BeFalse();
        u.Email.Should().Be(original);
    }

    [Test]
    public void ConfirmEmailChange_AfterExpiry_DoesNotChangeEmail()
    {
        var u = User.Restore(
            Guid.NewGuid(), "user", "original@test.com", "hash",
            null, null, true, true, DateTime.UtcNow, null,
            pendingEmail:       "new@test.com",
            pendingEmailToken:  "token123",
            pendingEmailExpiry: DateTime.UtcNow.AddHours(-1)  // expired
        );

        var result = u.ConfirmEmailChange("token123");
        result.Should().BeFalse();
        u.Email.Should().Be("original@test.com");
    }

    // ── Plan and quota management ────────────────────────────────────────────

    [Test]
    public void IncrementReportUsage_IncreasesCounterByOne()
    {
        // Risk: if the counter doesn't increment, free users can run unlimited
        // analyses — bypassing the 2-per-48h quota entirely.
        var u = MakeUser();
        u.IncrementReportUsage();
        u.ReportsUsed.Should().Be(1);
        u.IncrementReportUsage();
        u.ReportsUsed.Should().Be(2);
    }

    [Test]
    public void ResetReportQuota_SetsCounterToZeroAndUpdatesResetAt()
    {
        // Risk: if reset doesn't work, a free user can never run analyses again
        // after hitting the quota — even after the 48h window.
        var u = MakeUser();
        u.IncrementReportUsage();
        u.IncrementReportUsage();
        var before = DateTime.UtcNow;
        u.ResetReportQuota();
        u.ReportsUsed.Should().Be(0);
        u.ReportsResetAt.Should().BeOnOrAfter(before);
    }

    [Test]
    public void SetPlan_UpdatesPlanAndSubscriptionId()
    {
        var u = MakeUser();
        var expiry = DateTime.UtcNow.AddMonths(1);
        u.SetPlan("pro", expiry, "sub_123");
        u.Plan.Should().Be("pro");
        u.PlanExpiresAt.Should().BeCloseTo(expiry, TimeSpan.FromSeconds(1));
        u.StripeSubscriptionId.Should().Be("sub_123");
    }

    // ── Phone OTP ────────────────────────────────────────────────────────────

    [Test]
    public void GeneratePhoneOtp_IsSixDigitNumeric()
    {
        // Risk: if the OTP has fewer than 6 digits, the entropy is too low
        // and brute-force attacks become practical.
        var u = MakeUser();
        var otp = u.GeneratePhoneOtp();
        otp.Should().MatchRegex(@"^\d{6}$");
    }

    [Test]
    public void VerifyPhoneOtp_WithCorrectOtp_ReturnsTrue_AndClearsOtp()
    {
        var u = MakeUser();
        var otp = u.GeneratePhoneOtp();
        u.VerifyPhoneOtp(otp).Should().BeTrue();
        // OTP is cleared after use — replay attack prevention
        u.VerifyPhoneOtp(otp).Should().BeFalse();
    }

    [Test]
    public void VerifyPhoneOtp_WithWrongCode_ReturnsFalse()
    {
        var u = MakeUser();
        u.GeneratePhoneOtp();
        u.VerifyPhoneOtp("000000").Should().BeFalse();
    }
}
