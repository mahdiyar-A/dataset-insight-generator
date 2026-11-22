namespace backend.Application.Services;

/// <summary>
/// Limits for <see cref="AnalysisGate"/>. Bound from the "AnalysisLimits" config
/// section, so tests and operators can change them without a code change.
/// </summary>
public sealed class AnalysisLimits
{
    /// <summary>
    /// Analyses running at the same moment. The server has 2 GB of RAM and a
    /// pandas pass over a 50 MB upload can use most of a gigabyte, so a third
    /// concurrent run risks the kernel killing the AI service mid-analysis —
    /// taking every in-flight analysis down with it.
    /// </summary>
    public int MaxConcurrent { get; set; } = 2;

    /// <summary>Admitted analyses allowed to wait for a free slot.</summary>
    public int MaxQueued { get; set; } = 8;

    /// <summary>Fair-use ceiling for Pro users per UTC day.</summary>
    public int ProPerDay { get; set; } = 20;
}

public enum CallerKind { Free, Pro, Admin }

/// <summary>Who wants to run an analysis. Key identifies them for the "one at a time" rule.</summary>
public sealed record AnalysisCaller(string Key, CallerKind Kind)
{
    public static AnalysisCaller ForUser(Guid userId, string? plan) => new(
        $"user:{userId}",
        plan switch { "admin" => CallerKind.Admin, "pro" => CallerKind.Pro, _ => CallerKind.Free });

}

/// <summary>Outcome of asking to run an analysis. Message is written for end users.</summary>
public sealed record Admission(bool Allowed, string Code, string Message)
{
    public static readonly Admission Ok = new(true, "OK", "");

    /// <summary>The run this admitted, so the page can follow it.</summary>
    public Guid? AnalysisId { get; init; }
}

/// <summary>
/// Admission control for analyses: one per caller at a time, a cap on how many
/// run and wait at once, and a daily allowance for Pro users. Every analysis
/// competes for the same RAM and the same AI quotas.
///
/// State is in memory and resets when the process restarts. That is acceptable
/// for what it protects — capacity right now and fair use within a day — and
/// it is deliberately not where the free plan's 2-per-48-hours quota lives:
/// that is persisted on the user row, because a restart must not refill it.
/// </summary>
public sealed class AnalysisGate
{
    private readonly AnalysisLimits _limits;
    private readonly TimeProvider   _time;
    private readonly SemaphoreSlim  _slots;
    private readonly object         _lock = new();

    // Admitted and not yet finished — running or waiting for a slot.
    private readonly HashSet<string> _active = new();

    // Per-UTC-day counters; cleared when the day changes.
    private DateOnly _day;
    private readonly Dictionary<string, int> _today = new();

    public AnalysisGate(AnalysisLimits limits, TimeProvider? time = null)
    {
        _limits = limits;
        _time   = time ?? TimeProvider.System;
        _slots  = new SemaphoreSlim(Math.Max(1, limits.MaxConcurrent));
        _day    = Today();
    }

    /// <summary>Analyses admitted and not yet finished. For the admin health view.</summary>
    public int InFlight { get { lock (_lock) return _active.Count; } }

    /// <summary>
    /// Would this caller be admitted right now? Changes nothing — use it to
    /// refuse early, before spending a quality check on an analysis that could
    /// not start anyway.
    /// </summary>
    public Admission Check(AnalysisCaller caller)
    {
        lock (_lock) return Evaluate(caller);
    }

    /// <summary>
    /// Admit the caller, or explain why not. On success the caller holds a
    /// place until <see cref="RunAsync"/> finishes, and the day's allowance is
    /// spent at this point — so starting and abandoning still counts.
    /// </summary>
    public Admission TryAdmit(AnalysisCaller caller)
    {
        lock (_lock)
        {
            var verdict = Evaluate(caller);
            if (!verdict.Allowed) return verdict;

            _active.Add(caller.Key);
            if (caller.Kind == CallerKind.Pro) Bump(caller.Key);
            return Admission.Ok;
        }
    }

    /// <summary>
    /// Run an admitted analysis once a slot is free, then release both the slot
    /// and the caller's place — whatever <paramref name="work"/> does, including
    /// throwing.
    /// </summary>
    public async Task RunAsync(AnalysisCaller caller, Func<Task> work)
    {
        try
        {
            await _slots.WaitAsync();
            try { await work(); }
            finally { _slots.Release(); }
        }
        finally
        {
            lock (_lock) _active.Remove(caller.Key);
        }
    }

    // ── Rules ─────────────────────────────────────────────────────────────────

    private Admission Evaluate(AnalysisCaller caller)
    {
        RollDay();

        if (_active.Contains(caller.Key))
            return new(false, "ALREADY_RUNNING",
                "You already have an analysis running. Please wait for it to finish before starting another.");

        if (_active.Count >= _limits.MaxConcurrent + _limits.MaxQueued)
            return new(false, "BUSY",
                "The server is busy with other analyses right now. Please try again in a few minutes.");

        if (caller.Kind == CallerKind.Pro && Count(caller.Key) >= _limits.ProPerDay)
            return new(false, "PRO_DAILY_LIMIT",
                $"You've reached today's fair-use limit of {_limits.ProPerDay} analyses. " +
                "It resets at midnight UTC.");

        return Admission.Ok;
    }

    private DateOnly Today() => DateOnly.FromDateTime(_time.GetUtcNow().UtcDateTime);

    private void RollDay()
    {
        var today = Today();
        if (today == _day) return;
        _day = today;
        _today.Clear();
    }

    private int Count(string key) => _today.TryGetValue(key, out var n) ? n : 0;

    private void Bump(string key) => _today[key] = Count(key) + 1;
}
