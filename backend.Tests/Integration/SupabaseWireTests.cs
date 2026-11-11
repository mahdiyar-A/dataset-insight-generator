using backend.Domain.Entities;
using backend.Infrastructure.Repositories;
using backend.Infrastructure.Storage;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// What the real client library sends to, and reads from, Supabase, checked
/// against the live project's rules. The constants below are copied from the
/// live database and bucket: if those change, change them here too.
/// </summary>
[TestFixture]
public class SupabaseWireTests
{
    private FakeSupabase _supabase = null!;

    // Columns the live database refuses a null for. A column default does not
    // help: the client sends an explicit null, and that is what gets checked.
    private static readonly Dictionary<string, string[]> Required = new()
    {
        ["users"] = new[]
        {
            "id", "first_name", "last_name", "email", "password_hash", "plan",
            "reports_used", "reports_reset_at", "last_active_at", "session_timeout_minutes",
        },
        ["analyses"] = new[] { "id", "user_id", "file_name", "file_size_bytes", "status", "created_at" },
    };

    // storage.buckets.allowed_mime_types for dig_files.
    private static readonly string[] BucketAllows =
    {
        "text/csv", "text/plain",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "image/png", "image/jpeg", "image/webp",
        "application/pdf", "application/octet-stream",
    };

    [SetUp]
    public void SetUp() => _supabase = new FakeSupabase();

    [TearDown]
    public void TearDown() => _supabase.Dispose();

    private static void NoNullInRequired(string table, JObject row)
    {
        foreach (var column in Required[table])
        {
            if (row.TryGetValue(column, out var value))
                value.Type.Should().NotBe(JTokenType.Null,
                    $"{table}.{column} is NOT NULL in the live database");
        }
    }

    private FakeSupabase.Seen Write(string table) =>
        _supabase.Requests.Last(r => r.Path.EndsWith($"/rest/v1/{table}") && r.Method != "GET");

    private static JObject Row(FakeSupabase.Seen request)
    {
        var token = JToken.Parse(request.Text);
        return token is JArray list ? (JObject)list[0] : (JObject)token;
    }

    // ── Sign-up ───────────────────────────────────────────────────────────────

    [Test]
    public async Task A_new_sign_up_sends_nothing_the_users_table_refuses()
    {
        var user = User.CreateWithId(Guid.NewGuid(), "Ada Lovelace", "ada@example.com", "supabase-auth");

        await new UserRepository(_supabase.Client).AddAsync(user);

        NoNullInRequired("users", Row(Write("users")));
    }

    [Test]
    public async Task A_missing_row_reads_as_nothing_not_as_an_error()
    {
        _supabase.Reply = _ => (406, """{"code":"PGRST116","details":"The result contains 0 rows","hint":null,"message":"JSON object requested, multiple (or no) rows returned"}""");

        var user = await new UserRepository(_supabase.Client).GetByIdAsync(Guid.NewGuid());

        user.Should().BeNull();
    }

    // ── Profile ───────────────────────────────────────────────────────────────

    [Test]
    public async Task Saving_a_profile_with_no_phone_or_picture_works()
    {
        var user = User.CreateWithId(Guid.NewGuid(), "Ada Lovelace", "ada@example.com", "supabase-auth");
        user.UpdateUserName("Ada King");

        await new UserRepository(_supabase.Client).UpdateAsync(user);

        var row = Row(Write("users"));
        row["first_name"]!.Value<string>().Should().Be("Ada");
        row["last_name"]!.Value<string>().Should().Be("King");
    }

    // ── Plans ─────────────────────────────────────────────────────────────────

    [Test]
    public async Task Going_back_to_free_clears_the_renewal_date_and_subscription()
    {
        // Risk: empty values were skipped, so a cancelled customer kept their
        // old renewal date and the plan page said "Free" over "Renews <date>".
        await new UserRepository(_supabase.Client).SetPlanAsync(Guid.NewGuid(), "free", null, null);

        var row = Row(Write("users"));
        row["plan"]!.Value<string>().Should().Be("free");
        row["plan_expires_at"]!.Type.Should().Be(JTokenType.Null);
        row["stripe_subscription_id"]!.Type.Should().Be(JTokenType.Null);
    }

