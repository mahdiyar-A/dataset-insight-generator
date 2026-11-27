using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace backend.Application.Services;

/// <summary>
/// Counts page visits without cookies, as the Privacy Policy describes.
///
/// A visitor is told apart from another by their IP address and browser type
/// mixed with a random value made fresh each UTC day. Only the mixed result is
/// kept, only in memory, only for that day: tomorrow's value is new, so nobody,
/// the owner included, can follow a visitor from one day to the next or work
/// back to an IP. The database gets daily totals and nothing else.
///
/// One per server process (a singleton). A restart forgets today's visitors,
/// so a few may be counted twice that day.
/// </summary>
public sealed class VisitCounter
{
    // Far past any real day's traffic; past it, new visitors stop being told
    // apart rather than memory growing without end.
    private const int MaxSeen = 200_000;

    private readonly object _lock = new();
    private readonly Func<DateTime> _now;
    private DateOnly _day;
    private byte[] _salt = Array.Empty<byte>();
    private readonly HashSet<string> _seen = new();

    public VisitCounter(Func<DateTime>? now = null) => _now = now ?? (() => DateTime.UtcNow);

    /// <summary>
    /// Note one view. Returns the day it counts for, whether this visitor is
    /// new to this page today, and whether they are new to the site today.
    /// </summary>
    public (DateOnly Day, bool NewToPage, bool NewToSite) Note(string ip, string userAgent, string path)
    {
        lock (_lock)
        {
            var today = DateOnly.FromDateTime(_now());
            if (today != _day)
            {
                _day = today;
                _salt = RandomNumberGenerator.GetBytes(32);
                _seen.Clear();
            }
            var who = Hash(_salt, ip + "\n" + userAgent);
            bool newToSite = false, newToPage = false;
            if (_seen.Count < MaxSeen)
            {
                newToSite = _seen.Add(who);
                newToPage = _seen.Add(who + "|" + path);
            }
            return (today, newToPage, newToSite);
        }
    }

    private static string Hash(byte[] salt, string text)
    {
        using var hmac = new HMACSHA256(salt);
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(text)))[..32];
    }

    private static readonly Regex Bot = new(
        @"bot|crawl|spider|slurp|preview|fetch|monitor|uptime|curl|wget|python|httpclient|headless|lighthouse|scan",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>Known robots and scripts, which are not visitors.</summary>
    public static bool IsBot(string? userAgent) =>
        string.IsNullOrWhiteSpace(userAgent) || Bot.IsMatch(userAgent);

    // A path segment that is an id or a token: a workspace id, an invite token.
    private static readonly Regex IdLike = new(
        @"^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[A-Za-z0-9_\-]{24,}|\d+)$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>
    /// The page as it is stored: no query string or fragment, and every id or
    /// token replaced by ":id", so an invite link's token is never written down.
    /// Null for anything that is not a page path, or a page not worth counting.
    /// </summary>
    public static string? PagePath(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw[0] != '/' || raw.Length > 300) return null;
        var path = raw.Split('?', '#')[0].TrimEnd('/');
        if (path.Length == 0) return "/";
        var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => IdLike.IsMatch(p) ? ":id" : p.ToLowerInvariant())
            .Take(4)
            .ToList();
        if (parts.Count == 0) return "/";
        if (parts[0] is "admin" or "api" or "_next" or "auth") return null;
        if (parts.Any(p => !Regex.IsMatch(p, @"^[a-z0-9\-_.:]{1,60}$"))) return null;
        return "/" + string.Join('/', parts);
    }

    /// <summary>
    /// The other site a visitor came from, as its host name, or "" when they
    /// came from DIG itself, typed the address, or the referrer is unreadable.
    /// </summary>
    public static string Source(string? referrer, IEnumerable<string> ownHosts)
    {
        if (string.IsNullOrWhiteSpace(referrer) || !Uri.TryCreate(referrer, UriKind.Absolute, out var uri))
            return "";
        if (uri.Scheme is not ("http" or "https")) return "";
        var host = uri.Host.ToLowerInvariant();
        if (host.StartsWith("www.")) host = host[4..];
        if (host == "localhost" || ownHosts.Any(h => host == h || host.EndsWith("." + h))) return "";
        return host.Length <= 100 ? host : "";
    }
}
