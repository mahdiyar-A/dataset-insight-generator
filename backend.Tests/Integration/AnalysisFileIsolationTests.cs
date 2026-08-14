using backend.Application.Services;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// Regression tests for the history storage bug.
///
/// The bug
/// -------
/// Only Word and PowerPoint were keyed by analysisId. The PDF, both CSVs and
/// every chart wrote to flat, user-scoped paths:
///
///   users/{userId}/report.pdf
///   users/{userId}/cleaned.csv
///   users/{userId}/original.csv
///   users/{userId}/chart_{n}.png
///
/// Uploads use Upsert = true, so each new analysis overwrote the previous one's
/// files. History listed five entries with correct names, shapes and dates, and
/// every one of them resolved to the most recent analysis's output. A user
/// clicking last Tuesday's report got today's.
///
/// The same flat paths were listed in DeleteAnalysisFilesAsync, so deleting any
/// one analysis wiped the PDF, CSVs and charts belonging to all the others.
///
/// Second bug: the 5/15 plan limit was applied when reading history and nowhere
/// else. Nothing ever deleted the overflow, so rows and their files accumulated
/// in the database and in storage indefinitely — invisible to the user, and
/// billed.
///
/// These drive AnalysisService directly rather than over HTTP, because
/// StartInBackground is fire-and-forget and an HTTP test would race it.
/// </summary>
[TestFixture]
public class AnalysisFileIsolationTests
{
    private static readonly string TempDir =
        Path.Combine(Path.GetTempPath(), "dig_uploads");

    private FakeAnalysisRepository _analyses = null!;
    private FakeStorageService     _storage  = null!;
    private FakePythonAiClient     _python   = null!;
    private FakeUserRepository     _users    = null!;
    private AnalysisService        _service  = null!;
    private Guid                   _userId;

    [SetUp]
    public void SetUp()
    {
        _analyses = new FakeAnalysisRepository();
        _storage  = new FakeStorageService();
        _python   = new FakePythonAiClient();
        _users    = new FakeUserRepository();
        _service  = new AnalysisService(
            _analyses, _storage, _python, _users,
            NullLogger<AnalysisService>.Instance);

        _userId = Guid.NewGuid();
        Directory.CreateDirectory(TempDir);
    }

    [TearDown]
    public void TearDown()
    {
        if (File.Exists(TempCsvPath)) File.Delete(TempCsvPath);
    }

    private string TempCsvPath => Path.Combine(TempDir, $"{_userId}.csv");

    /// <summary>
    /// Run one full analysis. The temp file is rewritten each time because the
    /// pipeline deletes it on success.
    /// </summary>
    private async Task<Analysis> RunOnce(string fileName)
    {
        File.WriteAllText(TempCsvPath, "a,b\n1,2\n3,4\n5,6\n");
        _python.CleanedCsvBase64 = Convert.ToBase64String("a,b\n1,2\n"u8.ToArray());

        var before = _analyses.Store.Select(a => a.Id).ToHashSet();
        await _service.RunAsync(_userId, fileName, 1024, 100, 5, userWantsCleaning: true);

        return _analyses.Store.Single(a => !before.Contains(a.Id));
    }

    // ── The core regression ──────────────────────────────────────────────────

    [Test]
    public async Task TwoAnalyses_WriteToDifferentPaths()
    {
        // Risk: this is the bug. Shared paths plus upsert means the second run
        // silently replaces the first run's files.
        var first  = await RunOnce("january.csv");
        var second = await RunOnce("february.csv");

        first.PdfReportPath.Should().NotBe(second.PdfReportPath);
        first.CleanedCsvPath.Should().NotBe(second.CleanedCsvPath);
        first.OriginalCsvPath.Should().NotBe(second.OriginalCsvPath);
    }

    [Test]
    public async Task EveryStoredPathIsScopedToItsAnalysis()
    {
        // Risk: a path missing the analysis id is one that will collide on the
        // next run. Asserting the id appears catches any output added later
        // that forgets to key itself.
        var analysis = await RunOnce("data.csv");
        var id = analysis.Id.ToString();

        analysis.PdfReportPath.Should().Contain(id);
        analysis.CleanedCsvPath.Should().Contain(id);
        analysis.OriginalCsvPath.Should().Contain(id);
    }

    [Test]
    public async Task SecondAnalysisDoesNotOverwriteTheFirstsFiles()
    {
        // Risk: stated as a storage property rather than a path-string property,
        // so it still holds if the layout changes again.
        var first = await RunOnce("january.csv");
        var firstPaths = _storage.Files.Keys.ToHashSet();

        await RunOnce("february.csv");

        foreach (var path in firstPaths)
            _storage.Files.Should().ContainKey(path,
                $"{path} belongs to the first analysis and must survive the second");

        _ = first;
    }