    [Test]
    public async Task A_payment_without_a_date_keeps_the_known_renewal_date()
    {
        // A paid invoice carries no period end; the subscription event has it.
        await new UserRepository(_supabase.Client).SetPlanAsync(Guid.NewGuid(), "pro", null, "sub_1");

        var row = Row(Write("users"));
        row.ContainsKey("plan_expires_at").Should().BeFalse();
        row["stripe_subscription_id"]!.Value<string>().Should().Be("sub_1");
    }

    // ── Analyses ──────────────────────────────────────────────────────────────

    [Test]
    public async Task A_new_analysis_sends_nothing_the_analyses_table_refuses()
    {
        var analysis = new Analysis(Guid.NewGuid(), "sales.parquet", 1234);
        analysis.SetShape(10, 4);
        analysis.SetStatus("processing");

        await new AnalysisRepository(_supabase.Client).UpsertAsync(analysis);

        NoNullInRequired("analyses", Row(Write("analyses")));
    }

    [Test]
    public async Task Finishing_an_analysis_saves_every_path_and_the_status_in_one_write()
    {
        await new AnalysisRepository(_supabase.Client).UpdateStatusAsync(
            Guid.NewGuid(), "done", "cleaned.csv", "report.pdf", "report.docx", "report.pptx");

        var row = Row(Write("analyses"));
        row["status"]!.Value<string>().Should().Be("done");
        row["completed_at"]!.Type.Should().NotBe(JTokenType.Null);
        row["cleaned_csv_path"]!.Value<string>().Should().Be("cleaned.csv");
        row["pdf_report_path"]!.Value<string>().Should().Be("report.pdf");
        row["word_report_path"]!.Value<string>().Should().Be("report.docx");
        row["pptx_report_path"]!.Value<string>().Should().Be("report.pptx");
    }

    [Test]
    public async Task Usage_saves_the_cost_and_tokens_together()
    {
        await new AnalysisRepository(_supabase.Client).UpdateUsageAsync(
            Guid.NewGuid(), 0.0123m, 1000, 200, "{}");

        var row = Row(Write("analyses"));
        row["cost_usd"]!.Value<decimal>().Should().Be(0.0123m);
        row["tokens_in"]!.Value<long>().Should().Be(1000);
        row["tokens_out"]!.Value<long>().Should().Be(200);
        row["usage_json"]!.Value<string>().Should().Be("{}");
    }

    [TestCase(0, true)]
    [TestCase(14, true)]
    [TestCase(16, false)]
    public async Task A_run_cut_off_by_a_restart_stops_counting_as_in_progress(int minutesAgo, bool stillActive)
    {
        var userId = Guid.NewGuid();
        // Written the way PostgREST writes a timestamptz.
        var when = DateTime.UtcNow.AddMinutes(-minutesAgo).ToString("yyyy-MM-dd'T'HH:mm:ss.ffffff") + "+00:00";
        _supabase.Reply = _ => (200, $$"""
            [{"id":"{{Guid.NewGuid()}}","user_id":"{{userId}}","file_name":"a.csv","file_size_bytes":5,
              "status":"processing","created_at":"{{when}}"}]
            """);

        var active = await new AnalysisRepository(_supabase.Client).GetActiveAsync(userId);

        (active != null).Should().Be(stillActive);
    }

    // chart_urls and customization are jsonb columns held as text in the code.
    // Everything the code writes comes back as a JSON string, which is what the
    // two old rows in datasets show. Anything else in there must not stop a
    // user's whole history from loading.
    [TestCase("\"[{\\\"type\\\":\\\"bar\\\"}]\"", "[{\"type\":\"bar\"}]")]
    [TestCase("null", null)]
    [TestCase("[{\"type\":\"bar\"}]", "[{\"type\":\"bar\"}]")]
    [TestCase("{\"tone\":\"formal\"}", "{\"tone\":\"formal\"}")]
    public async Task History_reads_a_json_column_whatever_shape_it_holds(string stored, string? expected)
    {
        var userId = Guid.NewGuid();
        var row = $$"""
            [{"id":"{{Guid.NewGuid()}}","user_id":"{{userId}}","file_name":"a.csv","file_size_bytes":5,
              "status":"done","created_at":"2026-11-05T10:00:00+00:00",
              "chart_urls":{{stored}},"customization":{{stored}}}]
            """;
        _supabase.Reply = _ => (200, row);

        var history = await new AnalysisRepository(_supabase.Client).GetHistoryAsync(userId);

        history.Should().ContainSingle();
        history[0].ChartUrls.Should().Be(expected);
        history[0].Customization.Should().Be(expected);
    }

