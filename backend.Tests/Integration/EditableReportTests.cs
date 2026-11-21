using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using backend.Application.Services;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// The report as a document its owner edits: saved as version 1 when the
/// analysis finishes, every save a new version with rebuilt files, two saves
/// from the same starting point never overwriting each other, and going back
/// to an older version without losing anything.
/// </summary>
[TestFixture]
public class EditableReportTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;
    private Guid _userId;

    private const string Original = """
    {"schema":1,"text":{"reportTitle":"Sales review"},"insights":[{"id":"i1","title":"North leads"}],
     "charts":[{"file":0,"insight":"i1"},{"file":2,"insight":null}],"questionAnswers":[],"facts":{"rowCount":600}}
    """;

    private static string Edited(string title) =>
        Original.Replace("\"Sales review\"", JsonSerializer.Serialize(title));

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
        _client.Dispose();
        _factory.Dispose();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Analysis SeedAnalysis(bool word = false, bool editable = true, Guid? owner = null)
    {
        var a = new Analysis(owner ?? _userId, "orders.csv", 2048);
        a.SetStatus("done");
        a.SetPdfPath($"users/{a.UserId}/analyses/{a.Id}/report.pdf");
        if (word) a.SetWordPath($"users/{a.UserId}/analyses/{a.Id}/report.docx");
        _factory.AnalysisRepo.Store.Add(a);
        _factory.StorageSvc.Files[$"users/{a.UserId}/analyses/{a.Id}/chart_0.png"] = new byte[] { 1, 2, 3 };
        _factory.StorageSvc.Files[$"users/{a.UserId}/analyses/{a.Id}/chart_2.png"] = new byte[] { 4, 5 };
        if (editable)
            _factory.Versions.TryInsertAsync(new ReportVersion(a.Id, 1, Original, null, ReportVersion.Written,
                                                               filesBuilt: true)).Wait();
        return a;
    }

    private Task<HttpResponseMessage> Save(Guid id, int baseVersion, string document) =>
        _client.PutAsync($"/api/analyses/{id}/report", new StringContent(
            $$"""{"baseVersion": {{baseVersion}}, "document": {{document}}}""", Encoding.UTF8, "application/json"));

    private Task<HttpResponseMessage> Restore(Guid id, int baseVersion, int version) =>
        _client.PostAsJsonAsync($"/api/analyses/{id}/report/restore", new { baseVersion, version });

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private string Saved(Analysis a, string name) =>
        Encoding.UTF8.GetString(_factory.StorageSvc.Saved[$"users/{a.UserId}/analyses/{a.Id}/{name}"]);

    // ── Opening ──────────────────────────────────────────────────────────────

    [Test]
    public async Task Opening_a_report_gives_the_newest_version_and_the_list()
    {
        var a = SeedAnalysis();

        var r = await _client.GetAsync($"/api/analyses/{a.Id}/report");

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await Json(r);
        body.GetProperty("editable").GetBoolean().Should().BeTrue();
        body.GetProperty("version").GetInt32().Should().Be(1);
        body.GetProperty("document").GetProperty("text").GetProperty("reportTitle").GetString()
            .Should().Be("Sales review");
        var versions = body.GetProperty("versions").EnumerateArray().ToList();
        versions.Should().ContainSingle();
        versions[0].GetProperty("byDig").GetBoolean().Should().BeTrue();
        versions[0].GetProperty("kind").GetString().Should().Be("written");
    }

    [Test]
    public async Task A_report_made_before_editing_says_so_rather_than_failing()
    {
        var a = SeedAnalysis(editable: false);

        var r = await _client.GetAsync($"/api/analyses/{a.Id}/report");

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Json(r)).GetProperty("editable").GetBoolean().Should().BeFalse();
    }

    [Test]
    public async Task Someone_elses_report_cannot_be_opened_or_saved()
    {
        var a = SeedAnalysis(owner: Guid.NewGuid());

        (await _client.GetAsync($"/api/analyses/{a.Id}/report")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Save(a.Id, 1, Edited("Mine now"))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        _factory.PythonAi.RebuildCalls.Should().BeEmpty();
        _factory.Versions.All.Should().ContainSingle();
    }

    // ── Saving ───────────────────────────────────────────────────────────────

    [Test]
    public async Task A_save_becomes_the_next_version_and_rebuilds_the_files()
    {
        var a = SeedAnalysis(word: true);

        var r = await Save(a.Id, 1, Edited("Edited review"));

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await Json(r);
        body.GetProperty("version").GetInt32().Should().Be(2);
        body.GetProperty("versions").GetArrayLength().Should().Be(2);

        var v2 = _factory.Versions.All.Single(v => v.Version == 2);
        v2.EditedBy.Should().Be(_userId);
        v2.Kind.Should().Be(ReportVersion.Edited);
        v2.FilesBuilt.Should().BeTrue();
        v2.Document.Should().Contain("Edited review");

        // The edit goes to the AI service with version 1 as the original, the
        // version it started from for the warnings, and the stored charts.
        var call = _factory.PythonAi.RebuildCalls.Single();
        call.OriginalJson.Should().Be(Original);
        call.EditedJson.Should().Contain("Edited review");
        call.CurrentJson.Should().Be(Original);
        call.WantWord.Should().BeTrue();
        call.WantPptx.Should().BeFalse("this analysis never had a presentation");
        call.Charts.Keys.Should().BeEquivalentTo(new[] { 0, 2 });
        call.Charts[2].Should().Equal(4, 5);

        Saved(a, "report.pdf").Should().Contain("Edited review");
        Saved(a, "report.docx").Should().Contain("Edited review");
        _factory.StorageSvc.Saved.Keys.Should().NotContain(k => k.EndsWith("report.pptx"));
    }

    [Test]
    public async Task The_chat_answers_from_the_edited_words_after_a_save()
    {
        var a = SeedAnalysis();

        await Save(a.Id, 1, Edited("Edited review"));

        var chat = await _factory.StorageSvc.ReadChatContextAsync(a.UserId, a.Id);
        chat.Should().Contain("Edited review");
    }

    [Test]
    public async Task A_save_from_an_older_version_is_combined_with_the_newer_one_not_written_over_it()
    {
        var a = SeedAnalysis();
        (await Save(a.Id, 1, Edited("First"))).StatusCode.Should().Be(HttpStatusCode.OK);

        // A second tab still showing version 1.
        var r = await Save(a.Id, 1, Edited("Second"));

        // The AI service is given the version it was made to, to combine the
        // two part by part (report_document.merge, tested in the AI service).
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var call = _factory.PythonAi.RebuildCalls.Last();
        call.BaseJson.Should().Be(Original);
        call.CurrentJson.Should().Contain("First");
        call.EditedJson.Should().Contain("Second");

        var body = await Json(r);
        body.GetProperty("version").GetInt32().Should().Be(3);
        var with = body.GetProperty("combinedWith").EnumerateArray().Single();
        with.GetProperty("byYou").GetBoolean().Should().BeTrue("the other tab was this person's own");
        _factory.Versions.All.Should().HaveCount(3);
    }

    [Test]
    public async Task A_save_with_nothing_saved_since_is_not_combined_with_anything()
    {
        var a = SeedAnalysis();

        var r = await Save(a.Id, 1, Edited("Only me"));

        _factory.PythonAi.RebuildCalls.Single().BaseJson.Should().BeNull();
        (await Json(r)).GetProperty("combinedWith").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Test]
    public async Task A_save_from_a_version_that_does_not_exist_is_refused_and_costs_nothing()
    {
        var a = SeedAnalysis();
        (await Save(a.Id, 1, Edited("First"))).StatusCode.Should().Be(HttpStatusCode.OK);

        foreach (var made in new[] { 0, 7 })
        {
            var r = await Save(a.Id, made, Edited("Second"));
            r.StatusCode.Should().Be(HttpStatusCode.Conflict);
            (await Json(r)).GetProperty("error").GetString().Should().Be("CHANGED_SINCE_OPENED");
        }
        _factory.Versions.All.Should().HaveCount(2);
        _factory.PythonAi.RebuildCalls.Should().HaveCount(1, "a refused save costs nothing");
    }

    [Test]
    public async Task Going_back_from_an_older_version_is_still_refused_not_combined()
    {
        var a = SeedAnalysis();
        (await Save(a.Id, 1, Edited("First"))).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Save(a.Id, 2, Edited("Second"))).StatusCode.Should().Be(HttpStatusCode.OK);

        // Going back is to the whole report as it was: from version 2's page, not 3's.
        var r = await Restore(a.Id, 2, 1);

        r.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await Json(r)).GetProperty("error").GetString().Should().Be("CHANGED_SINCE_OPENED");
        _factory.Versions.All.Should().HaveCount(3);
    }

    [Test]
    public async Task Two_saves_racing_for_the_same_number_store_one_and_refuse_the_other()
    {
        var a = SeedAnalysis();
        // The other save takes number 2 while this one's files are being built.
        _factory.PythonAi.RebuildReply = request =>
        {
            _factory.Versions.TryInsertAsync(new ReportVersion(a.Id, 2, Edited("Elsewhere"), Guid.NewGuid(),
                                                               ReportVersion.Edited)).Wait();
            return $$"""{"document": {{request.EditedJson}}, "pdf_report_base64": "UERG", "warnings": []}""";
        };

        var r = await Save(a.Id, 1, Edited("Here"));

        r.StatusCode.Should().Be(HttpStatusCode.Conflict);
        _factory.Versions.All.Single(v => v.Version == 2).Document.Should().Contain("Elsewhere");
        _factory.StorageSvc.Saved.Should().BeEmpty("the refused save's files must not replace the other's");
    }

    [Test]
    public async Task An_edit_the_ai_service_refuses_is_explained_and_not_saved()
    {
        var a = SeedAnalysis();
        _factory.PythonAi.RebuildReply = _ => """{"error": "no_insights"}""";

        var r = await Save(a.Id, 1, Edited("Nothing left"));

        r.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await Json(r)).GetProperty("error").GetString().Should().Be("no_insights");
        _factory.Versions.All.Should().ContainSingle();
    }

    [Test]
    public async Task When_the_files_cannot_be_rebuilt_nothing_is_saved_and_the_person_is_told()
    {
        var a = SeedAnalysis();
        _factory.PythonAi.SimulateDown = true;

        var r = await Save(a.Id, 1, Edited("Later"));

        r.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        (await Json(r)).GetProperty("message").GetString().Should().Contain("still here");
        _factory.Versions.All.Should().ContainSingle();
    }

    [Test]
    public async Task A_save_with_no_document_is_refused_before_anything_runs()
    {
        var a = SeedAnalysis();

        var r = await _client.PutAsJsonAsync($"/api/analyses/{a.Id}/report", new { baseVersion = 1 });

        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _factory.PythonAi.RebuildCalls.Should().BeEmpty();
    }

    [Test]
    public async Task A_report_made_before_editing_cannot_be_saved()
    {
        var a = SeedAnalysis(editable: false);

        var r = await Save(a.Id, 0, Edited("Anything"));

        r.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        _factory.PythonAi.RebuildCalls.Should().BeEmpty();
    }

    // ── Going back ───────────────────────────────────────────────────────────

    [Test]
    public async Task Going_back_saves_the_old_version_again_as_the_newest()
    {
        var a = SeedAnalysis();
        await Save(a.Id, 1, Edited("Edited review"));

        var r = await Restore(a.Id, 2, 1);

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Json(r)).GetProperty("version").GetInt32().Should().Be(3);
        var v3 = _factory.Versions.All.Single(v => v.Version == 3);
        v3.Kind.Should().Be(ReportVersion.Restored);
        v3.RestoredFrom.Should().Be(1);
        v3.Document.Should().Contain("Sales review");
        _factory.Versions.All.Should().HaveCount(3, "going back deletes nothing, so it can be undone too");

        var call = _factory.PythonAi.RebuildCalls.Last();
        call.EditedJson.Should().Be(Original);
        call.Warn.Should().BeFalse("figures DIG or the person already saved are not warned about again");
        call.CurrentJson.Should().Contain("Edited review", "what DIG added is carried forward from the newest version");
        Saved(a, "report.pdf").Should().Contain("Sales review");
    }

    [Test]
    public async Task Going_back_to_a_version_that_does_not_exist_changes_nothing()
    {
        var a = SeedAnalysis();

        var r = await Restore(a.Id, 1, 7);

        r.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Json(r)).GetProperty("error").GetString().Should().Be("NO_SUCH_VERSION");
        _factory.Versions.All.Should().ContainSingle();
    }

    [Test]
    public async Task Going_back_from_a_stale_page_is_refused()
    {
        var a = SeedAnalysis();
        await Save(a.Id, 1, Edited("Edited review"));

        (await Restore(a.Id, 1, 1)).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Test]
    public async Task The_original_and_the_newest_twenty_versions_are_kept()
    {
        var a = SeedAnalysis();
        for (var v = 1; v <= 25; v++)
            (await Save(a.Id, v, Edited($"Edit {v}"))).StatusCode.Should().Be(HttpStatusCode.OK);

        var kept = _factory.Versions.All.Where(x => x.AnalysisId == a.Id).Select(x => x.Version).OrderBy(x => x).ToList();
        kept.First().Should().Be(1);
        kept.Skip(1).Should().Equal(Enumerable.Range(7, 20));
        // Every edit still goes onto the original, which is never trimmed.
        _factory.PythonAi.RebuildCalls.Last().OriginalJson.Should().Be(Original);
    }

    // ── Files that missed their upload ───────────────────────────────────────

    [Test]
    public async Task Files_that_failed_to_upload_at_save_are_rebuilt_at_the_next_download()
    {
        var a = SeedAnalysis();
        _factory.StorageSvc.FailReportSaves = true;
        (await Save(a.Id, 1, Edited("Edited review"))).StatusCode.Should().Be(HttpStatusCode.OK);
        _factory.Versions.All.Single(v => v.Version == 2).FilesBuilt.Should().BeFalse();

        _factory.StorageSvc.FailReportSaves = false;
        var r = await _client.GetAsync($"/api/analyses/{a.Id}/download/report");

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        _factory.PythonAi.RebuildCalls.Should().HaveCount(2);
        _factory.PythonAi.RebuildCalls.Last().EditedJson.Should().Contain("Edited review");
        Saved(a, "report.pdf").Should().Contain("Edited review");
        _factory.Versions.All.Single(v => v.Version == 2).FilesBuilt.Should().BeTrue();
    }

    [Test]
    public async Task A_download_of_files_already_built_rebuilds_nothing()
    {
        var a = SeedAnalysis();
        await Save(a.Id, 1, Edited("Edited review"));

        await _client.GetAsync($"/api/analyses/{a.Id}/download/report");
        await _client.GetAsync($"/api/analyses/{a.Id}/download/cleaned");

        _factory.PythonAi.RebuildCalls.Should().HaveCount(1);
    }

    [Test]
    public async Task A_download_still_works_when_the_files_cannot_be_brought_up_to_date()
    {
        var a = SeedAnalysis();
        _factory.StorageSvc.FailReportSaves = true;
        await Save(a.Id, 1, Edited("Edited review"));
        _factory.PythonAi.SimulateDown = true;

        var r = await _client.GetAsync($"/api/analyses/{a.Id}/download/report");

        r.StatusCode.Should().Be(HttpStatusCode.OK, "the stored file is better than none");
    }

    [Test]
    public async Task An_emailed_report_is_the_newest_edit()
    {
        var a = SeedAnalysis();
        _factory.UserRepo.DefaultUser = User.Restore(_userId, "Test User", "user@example.com", "supabase-auth",
            null, null, true, true, DateTime.UtcNow.AddDays(-1), null, plan: "free", reportsUsed: 0,
            reportsResetAt: DateTime.UtcNow.AddDays(-1));
        _factory.StorageSvc.FailReportSaves = true;
        await Save(a.Id, 1, Edited("Edited review"));
        _factory.StorageSvc.FailReportSaves = false;

        var r = await _client.PostAsync($"/api/analyses/{a.Id}/email", null);

        r.StatusCode.Should().Be(HttpStatusCode.OK);
        Encoding.UTF8.GetString(_factory.EmailSvc.SentReports.Single().PdfBytes).Should().Contain("Edited review");
    }
}

