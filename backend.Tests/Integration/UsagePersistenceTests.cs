using backend.Application.Services;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// The AI service has computed LLM cost per analysis since August 2026 and
/// returned it in the /analyze response "for the backend to persist" — and the
/// backend never did: AnalyzeResponseDto had no usage field, so the number was
/// dropped at deserialization. These tests pin the wiring from the Python
/// response through AnalysisService into the repository.
///
/// Exercises AnalysisService directly rather than through HTTP because
/// StartInBackground is fire-and-forget — an HTTP-level test would race the
/// background task.
/// </summary>
[TestFixture]
public class UsagePersistenceTests
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
        File.WriteAllText(TempCsvPath, "a,b\n1,2\n3,4\n5,6\n");
    }

    [TearDown]
    public void TearDown()
    {
        if (File.Exists(TempCsvPath)) File.Delete(TempCsvPath);
    }

    private string TempCsvPath => Path.Combine(TempDir, $"{_userId}.csv");

    private Task Run() =>
        _service.RunAsync(_userId, "data.csv", 1024, rowCount: 100, columnCount: 5);

    [Test]
    public async Task UsageInResponse_IsPersistedOnTheAnalysis()
    {
        _python.UsageJson = """
        {
          "total_cost_usd": 0.0123,
          "total_input_tokens": 41000,
          "total_output_tokens": 5200,
          "call_count": 3,
          "failed_call_count": 0,
          "duration_ms": 8100,
          "cost_by_phase": { "domain": 0.001, "insights": 0.0093, "judge": 0.002 }
        }
        """;

        await Run();

        var a = _analyses.Store.Single();
        a.Status.Should().Be("done");
        a.CostUsd.Should().Be(0.0123m);
        a.TokensIn.Should().Be(41000);
        a.TokensOut.Should().Be(5200);
        a.UsageJson.Should().Contain("insights",
            "per-phase costs must survive so a cost spike can be attributed to a prompt");
    }

    [Test]
    public async Task MissingUsage_DoesNotFailTheAnalysis()
    {
        // An older AI service image predates telemetry and omits the field.
        // The run must still complete; cost simply stays unrecorded.
        _python.UsageJson = null;

        await Run();

        var a = _analyses.Store.Single();
        a.Status.Should().Be("done");
        a.CostUsd.Should().BeNull();
        a.TokensIn.Should().BeNull();
    }

    [Test]
    public async Task ZeroCostUsage_IsStoredAsZero_NotConfusedWithUnrecorded()
    {
        // The AI service deliberately prices unknown models at zero. A stored
        // zero means "recorded, and the pricing table needs updating" — null
        // means "never recorded". Collapsing the two would hide the former.
        _python.UsageJson = """
        {
          "total_cost_usd": 0,
          "total_input_tokens": 900,
          "total_output_tokens": 100,
          "call_count": 1,
          "failed_call_count": 0,
          "duration_ms": 500,
          "cost_by_phase": {}
        }
        """;

        await Run();

        var a = _analyses.Store.Single();
        a.CostUsd.Should().Be(0m);
        a.TokensIn.Should().Be(900);
    }
}
