using System.Text.Json;
using backend.Application.Interfaces;

namespace backend.Application.Services;

/// <summary>
/// What a saved report tells DIG about which findings people keep.
///
/// Each insight in a report document carries the kind of finding it rests on
/// ("kind": "trend", "group_difference", ...), put there by the AI service.
/// A report written counts one "shown" per insight; a save that deletes an
/// insight counts one "removed", one that changes its title or text one
/// "rewritten". Only these counts are kept, per kind of data ("domain"), with
/// nothing about the person or the file. The AI service turns them into small
/// weights for which findings a report leads with (ai_engine/llm/feedback.py).
/// </summary>
public static class FindingFeedback
{
    public sealed record Counts(string Domain, Dictionary<string, (int Shown, int Removed, int Rewritten)> ByKind);

    private sealed record Insight(string Id, string Kind, string Title, string Body);

    private static List<Insight> InsightsOf(JsonElement doc) =>
        doc.ValueKind == JsonValueKind.Object && doc.TryGetProperty("insights", out var list)
                                              && list.ValueKind == JsonValueKind.Array
            ? list.EnumerateArray()
                  .Where(i => i.ValueKind == JsonValueKind.Object)
                  .Select(i => new Insight(Str(i, "id"), Str(i, "kind"), Str(i, "title"), Str(i, "body")))
                  .Where(i => i.Id.Length > 0)
                  .ToList()
            : new List<Insight>();

    private static string Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";

    /// <summary>The kind of data the report is about: facts.domain.domain, or "general".</summary>
    public static string DomainOf(JsonElement doc)
    {
        if (doc.ValueKind == JsonValueKind.Object
            && doc.TryGetProperty("facts", out var facts) && facts.ValueKind == JsonValueKind.Object
            && facts.TryGetProperty("domain", out var d) && d.ValueKind == JsonValueKind.Object
            && Str(d, "domain") is { Length: > 0 } name)
            return name.Trim().ToLowerInvariant();
        return "general";
    }

    /// <summary>One "shown" per insight a report was written with.</summary>
    public static Counts Written(string documentJson)
    {
        using var doc = JsonDocument.Parse(documentJson);
        var counts = new Dictionary<string, (int, int, int)>();
        foreach (var i in InsightsOf(doc.RootElement).Where(i => i.Kind.Length > 0))
        {
            var (s, r, w) = counts.GetValueOrDefault(i.Kind);
            counts[i.Kind] = (s + 1, r, w);
        }
        return new Counts(DomainOf(doc.RootElement), counts);
    }

    /// <summary>The insights a save deleted or rewrote, by kind. Added insights count nothing.</summary>
    public static Counts Edited(string beforeJson, string afterJson)
    {
        using var before = JsonDocument.Parse(beforeJson);
        using var after  = JsonDocument.Parse(afterJson);
        var now = InsightsOf(after.RootElement).ToDictionary(i => i.Id);
        var counts = new Dictionary<string, (int, int, int)>();
        foreach (var was in InsightsOf(before.RootElement).Where(i => i.Kind.Length > 0))
        {
            var (s, r, w) = counts.GetValueOrDefault(was.Kind);
            if (!now.TryGetValue(was.Id, out var still))
                counts[was.Kind] = (s, r + 1, w);
            else if (still.Title != was.Title || still.Body != was.Body)
                counts[was.Kind] = (s, r, w + 1);
        }
        return new Counts(DomainOf(before.RootElement), counts);
    }

    /// <summary>Store the counts. Never throws: a count is not worth a failed save.</summary>
    public static void Store(IActivityLog? log, Func<Counts> counts, ILogger logger)
    {
        if (log == null) return;
        try
        {
            var c = counts();
            foreach (var (kind, (shown, removed, rewritten)) in c.ByKind)
                log.CountFindings(c.Domain, kind, shown, removed, rewritten);
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or KeyNotFoundException
                                       or ArgumentException)
        {
            logger.LogDebug("[Feedback] Not counted ({Type}: {Msg})", ex.GetType().Name, ex.Message);
        }
    }

    /// <summary>The counts as the AI service reads them (finding_feedback_json).</summary>
    public static string ToJson(IEnumerable<FindingFeedbackRow> rows) =>
        JsonSerializer.Serialize(rows.Select(r => new
        {
            domain = r.Domain, kind = r.Kind, shown = r.Shown, removed = r.Removed, rewritten = r.Rewritten,
        }));
}