/// <summary>
/// Version 1 is saved when the analysis finishes, from the document the AI
/// service returns, and never at the cost of the analysis itself.
/// </summary>
[TestFixture]
public class FirstReportVersionTests
{
    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_uploads");

    private FakeAnalysisRepository      _analyses = null!;
    private FakeStorageService          _storage  = null!;
    private FakePythonAiClient          _python   = null!;
    private FakeReportVersionRepository _versions = null!;
    private AnalysisService             _service  = null!;
    private Guid                        _userId;

    [SetUp]
    public void SetUp()
    {
        _analyses = new FakeAnalysisRepository();
        _storage  = new FakeStorageService();
        _python   = new FakePythonAiClient();
        _versions = new FakeReportVersionRepository();
        _service  = new AnalysisService(_analyses, _storage, _python, new FakeUserRepository(),
            new AnalysisGate(new AnalysisLimits()), NullLogger<AnalysisService>.Instance, versions: _versions);
        _userId = Guid.NewGuid();
        Directory.CreateDirectory(TempDir);
        File.WriteAllText(TempCsvPath, "a,b\n1,2\n3,4\n");
    }

    [TearDown]
    public void TearDown()
    {
        if (File.Exists(TempCsvPath)) File.Delete(TempCsvPath);
    }

    private string TempCsvPath => Path.Combine(TempDir, $"{_userId}.csv");

