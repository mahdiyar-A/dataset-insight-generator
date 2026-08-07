using backend.Application.DTOs.AI;
using backend.Application.Services;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// Regression tests for the data-cleaning bug.
///
/// The bug
/// -------
/// The chatbot asked "your dataset has quality issues — shall I clean it?".
/// The user said yes. ChatController correctly computed userWantsCleaning = true
/// and passed it to AnalysisService.StartInBackground. AnalysisService accepted
/// the parameter — and never used it. BuildPythonRequest constructed the
/// AnalyzeRequestDto without setting UserWantsCleaning, so it defaulted to false.
/// PythonAiClient serialised that false into the multipart form, and the Python
/// pipeline gates Phase 3 on `if quality.needsCleaning and user_wants_cleaning`.
///
/// Net effect: cleaning never ran for authenticated users. The report was built
/// on the dirty dataset while the UI told the user cleaning had been applied,
/// and no cleaned CSV was ever produced — so re-uploading "the cleaned file"
/// meant re-uploading the original, which the checker flagged again. That is the
/// loop users reported.
///
/// Note this was invisible to the existing endpoint tests: they asserted the
/// pipeline *ran*, never what it was asked to do. GuestController escaped the bug
/// because it builds its DTO inline and sets the flags directly.
///
/// These tests exercise AnalysisService directly rather than through HTTP,
/// because StartInBackground is fire-and-forget — an HTTP-level test would race
/// the background task.
/// </summary>
[TestFixture]
public class CleaningFlagPropagationTests
{
    private static readonly string TempDir =
        Path.Combine(Path.GetTempPath(), "dig_uploads");

    private FakeAnalysisRepository _analyses = null!;
    private FakeStorageService     _storage  = null!;
    private FakePythonAiClient     _python   = null!;
    private AnalysisService        _service  = null!;
    private Guid                   _userId;

    [SetUp]
    public void SetUp()
    {
        _analyses = new FakeAnalysisRepository();
        _storage  = new FakeStorageService();
        _python   = new FakePythonAiClient();
        _service  = new AnalysisService(
            _analyses, _storage, _python,
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

    private Task Run(bool wantsCleaning = false, bool confirmedLow = false) =>
        _service.RunAsync(
            _userId, "data.csv", 1024, rowCount: 100, columnCount: 5,
            userWantsCleaning: wantsCleaning,
            userConfirmedLow:  confirmedLow);

    // ── The regression ───────────────────────────────────────────────────────

    [Test]
    public async Task UserAcceptsCleaning_PythonReceivesCleaningFlag()
    {
        // Risk: this is the bug. If UserWantsCleaning arrives false, the Python
        // pipeline skips Phase 3 entirely and the user gets a report built on
        // dirty data while the chatbot claims the data was cleaned.
        await Run(wantsCleaning: true);

        _python.LastRequest.Should().NotBeNull("the pipeline must have been invoked");
        _python.LastRequest!.UserWantsCleaning.Should().BeTrue(
            "the user said yes to cleaning — Python must be told to clean");
    }

    [Test]
    public async Task UserDeclinesCleaning_PythonReceivesFalse()
    {
        // Risk: the inverse failure — cleaning a dataset the user asked us to
        // leave alone silently changes their data.
        await Run(wantsCleaning: false);

        _python.LastRequest!.UserWantsCleaning.Should().BeFalse();
    }

    [Test]
    public async Task UserConfirmsLowAccuracy_PythonReceivesConfirmationFlag()
    {
        // Risk: same class of bug on the sibling flag. If UserConfirmedLow is
        // dropped, the pipeline can abort on a low-confidence dataset the user
        // explicitly agreed to proceed with.
        await Run(confirmedLow: true);

        _python.LastRequest!.UserConfirmedLow.Should().BeTrue();
    }

    [Test]
    public async Task BothFlagsIndependent_NotConflated()
    {
        // Risk: wiring both flags from a single boolean would make "yes, clean it"
        // also suppress the low-confidence gate.
        await Run(wantsCleaning: true, confirmedLow: false);

        _python.LastRequest!.UserWantsCleaning.Should().BeTrue();
        _python.LastRequest!.UserConfirmedLow.Should().BeFalse();
    }

    // ── Cleaned output is persisted ──────────────────────────────────────────

    [Test]
    public async Task WhenPythonReturnsCleanedCsv_PathIsStoredOnAnalysis()
    {
        // Risk: if the cleaned CSV path is not persisted, the user has no way to
        // download the cleaned dataset — which is what the chatbot offers them.
        _python.CleanedCsvBase64 = Convert.ToBase64String("a,b\n1,2\n"u8.ToArray());

        await Run(wantsCleaning: true);

        var analysis = _analyses.Store.Single();
        analysis.CleanedCsvPath.Should().NotBeNullOrEmpty(
            "a cleaned CSV was produced, so its storage path must be recorded");
    }

    [Test]
    public async Task WhenNoCleaningRequested_NoCleanedCsvPathRecorded()
    {
        // Risk: recording a cleaned path when nothing was cleaned would offer the
        // user a download that is really just their original file.
        _python.CleanedCsvBase64 = null;

        await Run(wantsCleaning: false);

        _analyses.Store.Single().CleanedCsvPath.Should().BeNull();
    }

    // ── Customization must not clobber the flags ─────────────────────────────

    [Test]
    public async Task CleaningFlagSurvivesCustomizationParsing()
    {
        // Risk: BuildPythonRequest sets the flags before parsing customization
        // JSON. A future refactor that rebuilds the DTO after parsing would
        // silently reintroduce the original bug.
        const string customization = """
        {"language":"fr","tone":"technical","insightsCount":7,"audience":"executive"}
        """;

        await _service.RunAsync(
            _userId, "data.csv", 1024, 100, 5,
            userWantsCleaning: true, userConfirmedLow: true,
            customizationJson: customization);

        var req = _python.LastRequest!;
        req.UserWantsCleaning.Should().BeTrue();
        req.UserConfirmedLow.Should().BeTrue();
        req.Language.Should().Be("fr", "customization must still be applied");
        req.InsightsCount.Should().Be(7);
    }

    [Test]
    public async Task MalformedCustomizationDoesNotDropCleaningFlag()
    {
        // Risk: BuildPythonRequest swallows customization parse errors. The flags
        // must be set outside that try/catch or a malformed payload disables
        // cleaning silently.
        await _service.RunAsync(
            _userId, "data.csv", 1024, 100, 5,
            userWantsCleaning: true, userConfirmedLow: false,
            customizationJson: "{ this is not valid json");

        _python.LastRequest!.UserWantsCleaning.Should().BeTrue();
    }
}
