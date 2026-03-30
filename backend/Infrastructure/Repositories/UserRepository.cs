using backend.Application.Interfaces;
using backend.Domain.Entities;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

[Table("users")]
public class UserRow : BaseModel
{
    [PrimaryKey("id", false)]       public string    Id                { get; set; } = "";
    [Column("first_name")]          public string    FirstName         { get; set; } = "";
    [Column("last_name")]           public string    LastName          { get; set; } = "";
    [Column("email")]               public string    Email             { get; set; } = "";
    [Column("password_hash")]       public string    PasswordHash      { get; set; } = "";
    [Column("phone_number")]        public string?   PhoneNumber       { get; set; }
    [Column("profile_picture_url")] public string?   ProfilePictureUrl { get; set; }
    [Column("is_email_verified")]   public bool?     IsEmailVerified   { get; set; }
    [Column("created_at")]          public DateTime  CreatedAt         { get; set; }
    [Column("last_login_at")]       public DateTime? LastLoginAt       { get; set; }
}

public class UserRepository : IUserRepository
{
    private readonly Supabase.Client _db;
    public UserRepository(Supabase.Client db) => _db = db;

    public async Task<User?> GetByEmailAsync(string email)
    {
        var result = await _db.From<UserRow>()
            .Filter("email", Operator.Equals, email.Trim().ToLowerInvariant())
            .Single();
        return result == null ? null : ToDomain(result);
    }

    public async Task<User?> GetByIdAsync(Guid id)
    {
        var result = await _db.From<UserRow>()
            .Filter("id", Operator.Equals, id.ToString())
            .Single();
        return result == null ? null : ToDomain(result);
    }

    public async Task AddAsync(User user)
    {
        // Upsert instead of Insert — if the row already exists (same id OR email),
        // this is a no-op rather than throwing a 23505 duplicate key error.
        // This eliminates the race condition where two concurrent SIGNED_IN events
        // both check "row exists? no" and then both try to insert simultaneously.
        await _db.From<UserRow>().Upsert(ToRow(user));
    }

    public async Task DeleteAsync(Guid id)
    {
        await _db.From<UserRow>()
            .Filter("id", Operator.Equals, id.ToString())
            .Delete();
    }

    public async Task UpdateAsync(User user)
    {
        var nameParts = user.UserName.Split(' ', 2);
        var firstName = nameParts[0];
        var lastName  = nameParts.Length > 1 ? nameParts[1] : "";

        await _db.From<UserRow>()
            .Filter("id", Operator.Equals, user.Id.ToString())
            .Set(r => r.FirstName,          firstName)
            .Set(r => r.LastName,           lastName)
            .Set(r => r.Email,              user.Email)
            .Set(r => r.PasswordHash,       user.PasswordHash)
            .Set(r => r.PhoneNumber!,       user.PhoneNumber)
            .Set(r => r.ProfilePictureUrl!, user.ProfilePicture)
            .Set(r => r.LastLoginAt!,       user.LastLoginAt)
            .Update();
    }

    // ── Domain ↔ Row mappers ─────────────────────────────────────────────

    private static User ToDomain(UserRow r)
    {
        return User.Restore(
            id:              Guid.Parse(r.Id),
            userName:        $"{r.FirstName} {r.LastName}".Trim(),
            email:           r.Email,
            passwordHash:    r.PasswordHash,
            profilePicture:  r.ProfilePictureUrl,
            phoneNumber:     r.PhoneNumber,
            isActive:        true,
            isEmailVerified: r.IsEmailVerified ?? false,
            createdAt:       r.CreatedAt,
            lastLoginAt:     r.LastLoginAt
        );
    }

    private static UserRow ToRow(User u)
    {
        var nameParts = u.UserName.Split(' ', 2);
        return new UserRow
        {
            Id                = u.Id.ToString(),
            FirstName         = nameParts[0],
            LastName          = nameParts.Length > 1 ? nameParts[1] : "",
            Email             = u.Email,
            PasswordHash      = u.PasswordHash,
            PhoneNumber       = u.PhoneNumber,
            ProfilePictureUrl = u.ProfilePicture,
            CreatedAt         = u.CreatedAt,
            LastLoginAt       = u.LastLoginAt
        };
    }
}