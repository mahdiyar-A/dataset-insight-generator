namespace backend.Application.DTOs.User;

/// <summary>
/// Data returned by GET /api/user/me.
/// Safe to expose to the client — never includes password hash or raw Stripe keys.
/// </summary>
public class GetMeResponseDto
{
    public Guid    Id              { get; set; }
    public string  Email           { get; set; } = default!;
    public string  UserName        { get; set; } = default!;
    public string? FirstName       { get; set; }
    public string? LastName        { get; set; }
    public string? PhoneNumber     { get; set; }
    public string? ProfilePicture  { get; set; }
    public DateTime  CreatedAt     { get; set; }
    public DateTime? LastLoginAt   { get; set; }
    public DateTime? LastActive    { get; set; }
    public bool    IsActive        { get; set; }
    public bool    IsEmailVerified { get; set; }

    // Plan & usage — needed by PlanBadge and quota checks in the frontend
    public string    Plan           { get; set; } = "free";
    public DateTime? PlanExpiresAt  { get; set; }
    public int       ReportsUsed    { get; set; }
    public DateTime  ReportsResetAt { get; set; }

    // History cap depends on plan
    public int HistoryLimit => Plan is "pro" or "admin" ? 15 : 5;
}
