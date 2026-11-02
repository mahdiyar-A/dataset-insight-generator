using backend.Application.Services;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// The free plan advertises 2 analyses per 48 hours. Until this fix the limit
/// was checked on every upload, but nothing ever incremented the counter it
/// checked, so free accounts could run unlimited analyses.
/// </summary>
[TestFixture]
public class FreePlanQuotaTests
{
    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_uploads");

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
            new AnalysisGate(new AnalysisLimits()),
            NullLogger<AnalysisService>.Instance);

        _userId = Guid.NewGuid();
        Directory.CreateDirectory(TempDir);
        File.WriteAllText(TempCsvPath, "a,b\n1,2\n3,4\n5,6\n");
    }

    [TearDown]
    public void TearDown()
    {
        if (File.Exists(TempCsvPath)) File.Delete(TempCsvPath);
    }

    private string TempCsvPath => Path.Combine(TempDir, $"{_userId}.csv");

    private User FreeUser(int used, double hoursSinceReset) => User.Restore(
        _userId, "free-user", "free@example.com", "supabase-auth",
        null, null, true, true, DateTime.UtcNow.AddDays(-10), null,
        plan: "free", reportsUsed: used,
        reportsResetAt: DateTime.UtcNow.AddHours(-hoursSinceReset));

    [Test]
    public async Task CompletedAnalysis_CountsTowardTheAllowance()
    {
        await _service.RunAsync(_userId, "data.csv", 1024, rowCount: 3, columnCount: 2);

        _analyses.Store.Single().Status.Should().Be("done");
        _users.IncrementCalls.Should().Be(1);
    }

    [Test]
    public async Task FreeUser_WithBothAnalysesUsed_IsRefused()
    {
        _users.DefaultUser = FreeUser(used: 2, hoursSinceReset: 5);

        var result = await _service.TryStartAsync(_userId, "data.csv", 1024, 3, 2);

        result.Allowed.Should().BeFalse();
        result.Code.Should().Be("QUOTA_EXCEEDED");
        result.Message.Should().Contain("48 hours");
    }

    [Test]
    public async Task FreeUser_IsAllowedAgain_After48Hours()
    {
        _users.DefaultUser = FreeUser(used: 2, hoursSinceReset: 49);

        var check = await _service.CheckAsync(_userId);

        check.Allowed.Should().BeTrue();
        _users.ResetCalls.Should().Be(1, "the expired window must be reset, not just ignored");
    }

    [Test]
    public async Task FreeUser_WithOneLeft_IsAllowed()
    {
        _users.DefaultUser = FreeUser(used: 1, hoursSinceReset: 5);
        (await _service.CheckAsync(_userId)).Allowed.Should().BeTrue();
    }

    [Test]
    public async Task ProUser_IsNotSubjectToTheFreeAllowance()
    {
        _users.DefaultUser = User.Restore(
            _userId, "pro-user", "pro@example.com", "supabase-auth",
            null, null, true, true, DateTime.UtcNow.AddDays(-10), null,
            plan: "pro", reportsUsed: 50, reportsResetAt: DateTime.UtcNow.AddHours(-1));

        (await _service.CheckAsync(_userId)).Allowed.Should().BeTrue();
    }
}
