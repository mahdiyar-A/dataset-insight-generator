using System.Collections.Concurrent;

namespace backend.Application.Services;

/// <summary>
/// A suggestion from the chat, kept on the server until its owner applies it.
///
/// ChangesJson is the list of changes the AI service checked, without their
/// pictures; Pictures maps a change's position to the chart DIG drew for it.
/// BaseVersion is the version the changes were made to: applying them to any
/// other is refused as "changed since".
/// </summary>
public sealed record ReportProposal(
    Guid UserId, Guid AnalysisId, int BaseVersion, string ChangesJson,
    IReadOnlyDictionary<int, byte[]> Pictures, DateTime ExpiresAt);

/// <summary>
/// Suggestions waiting to be applied, by id, in memory.
///
/// The page is sent an id and a preview, never the changes themselves, so
/// what is applied is exactly what the AI service checked: a page cannot send
/// back changes of its own. A restart forgets them all, which costs the owner
/// one "ask again".
/// </summary>
public class ReportProposals
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(1);

    /// <summary>Kept per person, newest first. Each can carry chart pictures.</summary>
    public const int KeepPerPerson = 10;

    private readonly ConcurrentDictionary<Guid, ReportProposal> _items = new();
    private readonly Func<DateTime> _now;

    public ReportProposals(Func<DateTime>? now = null) => _now = now ?? (() => DateTime.UtcNow);

    public int Count => _items.Count;

    public Guid Add(Guid userId, Guid analysisId, int baseVersion, string changesJson,
                    IReadOnlyDictionary<int, byte[]> pictures)
    {
        var now = _now();
        foreach (var (key, old) in _items)
            if (old.ExpiresAt <= now) _items.TryRemove(key, out _);

        foreach (var key in _items.Where(e => e.Value.UserId == userId)
                                  .OrderByDescending(e => e.Value.ExpiresAt)
                                  .Skip(KeepPerPerson - 1)
                                  .Select(e => e.Key)
                                  .ToList())
            _items.TryRemove(key, out _);

        var id = Guid.NewGuid();
        _items[id] = new ReportProposal(userId, analysisId, baseVersion, changesJson, pictures, now + Lifetime);
        return id;
    }

    /// <summary>The suggestion, if it is this person's, for this analysis, and not expired.</summary>
    public ReportProposal? Find(Guid id, Guid userId, Guid analysisId)
    {
        if (!_items.TryGetValue(id, out var p)) return null;
        if (p.ExpiresAt <= _now())
        {
            _items.TryRemove(id, out _);
            return null;
        }
        return p.UserId == userId && p.AnalysisId == analysisId ? p : null;
    }

    public void Remove(Guid id) => _items.TryRemove(id, out _);
}
