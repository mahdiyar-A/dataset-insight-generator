using backend.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace backend.Hubs;

/// <summary>
/// SignalR hub for real-time collaboration inside a shared workspace.
///
/// Clients connect to /hubs/collab?access_token={jwt} and then call
/// JoinWorkspace(workspaceId). All traffic is scoped to a SignalR group named by
/// the workspace id, so only members of that workspace receive updates.
///
/// Events sent to clients:
///   - Presence           { users: [{ userId, userName, color }] }  (to the joiner only)
///   - UserJoined         { userId, userName, color }
///   - UserLeft           { userId }
///   - CursorMoved        { userId, userName, color, fileType, x, y, page }
///   - AnnotationAdded    { annotation }
///   - AnnotationUpdated  { annotation }
///   - AnnotationResolved { annotationId }
///   - AnnotationDeleted  { annotationId }
///
/// Authorization
/// -------------
/// [Authorize] only proves the caller is signed in — it says nothing about which
/// workspace they may enter. Every method below re-checks team membership for the
/// workspace it touches. Without that check any authenticated user could call
/// JoinWorkspace with a guessed workspace id and receive every annotation
/// broadcast inside it: an IDOR that bypasses the checks WorkspaceController
/// performs on the REST side.
///
/// Group membership is not a substitute for the check either — a client can call
/// any hub method with any workspace id at any time, so the Broadcast* methods
/// verify too rather than trusting that the caller joined legitimately.
/// </summary>
[Authorize]
public class CollaborationHub : Hub
{
    private readonly IWorkspaceRepository _workspaces;
    private readonly ITeamRepository      _teams;
    private readonly ILogger<CollaborationHub> _logger;

    public CollaborationHub(
        IWorkspaceRepository workspaces,
        ITeamRepository      teams,
        ILogger<CollaborationHub> logger)
    {
        _workspaces = workspaces;
        _teams      = teams;
        _logger     = logger;
    }

    private record ConnectionInfo(string WorkspaceId, string UserId, string UserName, string Color);

    // connectionId → who and where. Static because the hub is transient per call.
    private static readonly ConcurrentDictionary<string, ConnectionInfo> _connections = new();

    // Authorized (userId, workspaceId) pairs, cached for the lifetime of the
    // process. Membership changes rarely and re-querying the database on every
    // cursor move would be untenable — cursor events fire at pointer-move rate.
    private static readonly ConcurrentDictionary<(string UserId, string WorkspaceId), bool> _membershipCache = new();

    private static readonly string[] Palette =
    {
        "#3b82f6", "#a855f7", "#10b981", "#f97316",
        "#ec4899", "#06b6d4", "#84cc16", "#f59e0b",
    };

    /// <summary>
    /// Stable per-user colour.
    ///
    /// string.GetHashCode() is randomised per process in .NET Core, so using it
    /// here gave a user a different colour after every restart and a different
    /// colour on each instance behind a load balancer — two people in the same
    /// workspace could see each other in different colours. MD5 of the id is
    /// stable across processes and machines. Not used for security, so a fast
    /// non-cryptographic-strength digest is fine.
    /// </summary>
    private static string ColorFor(string userId)
    {
        var hash = MD5.HashData(Encoding.UTF8.GetBytes(userId));
        return Palette[hash[0] % Palette.Length];
    }

    private string CurrentUserId() =>
        Context.User?.FindFirstValue("sub")
        ?? Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new HubException("Not authenticated");

    private string CurrentUserName() =>
        Context.User?.FindFirstValue(ClaimTypes.Name)
        ?? Context.User?.FindFirstValue("email")
        ?? Context.User?.FindFirstValue(ClaimTypes.Email)
        ?? "Unknown";

    /// <summary>
    /// Verify the caller is a member of the workspace's team.
    /// Throws HubException — SignalR surfaces this to the caller and aborts the
    /// invocation, so callers never proceed on a failed check.
    /// </summary>
    private async Task AssertMemberAsync(string workspaceId)
    {
        var userId = CurrentUserId();
        var key = (userId, workspaceId);

        if (_membershipCache.TryGetValue(key, out var allowed))
        {
            if (!allowed) throw new HubException("Not a member of this workspace");
            return;
        }

        if (!Guid.TryParse(workspaceId, out var wsGuid) || !Guid.TryParse(userId, out var userGuid))
            throw new HubException("Invalid workspace or user id");

        var workspace = await _workspaces.GetWorkspaceAsync(wsGuid);
        var isMember = workspace != null && await _teams.IsMemberAsync(workspace.TeamId, userGuid);

        // Negative results are cached too, so a probing client cannot force a
        // database round-trip per attempt.
        _membershipCache[key] = isMember;

        if (!isMember)
        {
            _logger.LogWarning(
                "[Collab] User {UserId} denied access to workspace {WorkspaceId}",
                userId, workspaceId);
            throw new HubException("Not a member of this workspace");
        }
    }

