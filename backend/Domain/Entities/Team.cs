namespace backend.Domain.Entities;

/// <summary>
/// A collaboration team. Owned by one pro user; all members must have pro plans.
/// The owner shares specific analyses into the workspace for team access.
/// </summary>
public class Team
{
    public Guid     Id          { get; private set; }
    public string   Name        { get; private set; } = null!;
    public Guid     OwnerId     { get; private set; }
    public string   InviteCode  { get; private set; } = null!;
    public DateTime CreatedAt   { get; private set; }

    // Populated separately by the repository when a full team view is needed
    public List<TeamMember> Members { get; private set; } = new();

    protected Team() { }

    public Team(Guid ownerId, string name)
    {
        Id         = Guid.NewGuid();
        OwnerId    = ownerId;
        Name       = name.Trim();
        InviteCode = Guid.NewGuid().ToString("N")[..16];
        CreatedAt  = DateTime.UtcNow;
    }

    public void Rename(string name)          => Name       = name.Trim();
    public void RegenerateInviteCode()        => InviteCode = Guid.NewGuid().ToString("N")[..16];

    public static Team Restore(Guid id, string name, Guid ownerId, string inviteCode, DateTime createdAt) =>
        new() { Id = id, Name = name, OwnerId = ownerId, InviteCode = inviteCode, CreatedAt = createdAt };
}

/// <summary>
/// A member of a team. role: "owner" | "editor" | "viewer"
/// Editors can annotate and export. Viewers can only view.
/// </summary>
public class TeamMember
{
    public Guid     Id        { get; private set; }
    public Guid     TeamId    { get; private set; }
    public Guid     UserId    { get; private set; }
    public string   Role      { get; private set; } = "viewer";
    public DateTime JoinedAt  { get; private set; }

    // Populated via JOIN for display in the team management UI
    public string? UserName { get; set; }
    public string? Email    { get; set; }
    public string? Plan     { get; set; }

    protected TeamMember() { }

    public TeamMember(Guid teamId, Guid userId, string role = "viewer")
    {
        Id       = Guid.NewGuid();
        TeamId   = teamId;
        UserId   = userId;
        Role     = role;
        JoinedAt = DateTime.UtcNow;
    }

    public void SetRole(string role) => Role = role;
}

/// <summary>
/// A pending email invitation to join a team.
/// The 64-char token is included in the invite link sent by email.
/// Expires after 7 days if not accepted.
/// </summary>
public class TeamInvite
{
    public Guid      Id          { get; private set; }
    public Guid      TeamId      { get; private set; }
    public string    Email       { get; private set; } = null!;
    public string    Token       { get; private set; } = null!;
    public string    Role        { get; private set; } = "viewer";
    public Guid?     InvitedBy   { get; private set; }
    public DateTime  CreatedAt   { get; private set; }
    public DateTime  ExpiresAt   { get; private set; }
    public DateTime? AcceptedAt  { get; private set; }

    public bool IsExpired  => DateTime.UtcNow > ExpiresAt;
    public bool IsAccepted => AcceptedAt.HasValue;
    public bool IsPending  => !IsAccepted && !IsExpired;

    protected TeamInvite() { }

    public TeamInvite(Guid teamId, string email, string role, Guid invitedBy)
    {
        Id        = Guid.NewGuid();
        TeamId    = teamId;
        Email     = email.Trim().ToLowerInvariant();
        Token     = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        Role      = role;
        InvitedBy = invitedBy;
        CreatedAt = DateTime.UtcNow;
        ExpiresAt = DateTime.UtcNow.AddDays(7);
    }

    public void Accept() => AcceptedAt = DateTime.UtcNow;

    public static TeamInvite Restore(
        Guid id, Guid teamId, string email, string token, string role,
        Guid? invitedBy, DateTime createdAt, DateTime expiresAt, DateTime? acceptedAt) =>
        new()
        {
            Id        = id,     TeamId    = teamId,    Email     = email,
            Token     = token,  Role      = role,      InvitedBy = invitedBy,
            CreatedAt = createdAt, ExpiresAt = expiresAt, AcceptedAt = acceptedAt,
        };
}
