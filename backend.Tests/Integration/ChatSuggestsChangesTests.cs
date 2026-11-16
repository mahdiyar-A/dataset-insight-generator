using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using backend.Application.Services;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// The chat suggests changes to the report, and DIG offers next steps and
/// draws charts. A suggestion is kept on the server and the page applies it by
/// id, so what is applied is what the AI service checked; applying it is a
/// save like any other, and the next-step buttons and drawing cost no question.
/// </summary>
[TestFixture]
public class ChatSuggestsChangesTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;
    private Guid _userId;

    private const string Original = """
    {"schema":1,"text":{"reportTitle":"Sales review","executiveSummary":"Revenue rose."},
     "insights":[{"id":"i1","title":"North leads"}],
     "charts":[{"file":0,"insight":"i1"}],"questionAnswers":[],"facts":{"rowCount":600,"language":"en"}}
    """;

    // A one-pixel PNG, as the AI service would draw it.
    private static readonly byte[] Png = Convert.FromHexString(
        "89504E470D0A1A0A0000000D4948445200000001000000010806000000" +
        "1F15C4890000000D49444154789C63F8FFFF3F0005FE02FEA7D6A5A30000000049454E44AE426082");
    private static readonly string PngBase64 = Convert.ToBase64String(Png);

    private const string TextChange = """{"op":"set_text","field":"executiveSummary","text":"Revenue rose all year."}""";
    private static string ChartChange => $$"""
        {"op":"add_chart","chart":{"type":"bar","x":"region","y":"revenue","group":null,"agg":"sum"},
         "label":"Revenue by region","picture":"{{PngBase64}}"}
        """;

    private static string ProposalJson(params string[] changes) => $$"""
        {"changes": [{{string.Join(",", changes)}}],
         "preview": [{{string.Join(",", changes.Select((_, k) => $$"""{"op":"change {{k}}"}"""))}}],
         "warnings": ["9999999"]}
        """;

    [SetUp]
    public void SetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();
        _userId  = Guid.NewGuid();
        TestAuthHandler.CurrentUserId   = _userId;
        TestAuthHandler.IsAuthenticated = true;
    }

    [TearDown]
    public void TearDown()
    {
        TestAuthHandler.CurrentUserId = _userId;
        _client.Dispose();
        _factory.Dispose();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<Analysis> Seed(bool editable = true, Guid? owner = null, bool withData = true)
    {
        var userId = owner ?? _userId;
        var a = new Analysis(userId, "sales.csv", 2048);
        a.SetStatus("done");
        a.SetPdfPath($"users/{userId}/analyses/{a.Id}/report.pdf");
        _factory.AnalysisRepo.Store.Add(a);
        _factory.StorageSvc.Files[$"users/{userId}/analyses/{a.Id}/chart_0.png"] = new byte[] { 1, 2, 3 };
        await _factory.StorageSvc.SaveChatContextAsync(userId, a.Id, """{"version": 1, "digest": {}}""");
        if (withData)
            a.SetOriginalCsvPath(await _factory.StorageSvc.SaveOriginalFileAsync(
                userId, a.Id, Encoding.UTF8.GetBytes("region,revenue\nNorth,10\n"), "sales.csv"));
        if (editable)
            await _factory.Versions.TryInsertAsync(new ReportVersion(a.Id, 1, Original, null, ReportVersion.Written,
                                                                     filesBuilt: true));
        return a;
    }

    private void TheChatSuggests(params string[] changes) => _factory.PythonAi.AskJson = $$"""
        {"answer": "I'd shorten the summary.", "refused": false, "queries": [], "unverifiedNumbers": [],
         "model": "Stub", "grounding": "analysis", "proposal": {{ProposalJson(changes)}}}
        """;

    /// <summary>The AI service's part in applying changes: the document they make, and where pictures go.</summary>
    private void RebuildAppliesChanges(string document, string newChartFiles = "{}") =>
        _factory.PythonAi.RebuildReply = request => $$"""
            {"document": {{(request.ChangesJson != null ? document : request.EditedJson ?? request.OriginalJson)}},
             "pdf_report_base64": "UERG", "warnings": [], "chat_context": {"version": 1},
             "new_chart_files": {{(request.ChangesJson != null ? newChartFiles : "{}")}} }
            """;

    private Task<HttpResponseMessage> Ask(Guid id, string question = "Make the summary shorter") =>
        _client.PostAsJsonAsync("/api/chat/ask", new { analysisId = id, question });

    private Task<HttpResponseMessage> Apply(Guid id, Guid proposalId) =>
        _client.PostAsJsonAsync($"/api/analyses/{id}/report/apply", new { proposalId });

    private Task<HttpResponseMessage> Draw(Guid id, object? chart = null, string label = "Revenue by region") =>
        _client.PostAsJsonAsync($"/api/analyses/{id}/report/draw",
            new { chart = chart ?? new { type = "bar", x = "region", y = "revenue", agg = "sum" }, label });

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<Guid> SuggestedId(Guid analysisId)
    {
        var body = await Json(await Ask(analysisId));
        return body.GetProperty("proposal").GetProperty("id").GetGuid();
    }

    private ReportProposals Proposals => _factory.Services.GetRequiredService<ReportProposals>();

    // ── The chat ─────────────────────────────────────────────────────────────

    [Test]
    public async Task The_owners_question_carries_the_report_and_a_suggestion_comes_back_as_an_id_and_a_preview()
    {
        var a = await Seed();
        TheChatSuggests(TextChange, ChartChange);

        var r = await Ask(a.Id);

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        _factory.PythonAi.AskCalls.Single().DocumentJson.Should().Be(Original);
        var proposal = (await Json(r)).GetProperty("proposal");
        proposal.GetProperty("baseVersion").GetInt32().Should().Be(1);
        proposal.GetProperty("warnings")[0].GetString().Should().Be("9999999");
        var preview = proposal.GetProperty("preview");
        preview.GetArrayLength().Should().Be(2);
        preview[1].GetProperty("picture").GetString().Should().Be("data:image/png;base64," + PngBase64);
        // The page is never sent the changes themselves, so it cannot send back its own.
        proposal.TryGetProperty("changes", out _).Should().BeFalse();

        var kept = Proposals.Find(proposal.GetProperty("id").GetGuid(), _userId, a.Id)!;
        kept.BaseVersion.Should().Be(1);
        kept.ChangesJson.Should().Contain("Revenue rose all year").And.NotContain("picture");
        kept.Pictures.Keys.Should().Equal(1);
        kept.Pictures[1].Should().Equal(Png);
    }

    [Test]
    public async Task A_report_made_before_editing_is_not_sent_and_nothing_is_offered()
    {
        var a = await Seed(editable: false);
        TheChatSuggests(TextChange);

        var body = await Json(await Ask(a.Id));

        _factory.PythonAi.AskCalls.Single().DocumentJson.Should().BeNull();
        body.GetProperty("proposal").ValueKind.Should().Be(JsonValueKind.Null);
        Proposals.Count.Should().Be(0);
    }

    [Test]
    public async Task A_suggestion_costs_one_question_like_any_answer()
    {
        var a = await Seed();
        TheChatSuggests(TextChange);

        var body = await Json(await Ask(a.Id));

        body.GetProperty("remaining").GetInt32().Should().Be(body.GetProperty("limit").GetInt32() - 1);
    }

    // ── Applying ─────────────────────────────────────────────────────────────

    [Test]
    public async Task Applying_saves_a_new_version_with_rebuilt_files_and_the_drawn_chart_stored()
    {
        var a = await Seed();
        TheChatSuggests(TextChange, ChartChange);
        var applied = Original.Replace("\"Revenue rose.\"", "\"Revenue rose all year.\"")
                              .Replace("[{\"file\":0,\"insight\":\"i1\"}]", "[{\"file\":0,\"insight\":\"i1\"},{\"file\":1}]");
        RebuildAppliesChanges(applied, """{"1": 1}""");
        var id = await SuggestedId(a.Id);

        var r = await Apply(a.Id, id);

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await Json(r);
        body.GetProperty("version").GetInt32().Should().Be(2);
        body.GetProperty("pictures").GetProperty("1").GetString().Should().Contain("chart_1.png");

        var v2 = _factory.Versions.All.Single(v => v.Version == 2);
        v2.Kind.Should().Be(ReportVersion.Edited);
        v2.EditedBy.Should().Be(_userId, "the owner applied it");
        v2.FilesBuilt.Should().BeTrue();

        var call = _factory.PythonAi.RebuildCalls.Single();
        call.EditedJson.Should().BeNull("the changes are made to the newest version by the AI service");
        call.CurrentJson.Should().Be(Original);
        call.ChangesJson.Should().Contain("Revenue rose all year").And.NotContain("picture");
        call.NewCharts!.Keys.Should().Equal(1);
        call.Warn.Should().BeFalse("the suggestion's figures were warned about on the card");
        call.Charts.Keys.Should().Equal(0);

        _factory.StorageSvc.Files[$"users/{_userId}/analyses/{a.Id}/chart_1.png"].Should().Equal(Png);
        Encoding.UTF8.GetString(_factory.StorageSvc.Saved[$"users/{_userId}/analyses/{a.Id}/report.pdf"])
            .Should().Be("PDF");
    }

    [Test]
    public async Task A_suggestion_is_applied_once()
    {
        var a = await Seed();
        TheChatSuggests(TextChange);
        RebuildAppliesChanges(Original.Replace("Revenue rose.", "Revenue rose all year."));
        var id = await SuggestedId(a.Id);
        (await Apply(a.Id, id)).StatusCode.Should().Be(HttpStatusCode.OK);

        var again = await Apply(a.Id, id);

        again.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Json(again)).GetProperty("error").GetString().Should().Be("SUGGESTION_EXPIRED");
        _factory.Versions.All.Should().HaveCount(2);
    }

    [Test]
    public async Task A_suggestion_made_to_an_older_version_is_refused_and_dropped()
    {
        var a = await Seed();
        TheChatSuggests(TextChange);
        var id = await SuggestedId(a.Id);
        await _factory.Versions.TryInsertAsync(new ReportVersion(a.Id, 2, Original, _userId, ReportVersion.Edited,
                                                                 filesBuilt: true));

        var r = await Apply(a.Id, id);

        r.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await Json(r)).GetProperty("error").GetString().Should().Be("CHANGED_SINCE_OPENED");
        _factory.PythonAi.RebuildCalls.Should().BeEmpty();
        Proposals.Find(id, _userId, a.Id).Should().BeNull("it can never apply now");
    }

    [Test]
    public async Task Nobody_else_can_apply_a_suggestion_and_it_cannot_be_moved_to_another_report()
    {
        var a = await Seed();
        var other = await Seed();
        TheChatSuggests(TextChange);
        var id = await SuggestedId(a.Id);

        (await Apply(other.Id, id)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        TestAuthHandler.CurrentUserId = Guid.NewGuid();
        (await Apply(a.Id, id)).StatusCode.Should().Be(HttpStatusCode.NotFound);

        _factory.PythonAi.RebuildCalls.Should().BeEmpty();
        Proposals.Find(id, _userId, a.Id).Should().NotBeNull("the owner can still apply it");
    }

    [Test]
    public async Task When_the_drawn_chart_cannot_be_stored_nothing_is_saved()
    {
        var a = await Seed();
        TheChatSuggests(ChartChange);
        RebuildAppliesChanges(Original, """{"0": 1}""");
        var id = await SuggestedId(a.Id);
        _factory.StorageSvc.FailChartSaves = true;

        var r = await Apply(a.Id, id);

        r.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        _factory.Versions.All.Should().ContainSingle();
        _factory.StorageSvc.Saved.Should().BeEmpty();
        Proposals.Find(id, _userId, a.Id).Should().NotBeNull("it can be applied again in a moment");
    }

    [Test]
    public async Task Undo_goes_back_with_what_dig_added_carried_forward()
    {
        var a = await Seed();
        TheChatSuggests(ChartChange);
        var applied = Original.Replace("\"facts\"", "\"added\":{\"insights\":[],\"charts\":[{\"file\":1}]},\"facts\"");
        RebuildAppliesChanges(applied, """{"0": 1}""");
        (await Apply(a.Id, await SuggestedId(a.Id))).StatusCode.Should().Be(HttpStatusCode.OK);

        var r = await _client.PostAsJsonAsync($"/api/analyses/{a.Id}/report/restore", new { baseVersion = 2, version = 1 });

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var call = _factory.PythonAi.RebuildCalls.Last();
        call.EditedJson.Should().Be(Original);
        call.CurrentJson.Should().Contain("\"added\"");
        call.Warn.Should().BeFalse();
    }

    [Test]
    public async Task A_save_places_a_chart_dig_drew_with_its_stored_picture()
    {
        var a = await Seed();
        _factory.StorageSvc.Files[$"users/{_userId}/analyses/{a.Id}/chart_7.png"] = new byte[] { 7 };
        var withChart = Original.Replace("[{\"file\":0,\"insight\":\"i1\"}]", "[{\"file\":7},{\"file\":0}]");

        var r = await _client.PutAsync($"/api/analyses/{a.Id}/report", new StringContent(
            $$"""{"baseVersion": 1, "document": {{withChart}}}""", Encoding.UTF8, "application/json"));

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        _factory.PythonAi.RebuildCalls.Single().Charts.Keys.Should().BeEquivalentTo(new[] { 0, 7 });
    }

    [Test]
    public async Task Opening_the_report_gives_links_to_every_chart_it_places()
    {
        var a = await Seed();

        var body = await Json(await _client.GetAsync($"/api/analyses/{a.Id}/report"));

        body.GetProperty("pictures").GetProperty("0").GetString().Should().Contain($"{a.Id}/chart_0.png");
    }

    // ── Next steps ───────────────────────────────────────────────────────────

    [Test]
    public async Task Next_steps_come_from_the_report_and_what_dig_computed()
    {
        var a = await Seed();
        _factory.PythonAi.NextStepsJson = """{"steps": [{"kind": "ask", "what": "insight", "about": ["units"]}]}""";

        var r = await _client.GetAsync($"/api/analyses/{a.Id}/report/next-steps");

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Json(r)).GetProperty("steps")[0].GetProperty("about")[0].GetString().Should().Be("units");
        var call = _factory.PythonAi.NextStepsCalls.Single();
        call.DocumentJson.Should().Be(Original);
        call.ChatContextJson.Should().Contain("digest");
    }

    [Test]
    public async Task Without_an_editable_report_or_the_ai_service_there_are_no_next_steps_and_no_error()
    {
        var old = await Seed(editable: false);
        (await Json(await _client.GetAsync($"/api/analyses/{old.Id}/report/next-steps")))
            .GetProperty("steps").GetArrayLength().Should().Be(0);
        _factory.PythonAi.NextStepsCalls.Should().BeEmpty();

        var a = await Seed();
        _factory.PythonAi.SimulateDown = true;
        var r = await _client.GetAsync($"/api/analyses/{a.Id}/report/next-steps");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Json(r)).GetProperty("steps").GetArrayLength().Should().Be(0);
    }

    [Test]
    public async Task Someone_elses_next_steps_are_not_found()
    {
        var a = await Seed(owner: Guid.NewGuid());

        (await _client.GetAsync($"/api/analyses/{a.Id}/report/next-steps")).StatusCode
            .Should().Be(HttpStatusCode.NotFound);
    }

    // ── Drawing ──────────────────────────────────────────────────────────────

    [Test]
    public async Task A_drawn_chart_is_offered_like_a_suggestion_and_costs_no_question()
    {
        var a = await Seed();
        _factory.PythonAi.DrawJson = $$"""{"proposal": {{ProposalJson(ChartChange)}}}""";

        var r = await Draw(a.Id);

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var proposal = (await Json(r)).GetProperty("proposal");
        proposal.GetProperty("preview")[0].GetProperty("picture").GetString().Should().StartWith("data:image/png;base64,");
        var call = _factory.PythonAi.DrawCalls.Single();
        call.DocumentJson.Should().Be(Original);
        call.Label.Should().Be("Revenue by region");
        JsonDocument.Parse(call.ChartJson).RootElement.GetProperty("x").GetString().Should().Be("region");
        Encoding.UTF8.GetString(call.FileBytes).Should().StartWith("region,revenue");
        _factory.PythonAi.AskCalls.Should().BeEmpty();

        var quota = _factory.Services.GetRequiredService<ChatQuota>();
        quota.Remaining($"ask:{_userId}", 10).Should().Be(10);

        RebuildAppliesChanges(Original, """{"0": 1}""");
        (await Apply(a.Id, proposal.GetProperty("id").GetGuid())).StatusCode.Should().Be(HttpStatusCode.OK);
        _factory.StorageSvc.Files[$"users/{_userId}/analyses/{a.Id}/chart_1.png"].Should().Equal(Png);
    }

    [Test]
    public async Task A_chart_that_cannot_be_drawn_says_why()
    {
        var a = await Seed();
        _factory.PythonAi.DrawJson = """{"error": "x: 'region' is not a number column."}""";

        var r = await Draw(a.Id, new { type = "scatter", x = "region", y = "revenue" });

        r.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await Json(r)).GetProperty("message").GetString().Should().Contain("not a number column");
        Proposals.Count.Should().Be(0);
    }

    [Test]
    public async Task Without_the_data_file_nothing_is_drawn()
    {
        var a = await Seed(withData: false);

        var r = await Draw(a.Id);

        r.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        _factory.PythonAi.DrawCalls.Should().BeEmpty();
    }

    [Test]
    public async Task A_chart_with_no_title_or_a_long_one_is_refused_before_anything_runs()
    {
        var a = await Seed();

        (await Draw(a.Id, label: "")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await Draw(a.Id, label: new string('x', 121))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await _client.PostAsJsonAsync($"/api/analyses/{a.Id}/report/draw", new { chart = "bar", label = "x" }))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _factory.PythonAi.DrawCalls.Should().BeEmpty();
    }

    [Test]
    public async Task Someone_elses_report_cannot_be_drawn_on_and_a_down_ai_service_is_said_plainly()
    {
        var mine = await Seed();
        var theirs = await Seed(owner: Guid.NewGuid());

        (await Draw(theirs.Id)).StatusCode.Should().Be(HttpStatusCode.NotFound);

        _factory.PythonAi.SimulateDown = true;
        (await Draw(mine.Id)).StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }
}

