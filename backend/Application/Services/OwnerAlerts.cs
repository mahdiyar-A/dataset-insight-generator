using backend.Application.Interfaces;

namespace backend.Application.Services;

/// <summary>
/// Emails the person who runs DIG when something needs them.
///
/// DIG had no way to say anything was wrong. A model withdrawn by its provider,
/// a free allowance used up, a day of reports written without AI: each was a
/// line in a log nobody reads until a visitor complains.
///
/// Two limits, because an alarm that floods is switched off. The same alert is
/// not repeated inside its quiet period, and no more than MaxPerDay go out in a
/// day whatever happens. They share the address and the sending allowance that
/// sign-up and password emails need.
///
/// In memory, like the other daily counters here: a restart forgets what was
/// sent, so a problem that is still there is reported once more after a deploy.
/// </summary>
public sealed class OwnerAlerts
{
    public const int MaxPerDay = 6;
    public static readonly TimeSpan DefaultQuiet = TimeSpan.FromHours(24);

    private readonly IServiceScopeFactory  _scopes;
    private readonly ILogger<OwnerAlerts>  _logger;
    private readonly TimeProvider          _time;
    private readonly string                _recipient;
    private readonly bool                  _enabled;

    private readonly object _lock = new();
    private readonly Dictionary<string, DateTimeOffset> _lastSent = new();
    private DateOnly _day;
    private int      _sentToday;

    public OwnerAlerts(
        IServiceScopeFactory scopes, ILogger<OwnerAlerts> logger,
        string recipient, bool enabled = true, TimeProvider? time = null)
    {
        _scopes    = scopes;
        _logger    = logger;
        _recipient = recipient;
        _enabled   = enabled;
        _time      = time ?? TimeProvider.System;
        _day       = Today();
    }

    private DateOnly Today() => DateOnly.FromDateTime(_time.GetUtcNow().UtcDateTime);

    /// <summary>The inbox alerts go to.</summary>
    public string Recipient => _recipient;

    /// <summary>False on a developer's machine, where nothing is sent.</summary>
    public bool Enabled => _enabled;

    /// <summary>
    /// Send one alert, unless the same one went out recently or today's limit is
    /// reached. <paramref name="key"/> says what "the same one" means. Never
    /// throws: an alarm that fails must not fail what raised it. True when an
    /// email went out.
    /// </summary>
    public async Task<bool> RaiseAsync(string key, string subject, IReadOnlyList<string> lines, TimeSpan? quietFor = null)
    {
        if (!_enabled)
        {
            _logger.LogInformation("[Alerts] (switched off) {Subject}", subject);
            return false;
        }

        var now = _time.GetUtcNow();
        lock (_lock)
        {
            if (Today() != _day) { _day = Today(); _sentToday = 0; }

            if (_lastSent.TryGetValue(key, out var last) && now - last < (quietFor ?? DefaultQuiet))
                return false;
            if (_sentToday >= MaxPerDay)
            {
                _logger.LogWarning("[Alerts] Daily limit reached; not sent: {Subject}", subject);
                return false;
            }
            // Claimed before sending, so two things going wrong at once send one email.
            _lastSent[key] = now;
            _sentToday++;
        }

        try
        {
            using var scope = _scopes.CreateScope();
            var email = scope.ServiceProvider.GetRequiredService<IEmailService>();
            await email.SendOwnerAlertAsync(_recipient, subject, lines);
            _logger.LogWarning("[Alerts] Sent: {Subject}", subject);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Alerts] Could not send: {Subject}", subject);
            // Not sent, so not counted: the next time it happens is tried again.
            lock (_lock)
            {
                _lastSent.Remove(key);
                if (_sentToday > 0) _sentToday--;
            }
            return false;
        }
    }
}
