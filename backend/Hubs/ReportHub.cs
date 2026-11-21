using backend.Application.Interfaces;
using backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using System.Security.Claims;

namespace backend.Hubs;

/// <summary>
/// The live channel for a report open in the editor, on the dashboard or on a
/// team page. Clients connect to /hubs/report?access_token={jwt} and call
/// WatchReport(analysisId); they then receive
///
///   ReportSaved          { analysisId, version, savedBy, savedByName }
///   ReportAccessRemoved  { analysisId }
///
/// Watching is checked like reading the report (ReportAccess). What is sent
/// carries no words of the report: the page fetches the new version over the
/// REST route, which checks again.
/// </summary>
[Authorize]
public class ReportHub : Hub
{
    private readonly ReportAccess _access;

    public ReportHub(ReportAccess access) => _access = access;

    public static string Group(Guid analysisId) => "report:" + analysisId.ToString("D");

    private sealed record Watcher(Guid UserId, ConcurrentDictionary<Guid, byte> Reports);

    // connectionId → who and which reports. Static because the hub is transient per call.
    private static readonly ConcurrentDictionary<string, Watcher> Watchers = new();

    private Guid CurrentUserId()
    {
        var claim = Context.User?.FindFirstValue("sub") ?? Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(claim, out var id) ? id : throw new HubException("Not signed in");
    }

    /// <summary>Start receiving saves of this report. Returns whether this person may edit it.</summary>
    public async Task<bool> WatchReport(string analysisId)
    {
        if (!Guid.TryParse(analysisId, out var id)) throw new HubException("No such report");
        var userId = CurrentUserId();

        var (analysis, role) = await _access.ForAsync(userId, id);
        if (analysis == null || role == ReportRole.None) throw new HubException("No such report");

        var watcher = Watchers.GetOrAdd(Context.ConnectionId, _ => new Watcher(userId, new()));
        watcher.Reports[id] = 0;
        await Groups.AddToGroupAsync(Context.ConnectionId, Group(id));
        return role == ReportRole.Edit;
    }

    public async Task UnwatchReport(string analysisId)
    {
        if (!Guid.TryParse(analysisId, out var id)) return;
        if (Watchers.TryGetValue(Context.ConnectionId, out var watcher)) watcher.Reports.TryRemove(id, out _);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, Group(id));
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Watchers.TryRemove(Context.ConnectionId, out _);
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>The reports this user has open right now, on any connection.</summary>
    public static IReadOnlyCollection<Guid> Watching(Guid userId) =>
        Watchers.Values.Where(w => w.UserId == userId).SelectMany(w => w.Reports.Keys).Distinct().ToList();

    /// <summary>Stop sending this user what happens to these reports, and tell their pages so.</summary>
    public static async Task StopWatchingAsync(IHubContext<ReportHub> hub, Guid userId, IEnumerable<Guid> analysisIds)
    {
        var reports = analysisIds.ToHashSet();
        foreach (var (connectionId, watcher) in Watchers.Where(w => w.Value.UserId == userId).ToList())
        {
            foreach (var id in watcher.Reports.Keys.Where(reports.Contains).ToList())
            {
                watcher.Reports.TryRemove(id, out _);
                await hub.Groups.RemoveFromGroupAsync(connectionId, Group(id));
                await hub.Clients.Client(connectionId).SendAsync("ReportAccessRemoved", new { analysisId = id });
            }
        }
    }
}

public class ReportLive : IReportLive
{
    private readonly IHubContext<ReportHub> _hub;

    public ReportLive(IHubContext<ReportHub> hub) => _hub = hub;

    public Task SavedAsync(Guid analysisId, int version, Guid savedBy, string? savedByName) =>
        _hub.Clients.Group(ReportHub.Group(analysisId)).SendAsync("ReportSaved", new
        {
            analysisId,
            version,
            savedBy,
            savedByName,
        });
}
