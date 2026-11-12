using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using backend.Application.Interfaces;

namespace backend.Application.Services;

/// <summary>
/// Every few hours, asks the AI service whether the models DIG depends on are
/// still offered and how the last day went, and emails the owner anything wrong.
///
/// Every model is a free endpoint somebody else runs, and they are withdrawn
/// without notice to us. The chain copes by moving to the next model, which is
/// why nobody would know: it only gets shorter. The check itself is in the AI
/// service (llm/model_watch.py) and costs nothing; this is the clock and the
/// email. The sentences in the email are written there, in plain words.
///
/// Checked four times a day, emailed about once: a free allowance used up at
/// two in the afternoon is back by midnight, and a check that only ran each
/// morning would never see it. The same trouble is not emailed again inside
/// the quiet period, whatever the counts in it have moved to.
/// </summary>
public sealed class ModelWatch : BackgroundService
{
    /// <summary>Long enough after a deploy for the AI service to be up.</summary>
    public static readonly TimeSpan FirstCheckAfter = TimeSpan.FromMinutes(3);
    public static readonly TimeSpan Every           = TimeSpan.FromHours(6);

    /// <summary>How long the same trouble stays unrepeated: a little under a day.</summary>
    public static readonly TimeSpan Quiet = TimeSpan.FromHours(20);

    private readonly IServiceScopeFactory _scopes;
    private readonly OwnerAlerts          _alerts;
    private readonly ILogger<ModelWatch>  _logger;
    private readonly TimeProvider         _time;

    public ModelWatch(IServiceScopeFactory scopes, OwnerAlerts alerts, ILogger<ModelWatch> logger, TimeProvider? time = null)
    {
        _scopes = scopes;
        _alerts = alerts;
        _logger = logger;
        _time   = time ?? TimeProvider.System;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(FirstCheckAfter, _time, stoppingToken);
            while (!stoppingToken.IsCancellationRequested)
            {
                await CheckOnceAsync();
                await Task.Delay(Every, _time, stoppingToken);
            }
        }
        catch (OperationCanceledException) { /* shutting down */ }
    }

    /// <summary>One check. True when it emailed the owner. Never throws.</summary>
    public async Task<bool> CheckOnceAsync()
    {
        string raw;
        try
        {
            using var scope = _scopes.CreateScope();
            raw = await scope.ServiceProvider.GetRequiredService<IPythonAiClient>().ModelStatusAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[ModelWatch] The AI service did not answer the daily check");
            return await _alerts.RaiseAsync("ai-service-unreachable",
                "DIG: the AI service is not answering",
                new[]
                {
                    "The daily model check could not reach DIG's AI service.",
                    "Until it is back, uploads cannot be checked and no report or answer can be written.",
                },
                Quiet);
        }

        try
        {
            var (problems, notes, allowance) = Read(raw);
            if (problems.Count == 0)
            {
                _logger.LogInformation("[ModelWatch] Daily check: nothing wrong. {Allowance}", allowance);
                return false;
            }

            var lines = new List<string>(problems);
            lines.AddRange(notes);
            if (allowance.Length > 0) lines.Add(allowance);
            lines.Add("The site keeps working on whichever models are left. This is sent about once a day while it lasts.");

            var subject = problems.Count == 1
                ? "DIG: one thing about the AI models needs a look"
                : $"DIG: {problems.Count} things about the AI models need a look";
            return await _alerts.RaiseAsync("models:" + Fingerprint(problems), subject, lines, Quiet);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[ModelWatch] Could not read the AI service's answer");
            return false;
        }
    }

    /// <summary>The sentences to send, and a line about today's free allowance when it is known.</summary>
    internal static (List<string> Problems, List<string> Notes, string Allowance) Read(string raw)
    {
        using var doc = JsonDocument.Parse(raw);
        var root = doc.RootElement;

        static List<string> Sentences(JsonElement root, string name) =>
            root.TryGetProperty(name, out var list) && list.ValueKind == JsonValueKind.Array
                ? list.EnumerateArray()
                      .Where(s => s.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(s.GetString()))
                      .Select(s => s.GetString()!).Take(20).ToList()
                : new List<string>();

        var allowance = "";
        if (root.TryGetProperty("allowance", out var a) && a.ValueKind == JsonValueKind.Object
            && a.TryGetProperty("openrouter", out var or) && or.ValueKind == JsonValueKind.Object
            && or.TryGetProperty("used", out var used) && or.TryGetProperty("limit", out var limit)
            && used.TryGetInt32(out var u) && limit.TryGetInt32(out var l))
            allowance = $"Free OpenRouter requests used today: {u} of {l}.";

        return (Sentences(root, "problems"), Sentences(root, "notes"), allowance);
    }

    /// <summary>
    /// The same problems give the same value, in any order, so they are one
    /// alert. Figures are left out: "2 reports out of 9" and, six hours on,
    /// "3 reports out of 11" are the same trouble and not a second email.
    /// </summary>
    private static string Fingerprint(IEnumerable<string> problems)
    {
        var joined = string.Join("\n", problems
            .Select(p => new string(p.Where(c => !char.IsDigit(c)).ToArray()))
            .OrderBy(p => p, StringComparer.Ordinal));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(joined)))[..16];
    }
}