    private Task Run() => _service.RunAsync(_userId, "data.csv", 1024, rowCount: 2, columnCount: 2);

    [Test]
    public async Task The_report_dig_wrote_is_saved_as_version_one()
    {
        _python.ReportDocumentJson = """{"schema": 1, "text": {"reportTitle": "Sales review"}}""";

        await Run();

        var analysis = _analyses.Store.Single();
        analysis.Status.Should().Be("done");
        var v1 = _versions.All.Single();
        v1.AnalysisId.Should().Be(analysis.Id);
        v1.Version.Should().Be(1);
        v1.EditedBy.Should().BeNull("DIG wrote it");
        v1.Kind.Should().Be(ReportVersion.Written);
        v1.FilesBuilt.Should().BeTrue();
        JsonDocument.Parse(v1.Document).RootElement.GetProperty("text").GetProperty("reportTitle").GetString()
            .Should().Be("Sales review");
    }

    [Test]
    public async Task An_ai_service_from_before_editing_still_finishes_the_analysis()
    {
        _python.ReportDocumentJson = null;

        await Run();

        _analyses.Store.Single().Status.Should().Be("done");
        _versions.All.Should().BeEmpty();
    }

    [Test]
    public async Task A_database_without_the_versions_table_still_finishes_the_analysis()
    {
        _python.ReportDocumentJson = """{"schema": 1}""";
        _versions.SimulateMissingTable = true;

        await Run();

        _analyses.Store.Single().Status.Should().Be("done");
    }

    [Test]
    public void The_charts_a_document_places_are_read_from_it_and_nothing_else()
    {
        ReportService.ChartFiles("""{"charts": [{"file": 0}, {"file": 3}, {"file": 3}, {"file": 9}, {"file": "1"}, {}, {"file": 20}, {"file": -1}, {"file": 2.5}]}""")
            .Should().Equal(0, 3, 9);
        ReportService.ChartFiles("""{"charts": "none"}""").Should().BeEmpty();
        ReportService.ChartFiles("{}").Should().BeEmpty();
    }
}
