using backend.Application.Services;
using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;
using System.Net.Http.Json;
using System.Text.Json;

namespace backend.Tests.Integration;

/// <summary>
/// "What is this data about?", asked before the analysis when DIG is not sure.
///
/// The classification of a file steers the whole report: what leads it, which
/// questions it sets out to answer, what each column is called. It was made
/// after the user pressed Start, its confidence was never read, and when no
/// model answered the file was quietly called "general". A person found out
/// their report rested on a wrong reading after spending an analysis on it.
///
/// What must hold: nothing runs while the question is open, the answer reaches
/// the analysis on every plan, a sure reading costs no extra click, and an AI
/// service that sends no reading behaves exactly as before.
/// </summary>
[TestFixture]
public class AskWhatTheDataIsTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;
    private Guid _userId;

    private const string Classification = """{"domain": "retail", "confidence": 0.62, "source": "model"}""";

    private static string Reading(bool sure, string understoodAs = "online shop orders, one row per order",
                                  params string[] alternatives) =>
        JsonSerializer.Serialize(new
        {
            understoodAs, alternatives, sure,
            why = sure ? "" : "low_confidence",
            classification = JsonDocument.Parse(Classification).RootElement,
        });

    [SetUp]
    public void SetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();
        _userId  = Guid.NewGuid();
        TestAuthHandler.CurrentUserId   = _userId;
        TestAuthHandler.IsAuthenticated = true;

        Directory.CreateDirectory(UploadStore.Users.Root);
        File.WriteAllText(Path.Combine(UploadStore.Users.Root, $"{_userId}.csv"), "a,b\n1,2\n3,4\n5,6\n");
    }

    [TearDown]
    public void TearDown()
    {
        UploadStore.Users.Delete(_userId);
        _client.Dispose();
        _factory.Dispose();
    }

    private async Task<JsonElement> Send(string message, string? answer = null, bool? confirmed = null,
                                         string? pendingCondition = null)
    {
        var response = await _client.PostAsJsonAsync("/api/chat/message", new Dictionary<string, object?>
        {
            ["message"] = message, ["fileName"] = "orders.csv", ["fileSizeBytes"] = 1024,
            ["rowCount"] = 100, ["columnCount"] = 5,
            ["pendingCondition"] = pendingCondition,
            ["domainAnswer"] = answer, ["domainConfirmed"] = confirmed,
        });
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    /// <summary>The analysis is started in the background, so its request arrives a moment later.</summary>
    private async Task<backend.Application.DTOs.AI.AnalyzeRequestDto> TheAnalysisRequest()
    {
        for (var i = 0; i < 100 && _factory.PythonAi.LastRequest == null; i++) await Task.Delay(20);
        return _factory.PythonAi.LastRequest ?? throw new AssertionException("No analysis was started.");
    }

    private async Task NothingRan()
    {
        await Task.Delay(150);
        _factory.PythonAi.ReceivedRequests.Should().BeEmpty("nothing may run while the question is open");
    }

    private static string? Text(JsonElement reply, string name) =>
        reply.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    // ── Sure: say it and get on with it ──────────────────────────────────────

    [Test]
    public async Task WhenDigIsSureItSaysWhatItReadAndStarts()
    {
        _factory.PythonAi.DomainBlockJson = Reading(sure: true);

        var reply = await Send("start_analysis");

        Text(reply, "ask").Should().BeNull("a sure reading must not cost a click");
        Text(reply, "understoodAs").Should().Be("online shop orders, one row per order");
        reply.GetProperty("condition").GetString().Should().Be("all_good");
        _factory.PythonAi.ChecksWithDomain.Should().Equal(true);

        var request = await TheAnalysisRequest();
        request.DomainJson.Should().Contain("retail", "the reading is handed on, so the analysis asks no model twice");
        request.DataDescription.Should().BeEmpty();
    }

    // ── Not sure: ask, and run nothing ───────────────────────────────────────

    [Test]
    public async Task WhenDigIsNotSureItAsksAndRunsNothing()
    {
        _factory.PythonAi.DomainBlockJson =
            Reading(sure: false, "online shop orders, one row per order", "warehouse stock movements", "supplier invoices");

        var reply = await Send("start_analysis");

        Text(reply, "ask").Should().Be("domain");
        reply.GetProperty("requiresResponse").GetBoolean().Should().BeTrue();
        reply.GetProperty("options").EnumerateArray().Select(o => o.GetString()).Should().Equal(
            "online shop orders, one row per order", "warehouse stock movements", "supplier invoices");
        reply.GetProperty("analysisId").ValueKind.Should().Be(JsonValueKind.Null);
        await NothingRan();
    }

    [Test]
    public async Task WhenNoModelCouldReadItTheQuestionIsOpen()
    {
        // No reading at all: nothing to choose from, so the person is simply asked.
        _factory.PythonAi.DomainBlockJson = Reading(sure: false, understoodAs: "");

        var reply = await Send("start_analysis");

        Text(reply, "ask").Should().Be("domain");
        reply.GetProperty("options").GetArrayLength().Should().Be(0);
        Text(reply, "reply").Should().Contain("what is this data about");
        await NothingRan();
    }

    // ── The answer reaches the analysis ──────────────────────────────────────

    [Test]
    public async Task TheirOwnWordsReachTheAnalysisOnTheFreePlan()
    {
        // The user here is on the free plan, where report customization is
        // stripped. Being asked what your file is about is not a paid extra.
        _factory.PythonAi.DomainBlockJson = Reading(sure: false);
        await Send("start_analysis");

        var reply = await Send("domain_answer", answer: "  clinic appointments, one row per visit  ");

        reply.GetProperty("condition").GetString().Should().Be("all_good");
        var request = await TheAnalysisRequest();
        request.DataDescription.Should().Be("clinic appointments, one row per visit");
        request.DomainJson.Should().Contain("retail", "the earlier reading goes too, in case no model answers again");
    }

    [Test]
    public async Task ConfirmingDigsOwnReadingAddsNothingToTell()
    {
        _factory.PythonAi.DomainBlockJson = Reading(sure: false);
        await Send("start_analysis");

        await Send("domain_answer", answer: "online shop orders, one row per order", confirmed: true);

        var request = await TheAnalysisRequest();
        request.DataDescription.Should().BeEmpty("the reading was right; classifying again would spend a model call for nothing");
        request.DomainJson.Should().Contain("retail");
    }

    [Test]
    public async Task SkippingTheQuestionStillRunsTheAnalysis()
    {
        _factory.PythonAi.DomainBlockJson = Reading(sure: false);
        await Send("start_analysis");

        var reply = await Send("domain_answer", answer: "");

        reply.GetProperty("failed").GetBoolean().Should().BeFalse();
        (await TheAnalysisRequest()).DataDescription.Should().BeEmpty();
    }

    [Test]
    public async Task AVeryLongAnswerIsCut()
    {
        _factory.PythonAi.DomainBlockJson = Reading(sure: false);
        await Send("start_analysis");

        await Send("domain_answer", answer: new string('x', 5000));

        (await TheAnalysisRequest()).DataDescription.Length.Should().Be(300);
    }

    // ── With the other questions ─────────────────────────────────────────────

    [Test]
    public async Task TheCleaningQuestionComesAfterAndTheAnswerSurvivesIt()
    {
        _factory.PythonAi.CheckCondition  = "not_clean";
        _factory.PythonAi.DomainBlockJson = Reading(sure: false);

        var asked = await Send("start_analysis");
        Text(asked, "ask").Should().Be("domain");

        var next = await Send("domain_answer", answer: "clinic appointments");
        Text(next, "ask").Should().BeNull();
        next.GetProperty("condition").GetString().Should().Be("not_clean");
        next.GetProperty("requiresResponse").GetBoolean().Should().BeTrue();
        await NothingRan();

        await Send("yes", pendingCondition: "not_clean");

        var request = await TheAnalysisRequest();
        request.UserWantsCleaning.Should().BeTrue();
        request.DataDescription.Should().Be("clinic appointments");
    }

    [Test]
    public async Task AFileThatCannotBeAnalysedIsNotAskedAbout()
    {
        _factory.PythonAi.CheckCondition  = "not_workable";
        _factory.PythonAi.DomainBlockJson = Reading(sure: false);

        var reply = await Send("start_analysis");

        Text(reply, "ask").Should().BeNull();
        reply.GetProperty("failed").GetBoolean().Should().BeTrue();
    }

    // ── Things that must not go wrong ────────────────────────────────────────

    [Test]
    public async Task AnAiServiceThatSendsNoReadingBehavesAsBefore()
    {
        // The two services are deployed one after the other. In between, the
        // old AI service answers /check without a reading.
        _factory.PythonAi.DomainBlockJson = null;

        var reply = await Send("start_analysis");

        Text(reply, "ask").Should().BeNull();
        Text(reply, "understoodAs").Should().BeNull();
        reply.GetProperty("condition").GetString().Should().Be("all_good");
        (await TheAnalysisRequest()).DomainJson.Should().BeEmpty();
    }

    [Test]
    public async Task AnAnswerWithNoQuestionBehindItStartsNothing()
    {
        // Risk: a crafted "domain_answer" starting an analysis on a file that
        // was never checked.
        var reply = await Send("domain_answer", answer: "anything");

        reply.GetProperty("failed").GetBoolean().Should().BeTrue();
        Text(reply, "reply").Should().Contain("Start again");
        await NothingRan();
    }

    [Test]
    public async Task PressingStartAgainForgetsTheEarlierAnswer()
    {
        // Risk: yesterday's description of another reading riding along with
        // today's run of the same upload.
        _factory.PythonAi.DomainBlockJson = Reading(sure: false);
        await Send("start_analysis");
        UploadStore.Users.SaveMeta(_userId,
            UploadStore.Users.ReadMeta(_userId)! with { DataDescription = "an old answer" });

        await Send("start_analysis");

        UploadStore.Users.ReadMeta(_userId)!.DataDescription.Should().BeNull();
    }
}