    // ── File storage ──────────────────────────────────────────────────────────

    private SupabaseStorageService Storage()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Supabase:BucketName"] = "dig_files" })
            .Build();
        _supabase.Reply = _ => (200, """{"Key":"dig_files/x","Id":"1"}""");
        return new SupabaseStorageService(_supabase.Client, config);
    }

    private void EveryUploadIsAllowed()
    {
        var uploads = _supabase.Requests.Where(r => r.Path.Contains("/storage/v1/object/")).ToList();
        uploads.Should().NotBeEmpty();
        foreach (var upload in uploads)
            BucketAllows.Should().Contain(upload.Headers["Content-Type"].Split(';')[0].Trim(),
                $"the bucket refuses any other type, and {upload.Path} has to get in");
    }

    [Test]
    public async Task Every_file_an_analysis_produces_is_a_type_the_bucket_accepts()
    {
        var storage = Storage();
        var (user, run) = (Guid.NewGuid(), Guid.NewGuid());
        var bytes = new byte[] { 1, 2, 3 };

        await storage.SaveCleanedCsvAsync(user, run, bytes);
        await storage.SavePdfReportAsync(user, run, bytes);
        await storage.SaveWordReportAsync(user, run, bytes);
        await storage.SavePptxReportAsync(user, run, bytes);
        await storage.SaveChartAsync(user, run, 0, bytes);
        await storage.SaveChatContextAsync(user, run, "{}");

        EveryUploadIsAllowed();
    }

    [Test]
    public async Task Every_upload_format_is_a_type_the_bucket_accepts()
    {
        var storage = Storage();
        var (user, run) = (Guid.NewGuid(), Guid.NewGuid());

        foreach (var ext in backend.Application.Services.FileFormats.Extensions)
            await storage.SaveOriginalFileAsync(user, run, new byte[] { 1 }, $"data{ext}");

        EveryUploadIsAllowed();
    }

    // ── Shared workspaces ─────────────────────────────────────────────────────

    [Test]
    public async Task A_workspace_keeps_its_id_and_date_when_read_back()
    {
        var (id, team, analysis, by) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        _supabase.Reply = _ => (200, $$"""
            [{"id":"{{id}}","team_id":"{{team}}","analysis_id":"{{analysis}}","shared_by":"{{by}}",
              "shared_at":"2026-01-02T03:04:05+00:00"}]
            """);

        var read = await new WorkspaceRepository(_supabase.Client).GetTeamWorkspacesAsync(team);

        read.Should().ContainSingle();
        read[0].Id.Should().Be(id);
        read[0].SharedAt.Year.Should().Be(2026);
        read[0].SharedAt.Month.Should().Be(1);
    }

    [Test]
    public async Task Annotations_keep_their_ids_thread_and_resolved_state()
    {
        var (workspace, user, parent, reply) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        _supabase.Reply = _ => (200, $$"""
            [{"id":"{{parent}}","shared_workspace_id":"{{workspace}}","user_id":"{{user}}","file_type":"pdf",
              "content":"look here","position":null,"created_at":"2026-01-02T03:04:05+00:00",
              "updated_at":"2026-01-02T03:04:05+00:00","resolved_at":"2026-01-03T03:04:05+00:00","parent_id":null},
             {"id":"{{reply}}","shared_workspace_id":"{{workspace}}","user_id":"{{user}}","file_type":"pdf",
              "content":"agreed","position":null,"created_at":"2026-01-02T04:04:05+00:00",
              "updated_at":"2026-01-02T04:04:05+00:00","resolved_at":null,"parent_id":"{{parent}}"}]
            """);

        var read = await new WorkspaceRepository(_supabase.Client).GetAnnotationsAsync(workspace);

        read.Should().ContainSingle();
        read[0].Id.Should().Be(parent);
        read[0].ResolvedAt.Should().NotBeNull();
        read[0].CreatedAt.Year.Should().Be(2026);
        read[0].Replies.Should().ContainSingle().Which.Id.Should().Be(reply);
    }

    [Test]
    public async Task Permissions_keep_their_id_and_who_granted_them()
    {
        var (id, workspace, user, by) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        _supabase.Reply = _ => (200, $$"""
            [{"id":"{{id}}","shared_workspace_id":"{{workspace}}","user_id":"{{user}}","file_type":"pdf",
              "permission":"edit","granted_by":"{{by}}","updated_at":"2026-01-02T03:04:05+00:00"}]
            """);

        var read = await new WorkspaceRepository(_supabase.Client).GetPermissionsAsync(workspace);

        read.Should().ContainSingle();
        read[0].Id.Should().Be(id);
        read[0].GrantedBy.Should().Be(by);
        read[0].UpdatedAt.Year.Should().Be(2026);
    }

    [Test]
    public async Task Changing_a_permission_again_updates_the_row_it_already_has()
    {
        var (id, workspace, user, by) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        _supabase.Reply = r => r.Method == "GET"
            ? (200, $$"""
                [{"id":"{{id}}","shared_workspace_id":"{{workspace}}","user_id":"{{user}}","file_type":"pdf",
                  "permission":"view","granted_by":"{{by}}","updated_at":"2026-01-02T03:04:05+00:00"}]
                """)
            : (200, "[]");

        await new WorkspaceRepository(_supabase.Client).SetPermissionAsync(
            new WorkspaceFilePermission(workspace, user, "pdf", "edit", by));

        var write = Write("workspace_file_permissions");
        write.Method.Should().Be("PATCH", "a second row for the same person and file breaks a unique rule");
        write.Query.Should().Contain(id.ToString());
        Row(write)["permission"]!.Value<string>().Should().Be("edit");
    }

    [Test]
    public async Task Sharing_an_analysis_twice_gives_back_the_workspace_it_already_has()
    {
        var (id, team, analysis, by) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        _supabase.Reply = _ => (200, $$"""
            [{"id":"{{id}}","team_id":"{{team}}","analysis_id":"{{analysis}}","shared_by":"{{by}}",
              "shared_at":"2026-01-02T03:04:05+00:00"}]
            """);

        var shared = await new WorkspaceRepository(_supabase.Client).ShareAnalysisAsync(
            new SharedWorkspace(team, analysis, by));

        shared.Id.Should().Be(id);
        _supabase.Requests.Should().OnlyContain(r => r.Method == "GET");
    }

    [Test]
    public async Task A_comment_with_replies_can_be_deleted()
    {
        var (id, workspace, user) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        _supabase.Reply = r => r.Method == "GET"
            ? (200, $$"""
                [{"id":"{{id}}","shared_workspace_id":"{{workspace}}","user_id":"{{user}}","file_type":"pdf",
                  "content":"x","created_at":"2026-01-02T03:04:05+00:00","updated_at":"2026-01-02T03:04:05+00:00"}]
                """)
            : (200, "[]");

        await new WorkspaceRepository(_supabase.Client).DeleteAnnotationAsync(id, user);

        var deletes = _supabase.Requests.Where(r => r.Method == "DELETE").ToList();
        deletes.Should().HaveCount(2);
        deletes[0].Query.Should().Contain("parent_id", "the database refuses to delete a comment that has replies");
        deletes[1].Query.Should().Contain($"id=eq.{id}");
    }

    [Test]
    public async Task Someone_elses_comment_is_left_alone_with_its_replies()
    {
        await new WorkspaceRepository(_supabase.Client).DeleteAnnotationAsync(Guid.NewGuid(), Guid.NewGuid());

        _supabase.Requests.Should().OnlyContain(r => r.Method == "GET");
    }

    [Test]
    public async Task Clearing_an_inviter_sends_an_empty_value_not_a_failure()
    {
        await new TeamRepository(_supabase.Client).ClearInviterAsync(Guid.NewGuid());

        Row(Write("team_invites"))["invited_by"]!.Type.Should().Be(JTokenType.Null);
    }

    [Test]
    public async Task A_team_member_keeps_the_date_they_joined()
    {
        var (id, team, user) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        _supabase.Reply = _ => (200, $$"""
            [{"id":"{{id}}","team_id":"{{team}}","user_id":"{{user}}","role":"editor",
              "joined_at":"2026-01-02T03:04:05+00:00"}]
            """);

        var read = await new TeamRepository(_supabase.Client).GetMembersAsync(team);

        read.Should().ContainSingle();
        read[0].Id.Should().Be(id);
        read[0].JoinedAt.Year.Should().Be(2026);
        read[0].Role.Should().Be("editor");
    }
}
