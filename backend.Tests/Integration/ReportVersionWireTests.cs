using backend.Domain.Entities;
using backend.Infrastructure.Repositories;
using backend.Tests.Helpers;
using FluentAssertions;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// What the report_versions repository sends to Supabase and reads back,
/// through the real client library. The table is migration 005.
/// </summary>
[TestFixture]
public class ReportVersionWireTests
{
    private FakeSupabase _supabase = null!;
    private ReportVersionRepository _repo = null!;

    [SetUp]
    public void SetUp()
    {
        _supabase = new FakeSupabase();
        _repo = new ReportVersionRepository(_supabase.Client);
    }

    [TearDown]
    public void TearDown() => _supabase.Dispose();

    private FakeSupabase.Seen Last(string method) =>
        _supabase.Requests.Last(r => r.Path.EndsWith("/rest/v1/report_versions") && r.Method == method);

    [Test]
    public async Task A_version_is_stored_with_its_document_as_json_not_as_a_string()
    {
        var analysisId = Guid.NewGuid();
        await _repo.TryInsertAsync(new ReportVersion(analysisId, 1, """{"schema":1,"text":{"reportTitle":"Q"}}""",
                                                     null, ReportVersion.Written, filesBuilt: true));

        var sent = JToken.Parse(Last("POST").Text);
        var row = sent is JArray list ? (JObject)list[0] : (JObject)sent;
        row["document"]!.Type.Should().Be(JTokenType.Object);
        row["document"]!["text"]!["reportTitle"]!.Value<string>().Should().Be("Q");
        row["analysis_id"]!.Value<string>().Should().Be(analysisId.ToString());
        row["version"]!.Value<int>().Should().Be(1);
        row["edited_by"]!.Type.Should().Be(JTokenType.Null);
        row["kind"]!.Value<string>().Should().Be("written");
        row["files_built"]!.Value<bool>().Should().BeTrue();
        // The document is not sent back: a save does not need it.
        Last("POST").Headers["Prefer"].Should().Contain("return=minimal");
    }

    [Test]
    public async Task A_number_already_taken_reads_as_someone_saved_first()
    {
        _supabase.Reply = _ => (409, """{"code":"23505","details":"Key (analysis_id, version)=(x, 2) already exists.","hint":null,"message":"duplicate key value violates unique constraint"}""");

        var stored = await _repo.TryInsertAsync(new ReportVersion(Guid.NewGuid(), 2, "{}", Guid.NewGuid(),
                                                                  ReportVersion.Edited));

        stored.Should().BeFalse();
    }

    [Test]
    public async Task Any_other_database_error_is_not_mistaken_for_a_conflict()
    {
        _supabase.Reply = _ => (500, """{"code":"XX000","message":"internal error"}""");

        var act = () => _repo.TryInsertAsync(new ReportVersion(Guid.NewGuid(), 2, "{}", null, ReportVersion.Edited));

        await act.Should().ThrowAsync<Exception>();
    }

    [Test]
    public async Task The_newest_version_is_read_with_its_document()
    {
        var analysisId = Guid.NewGuid();
        _supabase.Reply = _ => (200, $$$"""
            [{"id":"{{{Guid.NewGuid()}}}","analysis_id":"{{{analysisId}}}","version":4,
              "document":{"schema":1,"text":{"reportTitle":"Q"}},"edited_by":null,"kind":"restored",
              "restored_from":2,"files_built":false,"created_at":"2026-11-15T10:00:00+00:00"}]
            """);

        var latest = await _repo.GetLatestAsync(analysisId);

        latest!.Version.Should().Be(4);
        JObject.Parse(latest.Document)["text"]!["reportTitle"]!.Value<string>().Should().Be("Q");
        latest.Kind.Should().Be("restored");
        latest.RestoredFrom.Should().Be(2);
        latest.FilesBuilt.Should().BeFalse();
        var query = Uri.UnescapeDataString(Last("GET").Query);
        query.Should().Contain($"analysis_id=eq.{analysisId}");
        query.Should().Contain("order=version.desc");
        query.Should().Contain("limit=1");
    }

    [Test]
    public async Task The_version_list_leaves_the_documents_behind()
    {
        await _repo.ListAsync(Guid.NewGuid());

        var query = Uri.UnescapeDataString(Last("GET").Query);
        query.Should().Contain("select=");
        query.Should().NotContain("document");
    }

    [Test]
    public async Task Trimming_never_touches_version_one_or_the_newest_kept()
    {
        var analysisId = Guid.NewGuid();

        await _repo.TrimAsync(analysisId, newest: 25, keep: 20);

        var query = Uri.UnescapeDataString(Last("DELETE").Query);
        query.Should().Contain($"analysis_id=eq.{analysisId}");
        query.Should().Contain("version=gt.1");
        query.Should().Contain("version=lt.6");
    }

    [Test]
    public async Task Trimming_with_nothing_old_enough_sends_nothing()
    {
        await _repo.TrimAsync(Guid.NewGuid(), newest: 21, keep: 20);

        _supabase.Requests.Should().NotContain(r => r.Method == "DELETE");
    }

    [Test]
    public async Task Marking_files_built_changes_that_version_only()
    {
        var analysisId = Guid.NewGuid();

        await _repo.MarkFilesBuiltAsync(analysisId, 3);

        var request = Last("PATCH");
        var query = Uri.UnescapeDataString(request.Query);
        query.Should().Contain($"analysis_id=eq.{analysisId}");
        query.Should().Contain("version=eq.3");
        JObject.Parse(request.Text)["files_built"]!.Value<bool>().Should().BeTrue();
    }
}