    [Test]
    public async Task ChartsAreScopedPerAnalysis()
    {
        // Risk: charts were the worst case — chart_0.png through chart_4.png
        // were shared, so the thumbnail for every history entry was identical.
        _python.ChartCount = 3;

        var first  = await RunOnce("january.csv");
        var second = await RunOnce("february.csv");

        var firstCharts  = _storage.WrittenPaths.Where(p => p.Contains($"{first.Id}/chart_")).ToList();
        var secondCharts = _storage.WrittenPaths.Where(p => p.Contains($"{second.Id}/chart_")).ToList();

        firstCharts.Should().NotBeEmpty();
        secondCharts.Should().NotBeEmpty();
        firstCharts.Should().NotIntersectWith(secondCharts);
    }

    // ── Deletion is scoped ───────────────────────────────────────────────────

    [Test]
    public async Task DeletingOneAnalysisLeavesTheOtherIntact()
    {
        // Risk: DeleteAnalysisFilesAsync listed the flat shared paths, so
        // removing one history entry destroyed the files behind every entry.
        var first  = await RunOnce("january.csv");
        var second = await RunOnce("february.csv");

        var survivorPaths = _storage.Files.Keys
            .Where(p => p.Contains(second.Id.ToString()))
            .ToList();

        await _storage.DeleteAnalysisFilesAsync(_userId, first.Id);

        _storage.Files.Keys.Should().NotContain(p => p.Contains(first.Id.ToString()));
        foreach (var path in survivorPaths)
            _storage.Files.Should().ContainKey(path,
                "deleting one analysis must not touch another's files");
    }

    // ── History pruning ──────────────────────────────────────────────────────

    [Test]
    public async Task FreePlan_KeepsOnlyFiveAnalyses()
    {
        // Risk: the limit was enforced on read only. A user saw five entries
        // while every run they had ever made stayed in the database forever.
        _users.DefaultUser = MakeUser("free");

        for (var i = 0; i < 8; i++) await RunOnce($"file{i}.csv");

        _analyses.Store.Count(a => a.Status == "done").Should().Be(5);
    }

    [Test]
    public async Task ProPlan_KeepsFifteenAnalyses()
    {
        _users.DefaultUser = MakeUser("pro");

        for (var i = 0; i < 17; i++) await RunOnce($"file{i}.csv");

        _analyses.Store.Count(a => a.Status == "done").Should().Be(15);
    }

    [Test]
    public async Task PruningKeepsTheNewestAndDropsTheOldest()
    {
        // Risk: pruning that ordered differently from GetHistoryAsync would
        // delete exactly the entries the user can still see.
        _users.DefaultUser = MakeUser("free");

        var created = new List<Analysis>();
        for (var i = 0; i < 7; i++) created.Add(await RunOnce($"file{i}.csv"));

        var surviving = _analyses.Store.Select(a => a.Id).ToHashSet();

        surviving.Should().NotContain(created[0].Id, "oldest must be pruned");
        surviving.Should().NotContain(created[1].Id);
        surviving.Should().Contain(created[6].Id, "newest must be kept");
    }

    [Test]
    public async Task PruningDeletesTheFilesToo()
    {
        // Risk: deleting the row without the files leaks storage with nothing
        // left pointing at it — unreachable and unbillable to any user.
        _users.DefaultUser = MakeUser("free");

        var created = new List<Analysis>();
        for (var i = 0; i < 7; i++) created.Add(await RunOnce($"file{i}.csv"));

        _storage.DeletedAnalyses.Should().Contain(created[0].Id);
        _storage.Files.Keys.Should().NotContain(p => p.Contains(created[0].Id.ToString()));
    }

    [Test]
    public async Task PruningDoesNotRunBelowTheLimit()
    {
        // Risk: an off-by-one here silently deletes a user's most recent work.
        _users.DefaultUser = MakeUser("free");

        for (var i = 0; i < 4; i++) await RunOnce($"file{i}.csv");

        _analyses.Store.Count(a => a.Status == "done").Should().Be(4);
        _storage.DeletedAnalyses.Should().BeEmpty();
    }

    [Test]
    public void HistoryLimitMatchesTheAdvertisedPlanLimits()
    {
        // Risk: these numbers appear in PlansController's marketing copy. If the
        // two drift, a paying user loses history the pricing page promised.
        AnalysisService.HistoryLimitFor("free").Should().Be(5);
        AnalysisService.HistoryLimitFor("pro").Should().Be(15);
        AnalysisService.HistoryLimitFor("admin").Should().Be(15);
        AnalysisService.HistoryLimitFor(null).Should().Be(5, "unknown plan must fail closed to free");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private User MakeUser(string plan) => User.Restore(
        _userId, "testuser", "test@example.com", "supabase-auth",
        null, null, true, true,
        DateTime.UtcNow.AddDays(-1), null,
        plan: plan, reportsUsed: 0,
        reportsResetAt: DateTime.UtcNow.AddDays(-1));
}
