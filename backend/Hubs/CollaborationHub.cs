using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace backend.Hubs;

/// <summary>
/// SignalR hub for real-time collaboration inside a shared workspace.
///
/// Clients connect to /hubs/collab?workspaceId={id}
/// All messages within a workspace are scoped to a SignalR group named
/// by the workspaceId, so only users in that workspace receive updates.
///
/// Events the hub sends to clients:
///   - UserJoined     { userId, userName, color }
///   - UserLeft       { userId }
///   - CursorMoved    { userId, fileType, x, y, page }
///   - AnnotationAdded    { annotation }
///   - AnnotationUpdated  { annotation }
///   - AnnotationResolved { annotationId }
///   - AnnotationDeleted  { annotationId }
/// </summary>
[Authorize]
public class CollaborationHub : Hub
{
    // Maps connectionId → { workspaceId, userId, userName }
    // Used to clean up presence on disconnect
    private static readonly System.Collections.Concurrent.ConcurrentDictionary
        <string, (string WorkspaceId, string UserId, string UserName)> _connections = new();

    // One consistent colour per user derived from userId hash
    // so the same user always appears in the same colour across sessions
    private static readonly string[] _palette =
    {
        "#3b82f6", "#a855f7", "#10b981", "#f97316",
        "#ec4899", "#06b6d4", "#84cc16", "#f59e0b",
    };

    // Called by the frontend after SignalR connects, passing the workspaceId
    public async Task JoinWorkspace(string workspaceId)
    {
        var userId   = Context.User?.FindFirstValue("sub")
                    ?? Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? "anonymous";
        var userName = Context.User?.FindFirstValue("email")
                    ?? Context.User?.FindFirstValue(ClaimTypes.Email)
                    ?? "Unknown";

        var color = _palette[Math.Abs(userId.GetHashCode()) % _palette.Length];

        _connections[Context.ConnectionId] = (workspaceId, userId, userName);

        // Add this connection to the workspace group
        await Groups.AddToGroupAsync(Context.ConnectionId, workspaceId);

        // Tell everyone else in the workspace that this user has joined
        await Clients.OthersInGroup(workspaceId).SendAsync("UserJoined", new
        {
            userId,
            userName,
            color,
        });
    }

    // Called when the user moves their cursor over a file preview
    public async Task MoveCursor(string workspaceId, string fileType,
        double x, double y, int page = 1)
    {
        var userId = Context.User?.FindFirstValue("sub") ?? "anonymous";
        var color  = _palette[Math.Abs(userId.GetHashCode()) % _palette.Length];

        await Clients.OthersInGroup(workspaceId).SendAsync("CursorMoved", new
        {
            userId, fileType, x, y, page, color,
        });
    }

    // Called when a new annotation is added so all collaborators see it instantly
    public async Task BroadcastAnnotation(string workspaceId, object annotation) =>
        await Clients.OthersInGroup(workspaceId).SendAsync("AnnotationAdded", annotation);

    // Called when an annotation is edited
    public async Task BroadcastAnnotationEdit(string workspaceId, object annotation) =>
        await Clients.OthersInGroup(workspaceId).SendAsync("AnnotationUpdated", annotation);

    // Called when an annotation is resolved or deleted
    public async Task BroadcastAnnotationResolved(string workspaceId, string annotationId) =>
        await Clients.OthersInGroup(workspaceId).SendAsync("AnnotationResolved", annotationId);

    public async Task BroadcastAnnotationDeleted(string workspaceId, string annotationId) =>
        await Clients.OthersInGroup(workspaceId).SendAsync("AnnotationDeleted", annotationId);

    // Called automatically by SignalR when a connection drops
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (_connections.TryRemove(Context.ConnectionId, out var info))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, info.WorkspaceId);
            await Clients.Group(info.WorkspaceId).SendAsync("UserLeft", new { info.UserId });
        }
        await base.OnDisconnectedAsync(exception);
    }
}
