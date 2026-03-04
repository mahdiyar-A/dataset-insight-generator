using backend.Application.Interfaces;
using backend.Domain.Entities;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

[Table("users")]
public class UserRow : BaseModel
{
    [PrimaryKey("id", false)]       public string   Id                { get; set; } = "";
    [Column("first_name")]          public string   FirstName         { get; set; } = "";
    [Column("last_name")]           public string   LastName          { get; set; } = "";
    [Column("email")]               public string   Email             { get; set; } = "";
    [Column("password_hash")]       public string   PasswordHash      { get; set; } = "";
    [Column("profile_picture_url")] public string?  ProfilePictureUrl { get; set; }
    [Column("created_at")]          public DateTime  CreatedAt        { get; set; }
    [Column("last_login_at")]       public DateTime? LastLoginAt      { get; set; }
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
        await _db.From<UserRow>().Insert(ToRow(user));
    }

    public async Task UpdateAsync(User user)
    {
        // Update by id explicitly — avoids duplicate key on email unique constraint
        await _db.From<UserRow>()
            .Filter("id", Operator.Equals, user.Id.ToString())
            .Set(r => r.LastLoginAt!, user.LastLoginAt)
            .Set(r => r.ProfilePictureUrl!, user.ProfilePicture)
            .Set(r => r.FirstName, user.UserName.Split(' ').FirstOrDefault() ?? user.UserName)
            .Set(r => r.LastName, user.UserName.Contains(' ')
                ? string.Join(' ', user.UserName.Split(' ').Skip(1))
                : "")
            .Update();
    }

    private static User ToDomain(UserRow r)
    {
        var fullName = $"{r.FirstName} {r.LastName}".Trim();
        return new User(fullName, r.Email, r.PasswordHash, r.ProfilePictureUrl);
    }

    private static UserRow ToRow(User u) => new()
    {
        Id                = u.Id.ToString(),
        FirstName         = u.UserName.Split(' ').FirstOrDefault() ?? u.UserName,
        LastName          = u.UserName.Contains(' ')
                            ? string.Join(' ', u.UserName.Split(' ').Skip(1))
                            : "",
        Email             = u.Email,
        PasswordHash      = u.PasswordHash,
        ProfilePictureUrl = u.ProfilePicture,
        CreatedAt         = u.CreatedAt,
        LastLoginAt       = u.LastLoginAt
    };
}