namespace backend.Application.Services;

/// <summary>
/// Daily allowances for the chat. Bound from the "ChatLimits" config section.
///
/// The chat runs on the same free AI quotas as the report writer, shared by
/// every user of the site, so questions are metered per user per UTC day.
/// </summary>
public sealed class ChatLimits
{
    /// <summary>Questions about finished analyses, per free user per day.</summary>
    public int FreeQuestionsPerDay { get; set; } = 10;

    /// <summary>Questions per Pro user per day: generous, but not unlimited.</summary>
    public int ProQuestionsPerDay { get; set; } = 100;

    /// <summary>Report descriptions turned into settings, per Pro user per day.</summary>
    public int BriefsPerDay { get; set; } = 30;

    public int QuestionsPerDay(string? plan) => plan is "pro" or "admin" ? ProQuestionsPerDay : FreeQuestionsPerDay;
}

/// <summary>
/// Counts chat use per key per UTC day.
///
/// In memory, like AnalysisGate's daily counters: a restart refills the day's
/// allowance, which is acceptable for fair use of free model quotas. It is not
/// a billing record.
/// </summary>
public sealed class ChatQuota
{
    private readonly TimeProvider _time;
    private readonly object _lock = new();
    private readonly Dictionary<string, int> _today = new();
    private DateOnly _day;

    public ChatQuota(TimeProvider? time = null)
    {
        _time = time ?? TimeProvider.System;
        _day  = Today();
    }

    /// <summary>Use one of today's allowance for key. Returns false, using nothing, when it is spent.</summary>
    public bool TryTake(string key, int limit, out int remaining)
    {
        lock (_lock)
        {
            Roll();
            _today.TryGetValue(key, out var used);
            if (used >= limit)
            {
                remaining = 0;
                return false;
            }
            _today[key] = used + 1;
            remaining = limit - used - 1;
            return true;
        }
    }

    /// <summary>Give back one use, for a request that failed on our side.</summary>
    public void Refund(string key)
    {
        lock (_lock)
        {
            Roll();
            if (_today.TryGetValue(key, out var used) && used > 0) _today[key] = used - 1;
        }
    }

    public int Remaining(string key, int limit)
    {
        lock (_lock)
        {
            Roll();
            _today.TryGetValue(key, out var used);
            return Math.Max(0, limit - used);
        }
    }

    private DateOnly Today() => DateOnly.FromDateTime(_time.GetUtcNow().UtcDateTime);

    private void Roll()
    {
        var today = Today();
        if (today == _day) return;
        _day = today;
        _today.Clear();
    }
}
