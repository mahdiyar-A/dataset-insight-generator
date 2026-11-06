using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// A restart cuts off any run in progress, and nothing else ever ended those
/// rows: the person's page waited on a run that no longer existed.
/// </summary>
[TestFixture]
public class UnfinishedRunSweepTests
{
    private static Analysis Run(string status)
    {
        var analysis = new Analysis(Guid.NewGuid(), "data.csv", 100);
        analysis.SetStatus(status);
        return analysis;
    }

    private static UnfinishedRunSweep Sweep(IAnalysisRepository repo)
    {
        var services = new ServiceCollection().AddScoped(_ => repo).BuildServiceProvider();
        return new UnfinishedRunSweep(services.GetRequiredService<IServiceScopeFactory>(),
                                      NullLogger<UnfinishedRunSweep>.Instance);
    }

    [Test]
    public async Task ARunCutOffByARestartEndsAsFailed()
    {
        var repo = new FakeAnalysisRepository();
        var cut = Run("processing");
        await repo.UpsertAsync(cut);

        await Sweep(repo).StartAsync(CancellationToken.None);

        cut.Status.Should().Be("failed");
    }

    [TestCase("done")]
    [TestCase("failed")]
    public async Task AFinishedRunIsLeftAlone(string status)
    {
        var repo = new FakeAnalysisRepository();
        var finished = Run(status);
        await repo.UpsertAsync(finished);

        await Sweep(repo).StartAsync(CancellationToken.None);

        finished.Status.Should().Be(status);
    }

    [Test]
    public async Task ARunThatBeganAfterStartupIsLeftAlone()
    {
        var repo = new FakeAnalysisRepository();
        var fresh = Run("processing");
        await repo.UpsertAsync(fresh);

        var ended = await repo.FailUnfinishedAsync(fresh.CreatedAt.AddSeconds(-1));

        ended.Should().Be(0);
        fresh.Status.Should().Be("processing");
    }

    [Test]
    public async Task ADatabaseProblemDoesNotStopTheSiteStarting()
    {
        var sweep = Sweep(new BrokenAnalyses());

        await sweep.Invoking(s => s.StartAsync(CancellationToken.None)).Should().NotThrowAsync();
    }

    private sealed class BrokenAnalyses : FakeAnalysisRepository
    {
        public override Task<int> FailUnfinishedAsync(DateTime startedBefore) =>
            throw new InvalidOperationException("database is down");
    }
}
