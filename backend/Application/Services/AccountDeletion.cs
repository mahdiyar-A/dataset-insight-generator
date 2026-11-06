using backend.Application.Interfaces;

namespace backend.Application.Services;

/// <summary>
/// Removes a person from DIG, as the privacy page and terms promise: the
/// account record, every analysis, and every stored file.
///
/// The Delete Account button used to mark an in-memory flag that was never
/// saved, so it logged the person out and deleted nothing.
///
/// Safe to run again after a failure: each step skips what is already gone, so
/// a person who sees "try again" can do exactly that.
/// </summary>
public class AccountDeletion
{
    private readonly IUserRepository      _users;
    private readonly IStorageService      _storage;
    private readonly ITeamRepository      _teams;
    private readonly IWorkspaceRepository _workspaces;
    private readonly IStripeService       _stripe;
    private readonly IAuthAdmin           _auth;

    public AccountDeletion(
        IUserRepository      users,
        IStorageService      storage,
        ITeamRepository      teams,
        IWorkspaceRepository workspaces,
        IStripeService       stripe,
        IAuthAdmin           auth)
    {
        _users      = users;
        _storage    = storage;
        _teams      = teams;
        _workspaces = workspaces;
        _stripe     = stripe;
        _auth       = auth;
    }

    public async Task DeleteAsync(Guid userId)
    {
        var user = await _users.GetByIdAsync(userId);

        // Billing first. If this fails nothing has been deleted yet, and a
        // subscription must never outlive the account it pays for.
        if (user is { Plan: "pro", StripeSubscriptionId: { Length: > 0 } subscription })
            await _stripe.CancelSubscriptionAsync(subscription);

        // Files before the row: nothing in Postgres can reach the bucket, so
        // the other order would strand files with no record of whose they were.
        await _storage.DeleteUserFilesAsync(userId);

        // The two references the database will not clear by itself.
        await _workspaces.DeleteRepliesToUserAsync(userId);
        await _teams.ClearInviterAsync(userId);

        // Cascades to analyses, memberships, owned teams and comments.
        await _users.DeleteAsync(userId);

        // Last, or a failed run would leave the person unable to sign in and
        // try again. Left in place, this record would also let them back in,
        // and the next sign-in would make them a fresh empty account.
        await _auth.DeleteUserAsync(userId);
    }
}
