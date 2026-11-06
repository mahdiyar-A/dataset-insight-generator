using backend.Application.Services;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// The id a run is started under is the id its row is saved under.
///
/// The page follows a run by the id in the reply. If the two ever differ the
/// page checks a run that does not exist, and the finished report never shows.
/// </summary>
[TestFixture]
public class AnalysisStartTests
{
    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_uploads");

    private FakeAnalysisRepository _analyses = null!;
    private AnalysisService _service = null!;
    private Guid _userId;

    private string TempCsvPath => Path.Combine(TempDir, $"{_userId}.csv");

    [SetUp]
    public void SetUp()
    {
        _analyses = new FakeAnalysisRepository();
        _service  = new AnalysisService(
            _analyses, new FakeStorageService(), new FakePythonAiClient(), new FakeUserRepository(),
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

    [Test]
    public async Task TheRowIsSavedUnderTheIdInTheReply()
    {
        var started = await _service.TryStartAsync(_userId, "data.csv", 1024, 3, 2);

        started.Allowed.Should().BeTrue();
        started.AnalysisId.Should().NotBeNull();

        // The run is fire-and-forget, so wait for it to finish.
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (DateTime.UtcNow < deadline && _analyses.Store.All(a => a.Status != "done"))
            await Task.Delay(20);

        var row = _analyses.Store.Single();
        row.Id.Should().Be(started.AnalysisId!.Value);
        row.Status.Should().Be("done");
    }

    [Test]
    public async Task ARefusedRunHasNoId()
    {
        await _service.TryStartAsync(_userId, "data.csv", 1024, 3, 2);

        var second = await _service.TryStartAsync(_userId, "data.csv", 1024, 3, 2);

        if (!second.Allowed) second.AnalysisId.Should().BeNull();
    }
}
