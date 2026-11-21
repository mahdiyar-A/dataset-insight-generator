using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// The report edited by a team: who may read and who may edit it, saves named
/// by who made them, two people's saves combined or refused when they changed
/// the same part, and every save announced to the pages that have it open.
/// </summary>
[TestFixture]
public class TeamEditsReportTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;

    private Guid _owner, _teamOwner, _editor, _viewer, _outsider;
    private Team _team = null!;
    private SharedWorkspace _workspace = null!;
    private Analysis _analysis = null!;

    private const string Original = """
    {"schema":1,"text":{"reportTitle":"Sales review"},"insights":[{"id":"i1","title":"North leads"}],
     "charts":[{"file":0,"insight":"i1"}],"questionAnswers":[],"facts":{"rowCount":600}}
    """;

    private static string Edited(string title) =>
        Original.Replace("\"Sales review\"", JsonSerializer.Serialize(title));

    [SetUp]
    public void SetUp()
    {
        _factory  = new TestWebApplicationFactory();
        _client   = _factory.CreateClient();
        _owner    = Guid.NewGuid();
        _teamOwner = Guid.NewGuid();
        _editor   = Guid.NewGuid();
        _viewer   = Guid.NewGuid();
        _outsider = Guid.NewGuid();

        // The analysis is _owner's; _teamOwner's team has it shared with it.
        _analysis = new Analysis(_owner, "orders.csv", 2048);
        _analysis.SetStatus("done");
        _analysis.SetPdfPath($"users/{_owner}/analyses/{_analysis.Id}/report.pdf");
        _factory.AnalysisRepo.Store.Add(_analysis);
        _factory.StorageSvc.Files[$"users/{_owner}/analyses/{_analysis.Id}/chart_0.png"] = new byte[] { 1, 2, 3 };
        _factory.Versions.TryInsertAsync(new ReportVersion(_analysis.Id, 1, Original, null, ReportVersion.Written,
                                                           filesBuilt: true)).Wait();

        _team = new Team(_teamOwner, "Analysts");
        _factory.TeamRepo.Team = _team;
        foreach (var (user, role) in new[] { (_teamOwner, "owner"), (_owner, "editor"), (_editor, "editor"),
                                             (_viewer, "viewer") })
        {
            _factory.TeamRepo.Members.Add(user);
            _factory.TeamRepo.MemberRows.Add(new TeamMember(_team.Id, user, role));
        }
        _workspace = new SharedWorkspace(_team.Id, _analysis.Id, _owner);
        _factory.WorkspaceRepo.Workspace = _workspace;
        _factory.WorkspaceRepo.InTeam = u => _factory.TeamRepo.Members.Contains(u);

        _factory.UserRepo.Names[_owner]  = "ada";
        _factory.UserRepo.Names[_editor] = "sara";
        _factory.UserRepo.Names[_viewer] = "vic";

        TestAuthHandler.IsAuthenticated = true;
        As(_owner);
    }

    [TearDown]
    public void TearDown()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private void As(Guid user) => TestAuthHandler.CurrentUserId = user;

    private Task<HttpResponseMessage> Open() => _client.GetAsync($"/api/analyses/{_analysis.Id}/report");

    private Task<HttpResponseMessage> Save(int baseVersion, string document) =>
        _client.PutAsync($"/api/analyses/{_analysis.Id}/report", new StringContent(
            $$"""{"baseVersion": {{baseVersion}}, "document": {{document}}}""", Encoding.UTF8, "application/json"));

    private Task<HttpResponseMessage> Restore(int baseVersion, int version) =>
        _client.PostAsJsonAsync($"/api/analyses/{_analysis.Id}/report/restore", new { baseVersion, version });

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private void NoAccess(Guid user, string fileType) =>
        _factory.WorkspaceRepo.Permissions.Add(new WorkspaceFilePermission(_workspace.Id, user, fileType, "none", _owner));

    // ── Who may read, who may edit ───────────────────────────────────────────

    [Test]
    public async Task An_editor_in_the_team_opens_the_report_and_may_edit_it()
    {
        As(_editor);

        var r = await Open();

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await Json(r);
        body.GetProperty("canEdit").GetBoolean().Should().BeTrue();
        body.GetProperty("document").GetProperty("text").GetProperty("reportTitle").GetString().Should().Be("Sales review");
    }

    [Test]
    public async Task An_editors_save_is_kept_as_theirs_with_the_files_stored_under_the_owner()
    {
        As(_editor);

        var r = await Save(1, Edited("Review by Sara"));

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var v2 = _factory.Versions.All.Single(v => v.Version == 2);
        v2.EditedBy.Should().Be(_editor);
        v2.Document.Should().Contain("Review by Sara");
        _factory.StorageSvc.Saved.Keys.Should().Contain($"users/{_owner}/analyses/{_analysis.Id}/report.pdf");
        _factory.PythonAi.RebuildCalls.Single().Charts.Keys.Should().Equal(0);
    }

    [Test]
    public async Task The_owner_of_the_team_may_edit_a_report_someone_else_shared()
    {
        As(_teamOwner);

        (await Json(await Open())).GetProperty("canEdit").GetBoolean().Should().BeTrue();
        (await Save(1, Edited("Review by the team owner"))).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Test]
    public async Task A_viewer_reads_the_report_but_cannot_save_or_go_back()
    {
        As(_viewer);

        var opened = await Json(await Open());
        opened.GetProperty("canEdit").GetBoolean().Should().BeFalse();

        var save = await Save(1, Edited("Review by Vic"));
        save.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await Json(save)).GetProperty("error").GetString().Should().Be("READ_ONLY");
        (await Restore(1, 1)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        _factory.Versions.All.Should().ContainSingle();
        _factory.PythonAi.RebuildCalls.Should().BeEmpty("a refused save costs nothing");
        _factory.ReportLive.Sent.Should().BeEmpty();
    }

    [Test]
    public async Task Someone_outside_the_team_cannot_open_or_save_it()
    {
        As(_outsider);

        (await Open()).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Save(1, Edited("Mine now"))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        _factory.Versions.All.Should().ContainSingle();
    }

    [Test]
    public async Task Someone_removed_from_the_team_loses_the_report_at_once()
    {
        As(_editor);
        (await Open()).StatusCode.Should().Be(HttpStatusCode.OK);

        await _factory.TeamRepo.RemoveMemberAsync(_team.Id, _editor);

        (await Open()).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Save(1, Edited("Too late"))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [TestCase("pdf")]
    [TestCase("all")]
    public async Task An_editor_set_to_no_access_for_the_report_cannot_open_it(string fileType)
    {
        NoAccess(_editor, fileType);
        As(_editor);

        (await Open()).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Save(1, Edited("Review by Sara"))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task Access_to_the_pdf_counts_over_no_access_to_all_files()
    {
        NoAccess(_editor, "all");
        _factory.WorkspaceRepo.Permissions.Add(new WorkspaceFilePermission(_workspace.Id, _editor, "pdf", "view", _owner));
        As(_editor);

        (await Open()).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Test]
    public async Task No_access_to_other_files_does_not_close_the_report()
    {
        NoAccess(_editor, "cleaned_csv");
        As(_editor);

        (await Open()).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Test]
    public async Task The_owner_of_the_analysis_edits_it_whatever_the_team_says()
    {
        NoAccess(_owner, "all");

        (await Json(await Open())).GetProperty("canEdit").GetBoolean().Should().BeTrue();
    }

    // ── Who saved what ───────────────────────────────────────────────────────

    [Test]
    public async Task The_versions_say_who_saved_each_one_by_name_and_never_by_address()
    {
        As(_editor);
        await Save(1, Edited("Review by Sara"));

        As(_owner);
        var raw = await (await Open()).Content.ReadAsStringAsync();
        var versions = JsonDocument.Parse(raw).RootElement.GetProperty("versions").EnumerateArray().ToList();

        var sara = versions.Single(v => v.GetProperty("version").GetInt32() == 2);
        sara.GetProperty("byName").GetString().Should().Be("sara");
        sara.GetProperty("byYou").GetBoolean().Should().BeFalse();
        raw.Should().NotContain("@example.com");

        var dig = versions.Single(v => v.GetProperty("version").GetInt32() == 1);
        dig.GetProperty("byDig").GetBoolean().Should().BeTrue();
    }

    [Test]
    public async Task Your_own_saves_say_you_not_your_name()
    {
        As(_editor);
        await Save(1, Edited("Review by Sara"));

        var mine = (await Json(await Open())).GetProperty("versions").EnumerateArray()
            .Single(v => v.GetProperty("version").GetInt32() == 2);
        mine.GetProperty("byYou").GetBoolean().Should().BeTrue();
        mine.GetProperty("byName").ValueKind.Should().Be(JsonValueKind.Null);
    }

    // ── Two people saving ────────────────────────────────────────────────────

    [Test]
    public async Task A_save_made_while_a_teammate_saved_is_combined_and_says_with_whom()
    {
        As(_editor);
        (await Save(1, Edited("Review by Sara"))).StatusCode.Should().Be(HttpStatusCode.OK);

        As(_owner);
        var r = await Save(1, Edited("Review by Ada"));

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        _factory.PythonAi.RebuildCalls.Last().BaseJson.Should().Be(Original);
        var with = (await Json(r)).GetProperty("combinedWith").EnumerateArray().Single();
        with.GetProperty("name").GetString().Should().Be("sara");
        with.GetProperty("byYou").GetBoolean().Should().BeFalse();
        _factory.Versions.All.Single(v => v.Version == 3).EditedBy.Should().Be(_owner);
    }

    [Test]
    public async Task Both_changing_the_same_part_is_refused_naming_the_part_and_who_changed_it()
    {
        As(_editor);
        (await Save(1, Edited("Review by Sara"))).StatusCode.Should().Be(HttpStatusCode.OK);
        _factory.PythonAi.RebuildReply = _ =>
            """{"error": "same_part", "parts": [{"section": "reportTitle"}]}""";

        As(_owner);
        var r = await Save(1, Edited("Review by Ada"));

        r.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await Json(r);
        body.GetProperty("error").GetString().Should().Be("SAME_PART_CHANGED");
        body.GetProperty("version").GetInt32().Should().Be(2);
        body.GetProperty("parts").EnumerateArray().Single().GetProperty("section").GetString()
            .Should().Be("reportTitle");
        body.GetProperty("savedBy").EnumerateArray().Single().GetProperty("name").GetString().Should().Be("sara");

        _factory.Versions.All.Should().HaveCount(2, "nothing is saved over the teammate's words");
        _factory.StorageSvc.Saved.Keys.Count(k => k.EndsWith("report.pdf")).Should().Be(1);
        _factory.ReportLive.Sent.Should().ContainSingle("only the teammate's save happened");
    }

    // ── Telling the pages ────────────────────────────────────────────────────

    [Test]
    public async Task Every_save_is_announced_with_who_made_it()
    {
        As(_editor);
        await Save(1, Edited("Review by Sara"));
        As(_owner);
        await Restore(2, 1);

        _factory.ReportLive.Sent.Should().Equal(
            new FakeReportLive.Notice(_analysis.Id, 2, _editor, "sara"),
            new FakeReportLive.Notice(_analysis.Id, 3, _owner, "ada"));
    }

    [Test]
    public async Task A_save_stands_when_it_cannot_be_announced()
    {
        _factory.ReportLive.Fail = true;
        As(_editor);

        var r = await Save(1, Edited("Review by Sara"));

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        _factory.Versions.All.Should().HaveCount(2);
    }

    [Test]
    public async Task A_refused_save_is_not_announced()
    {
        _factory.PythonAi.RebuildReply = _ => """{"error": "no_insights"}""";
        As(_editor);

        (await Save(1, Edited("Review by Sara"))).StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        _factory.ReportLive.Sent.Should().BeEmpty();
    }

    // ── What stays the owner's ───────────────────────────────────────────────

    [Test]
    public async Task Next_steps_and_drawing_charts_stay_with_the_owner_for_now()
    {
        As(_editor);

        (await _client.GetAsync($"/api/analyses/{_analysis.Id}/report/next-steps"))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);
        var draw = await _client.PostAsJsonAsync($"/api/analyses/{_analysis.Id}/report/draw",
            new { chart = new { type = "bar", x = "region", y = "revenue" }, label = "Revenue by region" });
        draw.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