/// <summary>Suggestions waiting to be applied: whose they are, and for how long.</summary>
[TestFixture]
public class ReportProposalsTests
{
    private static readonly IReadOnlyDictionary<int, byte[]> NoPictures = new Dictionary<int, byte[]>();

    [Test]
    public void A_suggestion_is_found_only_by_its_owner_for_its_report()
    {
        var store = new ReportProposals();
        var (owner, analysis) = (Guid.NewGuid(), Guid.NewGuid());
        var id = store.Add(owner, analysis, 3, "[]", NoPictures);

        store.Find(id, owner, analysis)!.BaseVersion.Should().Be(3);
        store.Find(id, Guid.NewGuid(), analysis).Should().BeNull();
        store.Find(id, owner, Guid.NewGuid()).Should().BeNull();
        store.Find(Guid.NewGuid(), owner, analysis).Should().BeNull();
    }

    [Test]
    public void A_suggestion_expires_after_an_hour()
    {
        var now = DateTime.UtcNow;
        var store = new ReportProposals(() => now);
        var (owner, analysis) = (Guid.NewGuid(), Guid.NewGuid());
        var id = store.Add(owner, analysis, 1, "[]", NoPictures);

        now += TimeSpan.FromMinutes(59);
        store.Find(id, owner, analysis).Should().NotBeNull();
        now += TimeSpan.FromMinutes(2);
        store.Find(id, owner, analysis).Should().BeNull();
        store.Count.Should().Be(0);
    }

    [Test]
    public void Only_a_persons_ten_newest_suggestions_are_kept()
    {
        var now = DateTime.UtcNow;
        var store = new ReportProposals(() => now);
        var (owner, analysis) = (Guid.NewGuid(), Guid.NewGuid());
        var ids = new List<Guid>();
        for (var k = 0; k < 12; k++)
        {
            now += TimeSpan.FromSeconds(1);
            ids.Add(store.Add(owner, analysis, 1, "[]", NoPictures));
        }
        var someoneElse = store.Add(Guid.NewGuid(), analysis, 1, "[]", NoPictures);

        ids.Take(2).Should().OnlyContain(id => store.Find(id, owner, analysis) == null);
        ids.Skip(2).Should().OnlyContain(id => store.Find(id, owner, analysis) != null);
        store.Count.Should().Be(11);
        someoneElse.Should().NotBeEmpty();
    }
}