    // ── Presence ─────────────────────────────────────────────────────────────

    public async Task JoinWorkspace(string workspaceId)
    {
        await AssertMemberAsync(workspaceId);

        var userId   = CurrentUserId();
        var userName = CurrentUserName();
        var color    = ColorFor(userId);

        // Snapshot the existing roster BEFORE registering this connection,
        // otherwise the joiner appears in their own presence list.
        //
        // Without this the second person to join saw an empty list: UserJoined
        // only fires for people who arrive after you, so whoever was already in
        // the room was invisible until they happened to reconnect.
        var existing = _connections.Values
            .Where(c => c.WorkspaceId == workspaceId && c.UserId != userId)
            .GroupBy(c => c.UserId)                 // one entry per user, not per tab
            .Select(g => new { userId = g.Key, userName = g.First().UserName, color = g.First().Color })
            .ToList();

        // Did this user already have another tab open in this workspace?
        var alreadyPresent = _connections.Values
            .Any(c => c.WorkspaceId == workspaceId && c.UserId == userId);

        _connections[Context.ConnectionId] = new ConnectionInfo(workspaceId, userId, userName, color);
        await Groups.AddToGroupAsync(Context.ConnectionId, workspaceId);

        await Clients.Caller.SendAsync("Presence", new { users = existing });

        // Suppress the join broadcast for a second tab — otherwise collaborators
        // see the same person "join" repeatedly.
        if (!alreadyPresent)
            await Clients.OthersInGroup(workspaceId)
                .SendAsync("UserJoined", new { userId, userName, color });
    }

    public async Task LeaveWorkspace(string workspaceId)
    {
        if (_connections.TryRemove(Context.ConnectionId, out var info))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, workspaceId);
            await NotifyLeftIfLastConnectionAsync(info);
        }
    }

    // ── Cursors ──────────────────────────────────────────────────────────────

    public async Task MoveCursor(string workspaceId, string fileType,
        double x, double y, int page = 1)
    {
        // Served from the membership cache after the first call, so this stays
        // cheap at pointer-move frequency.
        await AssertMemberAsync(workspaceId);

        var userId = CurrentUserId();

        await Clients.OthersInGroup(workspaceId).SendAsync("CursorMoved", new
        {
            userId,
            userName = CurrentUserName(),
            color    = ColorFor(userId),
            fileType, x, y, page,
        });
    }

    // ── Annotations ──────────────────────────────────────────────────────────
    //
    // These relay a payload the client already persisted through the REST API.
    // The membership check matters: without it a non-member could inject
    // arbitrary annotation objects into a workspace's live feed. They would not
    // survive a page refresh (nothing is written to the database) but every
    // collaborator would see them until then.

    public async Task BroadcastAnnotation(string workspaceId, object annotation)
    {
        await AssertMemberAsync(workspaceId);
        await Clients.OthersInGroup(workspaceId).SendAsync("AnnotationAdded", annotation);
    }

    public async Task BroadcastAnnotationEdit(string workspaceId, object annotation)
    {
        await AssertMemberAsync(workspaceId);
        await Clients.OthersInGroup(workspaceId).SendAsync("AnnotationUpdated", annotation);
    }

    public async Task BroadcastAnnotationResolved(string workspaceId, string annotationId)
    {
        await AssertMemberAsync(workspaceId);
        await Clients.OthersInGroup(workspaceId).SendAsync("AnnotationResolved", annotationId);
    }

    public async Task BroadcastAnnotationDeleted(string workspaceId, string annotationId)
    {
        await AssertMemberAsync(workspaceId);
        await Clients.OthersInGroup(workspaceId).SendAsync("AnnotationDeleted", annotationId);
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (_connections.TryRemove(Context.ConnectionId, out var info))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, info.WorkspaceId);
            await NotifyLeftIfLastConnectionAsync(info);
        }
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Announce UserLeft only when the user has no other connection to the
    /// workspace. Closing one of two open tabs previously removed the user from
    /// everyone else's presence list while they were still there.
    /// </summary>
    private async Task NotifyLeftIfLastConnectionAsync(ConnectionInfo info)
    {
        var stillConnected = _connections.Values
            .Any(c => c.WorkspaceId == info.WorkspaceId && c.UserId == info.UserId);

        if (!stillConnected)
            await Clients.Group(info.WorkspaceId).SendAsync("UserLeft", new { userId = info.UserId });
    }
}
