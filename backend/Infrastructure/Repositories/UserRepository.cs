using backend.Application.Interfaces;
using backend.Domain.Entities;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

[Table("users")]
public class UserRow : BaseModel
{
    [PrimaryKey("id", false)]           public string    Id                   { get; set; } = "";
    [Column("first_name")]              public string    FirstName            { get; set; } = "";
    [Column("last_name")]               public string    LastName             { get; set; } = "";
    [Column("email")]                   public string    Email                { get; set; } = "";
    [Column("password_hash")]           public string    PasswordHash         { get; set; } = "";
    [Column("phone_number")]            public string?   PhoneNumber          { get; set; }
    [Column("profile_picture_url")]     public string?   ProfilePictureUrl    { get; set; }
    [Column("is_email_verified")]       public bool?     IsEmailVerified      { get; set; }
    [Column("created_at")]              public DateTime  CreatedAt            { get; set; }
    [Column("last_login_at")]           public DateTime? LastLoginAt          { get; set; }
    [Column("last_active_at")]          public DateTime? LastActiveAt         { get; set; }

    // Plan & billing columns (added by migration 001)
    [Column("plan")]                    public string    Plan                 { get; set; } = "free";
    [Column("plan_expires_at")]         public DateTime? PlanExpiresAt        { get; set; }
    [Column("stripe_customer_id")]      public string?   StripeCustomerId     { get; set; }
    [Column("stripe_subscription_id")] public string?   StripeSubscriptionId { get; set; }
    [Column("reports_used")]            public int       ReportsUsed          { get; set; }
    [Column("reports_reset_at")]        public DateTime  ReportsResetAt       { get; set; }
}

public class UserRepository : IUserRepository
{
    private readonly Supabase.Client _db;
    public UserRepository(Supabase.Client db) => _db = db;

    public async Task<User?> GetByEmailAsync(string email)
    {
        var row = await _db.From<UserRow>()
            .Filter("email", Operator.Equals, email.Trim().ToLowerInvariant())
            .Single();
        return row == null ? null : ToDomain(row);
    }

    public async Task<User?> GetByIdAsync(Guid id)
    {
        var row = await _db.From<UserRow>()
            .Filter("id", Operator.Equals, id.ToString())
            .Single();
        return row == null ? null : ToDomain(row);
    }

    public async Task<User?> GetByStripeCustomerIdAsync(string stripeCustomerId)
    {
        var row = await _db.From<UserRow>()
            .Filter("stripe_customer_id", Operator.Equals, stripeCustomerId)
            .Single();
        return row == null ? null : ToDomain(row);
    }

    public async Task<List<User>> GetAllAsync()
    {
        var result = await _db.From<UserRow>().Get();
        return result.Models.Select(ToDomain).ToList();
    }

    public async Task AddAsync(User user) =>
        await _db.From<UserRow>().Upsert(ToRow(user));

    public async Task UpdateAsync(User user)
    {
        var parts     = user.UserName.Split(' ', 2);
        var firstName = parts[0];
        var lastName  = parts.Length > 1 ? parts[1] : "";

        await _db.From<UserRow>()
            .Filter("id", Operator.Equals, user.Id.ToString())
            .Set(r => r.FirstName,           firstName)
            .Set(r => r.LastName,            lastName)
            .Set(r => r.Email,               user.Email)
            .Set(r => r.PasswordHash,        user.PasswordHash)
            .Set(r => r.PhoneNumber!,        user.PhoneNumber)
            .Set(r => r.ProfilePictureUrl!,  user.ProfilePicture)
            .Set(r => r.LastLoginAt!,        user.LastLoginAt)
            .Update();
    }

    public async Task DeleteAsync(Guid id) =>
        await _db.From<UserRow>()
            .Filter("id", Operator.Equals, id.ToString())
            .Delete();

    // ── Plan management ───────────────────────────────────────────────────────

    public async Task SetPlanAsync(Guid userId, string plan,
        DateTime? planExpiresAt, string? stripeSubscriptionId)
    {
        var q = _db.From<UserRow>()
            .Filter("id", Operator.Equals, userId.ToString())
            .Set(r => r.Plan, plan);

        if (planExpiresAt.HasValue)
            q = q.Set(r => r.PlanExpiresAt!, planExpiresAt.Value);

        if (stripeSubscriptionId != null)
            q = q.Set(r => r.StripeSubscriptionId!, stripeSubscriptionId);

        await q.Update();
    }

    public async Task SetStripeCustomerIdAsync(Guid userId, string customerId) =>
        await _db.From<UserRow>()
            .Filter("id", Operator.Equals, userId.ToString())
            .Set(r => r.StripeCustomerId!, customerId)
            .Update();

    public async Task IncrementReportUsageAsync(Guid userId)
    {
        var row = await _db.From<UserRow>()
            .Filter("id", Operator.Equals, userId.ToString()).Single();
        if (row == null) return;
        await _db.From<UserRow>()
            .Filter("id", Operator.Equals, userId.ToString())
            .Set(r => r.ReportsUsed, row.ReportsUsed + 1)
            .Update();
    }

    public async Task ResetReportQuotaAsync(Guid userId) =>
        await _db.From<UserRow>()
            .Filter("id", Operator.Equals, userId.ToString())
            .Set(r => r.ReportsUsed,   0)
            .Set(r => r.ReportsResetAt, DateTime.UtcNow)
            .Update();

    public async Task UpdateLastActiveAsync(Guid userId) =>
        await _db.From<UserRow>()
            .Filter("id", Operator.Equals, userId.ToString())
            .Set(r => r.LastActiveAt!, DateTime.UtcNow)
            .Update();

    // ── Mappers ───────────────────────────────────────────────────────────────

    private static User ToDomain(UserRow r) => User.Restore(
        id:              Guid.Parse(r.Id),
        userName:        $"{r.FirstName} {r.LastName}".Trim(),
        email:           r.Email,
        passwordHash:    r.PasswordHash,
        profilePicture:  r.ProfilePictureUrl,
        phoneNumber:     r.PhoneNumber,
        isActive:        true,
        isEmailVerified: r.IsEmailVerified ?? false,
        createdAt:       r.CreatedAt,
        lastLoginAt:     r.LastLoginAt,
        lastActive:      r.LastActiveAt,
        plan:            r.Plan,
        planExpiresAt:   r.PlanExpiresAt,
        stripeCustomerId:      r.StripeCustomerId,
        stripeSubscriptionId:  r.StripeSubscriptionId,
        reportsUsed:     r.ReportsUsed,
        reportsResetAt:  r.ReportsResetAt
    );

    private static UserRow ToRow(User u)
    {
        var parts = u.UserName.Split(' ', 2);
        return new UserRow
        {
            Id                   = u.Id.ToString(),
            FirstName            = parts[0],
            LastName             = parts.Length > 1 ? parts[1] : "",
            Email                = u.Email,
            PasswordHash         = u.PasswordHash,
            PhoneNumber          = u.PhoneNumber,
            ProfilePictureUrl    = u.ProfilePicture,
            CreatedAt            = u.CreatedAt,
            LastLoginAt          = u.LastLoginAt,
            LastActiveAt         = u.LastActive,
            Plan                 = u.Plan,
            PlanExpiresAt        = u.PlanExpiresAt,
            StripeCustomerId     = u.StripeCustomerId,
            StripeSubscriptionId = u.StripeSubscriptionId,
            ReportsUsed          = u.ReportsUsed,
            ReportsResetAt       = u.ReportsResetAt,
        };
    }
}
