using backend.Application.DTOs.AI;
using backend.Application.Services;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;
using System.Text;
using System.Text.Json;

namespace backend.Tests.Integration;

/// <summary>
/// What a user's report settings turn into on the way to the AI service.
///
/// Risk focus: this mapping is where settings vanish silently. The user sees
/// their choice in the panel, the report ignores it, and nothing errors.
/// Driven through AnalysisService because TryStartAsync is fire-and-forget.
/// </summary>
[TestFixture]
public class CustomizationFieldsTests
{
    private FakeAnalysisRepository _analyses = null!;
    private FakePythonAiClient     _python   = null!;
    private FakeUserRepository     _users    = null!;
    private AnalysisService        _service  = null!;
    private Guid                   _userId;

    [SetUp]
    public async Task SetUp()
    {
        _analyses = new FakeAnalysisRepository();
        _python   = new FakePythonAiClient();
        _users    = new FakeUserRepository();
        _service  = new AnalysisService(
            _analyses, new FakeStorageService(), _python, _users,
            new AnalysisGate(new AnalysisLimits()),
            NullLogger<AnalysisService>.Instance);

        _userId = Guid.NewGuid();
        Plan("pro");
        await UploadStore.Users.SaveAsync(_userId, "data.csv", new MemoryStream("a,b\n1,2\n"u8.ToArray()));
    }

    [TearDown]
    public void TearDown() => UploadStore.Users.Delete(_userId);

    private void Plan(string plan) => _users.DefaultUser = User.Restore(
        _userId, "user", "user@example.com", "supabase-auth",
        null, null, true, true, DateTime.UtcNow.AddDays(-10), null,
        plan: plan, reportsUsed: 0, reportsResetAt: DateTime.UtcNow);

    private async Task<AnalyzeRequestDto> Sent(string customizationJson)
    {
        await _service.RunAsync(_userId, "data.csv", 8, 1, 2, customizationJson: customizationJson);
        return _python.LastRequest!;
    }

    [Test]
    public async Task TheBrief_ReachesTheAiService()
    {
        var req = await Sent("""
        {
          "tone": "casual", "language": "fa", "writingFormat": "bullets",
          "focusOn": "churn by region", "assumptions": "Q4 is incomplete", "avoid": "the 2020 rows",
          "questions": [{"question": "Which region churns most?", "note": "for the board"}, "Why?"],
          "mustMention": ["revenue", "margin"],
          "outputFormat": {"word": true, "pptx": true}
        }
        """);

        req.Tone.Should().Be("casual");
        req.Language.Should().Be("fa");
        req.WritingFormat.Should().Be("bullets");
        req.FocusOn.Should().Be("churn by region");
        req.Assumptions.Should().Be("Q4 is incomplete");
        req.Avoid.Should().Be("the 2020 rows");
        req.MustMention.Should().Be("revenue,margin");
        req.WantWord.Should().BeTrue();
        req.WantPptx.Should().BeTrue();

        var questions = JsonDocument.Parse(req.QuestionsJson).RootElement;
        questions.GetArrayLength().Should().Be(2);
        questions[0].GetProperty("question").GetString().Should().Be("Which region churns most?");
        questions[0].GetProperty("note").GetString().Should().Be("for the board");
        questions[1].GetProperty("question").GetString().Should().Be("Why?");
    }

    [TestCase("0", 1)]
    [TestCase("-5", 1)]
    [TestCase("1", 1)]
    [TestCase("7", 7)]
    [TestCase("10", 10)]
    [TestCase("99999", 10)]
    [TestCase("6.4", 6)]
    [TestCase("\"4\"", 4)]
    [TestCase("\"lots\"", 5)]
    [TestCase("null", 5)]
    public async Task InsightsCount_StaysBetweenOneAndTen(string value, int expected)
    {
        var req = await Sent($$"""{"insightsCount": {{value}}}""");
        req.InsightsCount.Should().Be(expected);
    }

    [Test]
    public async Task OneOddValue_DoesNotResetTheOthers()
    {
        // Risk: every field used to be read in one try block, so a single bad
        // value threw and silently put all the user's settings back to default.
        var req = await Sent("""
        {
          "insightsCount": {"not": "a number"}, "includeMethodology": "yes",
          "outputFormat": null, "mustMention": [1, "margin", null],
          "tone": "academic", "focusOn": "returns"
        }
        """);

        req.Tone.Should().Be("academic");
        req.FocusOn.Should().Be("returns");
        req.InsightsCount.Should().Be(5);
        req.IncludeMethodology.Should().BeTrue();
        req.MustMention.Should().Be("margin");
        req.WantWord.Should().BeFalse();
    }

    [Test]
    public async Task Questions_AreCappedAtFive_AndBlanksDropped()
    {
        var questions = string.Join(",", Enumerable.Range(1, 8).Select(i => $"\"Question {i}?\""));
        var req = await Sent($$"""{"questions": ["", {"note": "no question"}, 3, {{questions}}]}""");

        var parsed = JsonDocument.Parse(req.QuestionsJson).RootElement;
        parsed.GetArrayLength().Should().Be(5);
        parsed[0].GetProperty("question").GetString().Should().Be("Question 1?");
    }

    [Test]
    public async Task NoQuestions_SendsNothing()
    {
        (await Sent("""{"questions": []}""")).QuestionsJson.Should().BeEmpty();
    }

    [TestCase("bullets", "bullets")]
    [TestCase("mixed", "mixed")]
    [TestCase("narrative", "narrative")]
    [TestCase("haiku", "narrative")]
    public async Task WritingFormat_FallsBackToNarrative(string given, string expected)
    {
        var req = await Sent($$"""{"writingFormat": "{{given}}"}""");
        req.WritingFormat.Should().Be(expected);
    }

    [TestCase("[1, 2]")]
    [TestCase("\"text\"")]
    [TestCase("42")]
    public async Task CustomizationThatIsNotAnObject_MeansDefaults(string json)
    {
        var req = await Sent(json);

        req.Tone.Should().Be("professional");
        _analyses.Store.Single().Status.Should().Be("done");
    }

    // ── Plan gating ──────────────────────────────────────────────────────────

    [Test]
    public async Task FreeUser_CustomizationIsIgnored_AndNotStored()
    {
        // Risk: the panel is locked in the browser, but a crafted request could
        // still ask for Word and PowerPoint, which only Pro pays for.
        Plan("free");

        var req = await Sent("""
        {"tone": "casual", "language": "fr", "assumptions": "x", "outputFormat": {"word": true, "pptx": true}}
        """);

        req.Tone.Should().Be("professional");
        req.Language.Should().Be("en");
        req.Assumptions.Should().BeEmpty();
        req.WantWord.Should().BeFalse();
        req.WantPptx.Should().BeFalse();
        _analyses.Store.Single().Customization.Should().BeNull("the history must not show settings that were not applied");
    }

    [Test]
    public async Task Admin_GetsCustomization()
    {
        Plan("admin");
        (await Sent("""{"tone": "technical"}""")).Tone.Should().Be("technical");
    }
}
