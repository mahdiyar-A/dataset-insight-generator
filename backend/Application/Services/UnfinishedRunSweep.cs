using backend.Application.Interfaces;

namespace backend.Application.Services;

/// <summary>
/// Ends the runs a restart cut off.
///
/// A run lives in this process, so a deploy or crash ends it with its row still
/// saying "processing", and nothing would ever change that. The person's page
/// would keep waiting, and the run would never reach their history. No run
/// survives a restart on this single server, so at startup every run older than
/// the process is over. Only rows from before startup are touched, so a sweep
/// that finishes late cannot fail a run that has just begun.
/// </summary>
public sealed class UnfinishedRunSweep : IHostedService
{
    private static readonly TimeSpan MaxWait = TimeSpan.FromSeconds(15);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<UnfinishedRunSweep> _logger;

    public UnfinishedRunSweep(IServiceScopeFactory scopes, ILogger<UnfinishedRunSweep> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var startedAt = DateTime.UtcNow;
        try
        {
            using var scope = _scopes.CreateScope();
            var analyses = scope.ServiceProvider.GetRequiredService<IAnalysisRepository>();
            var ended = await analyses.FailUnfinishedAsync(startedAt).WaitAsync(MaxWait, cancellationToken);
            if (ended > 0)
                _logger.LogWarning("[Startup] Marked {Count} interrupted run(s) as failed", ended);
        }
        catch (Exception ex)
        {
            // The site comes up regardless: stuck rows matter less than being down.
            _logger.LogError(ex, "[Startup] Could not check for interrupted runs");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
