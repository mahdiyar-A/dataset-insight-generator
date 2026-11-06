using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Domain.Entities;
using backend.Infrastructure.Http;
using backend.Infrastructure.Repositories;
using backend.Infrastructure.Storage;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using NUnit.Framework;
using System.Net;

namespace backend.Tests.Integration;

/// <summary>
/// The Delete Account button. The privacy page and terms promise it removes the
/// account record, the analyses and every stored file. It used to set a flag
/// in memory and log the person out, leaving everything in place.
/// </summary>
[TestFixture]
public class AccountDeletionTests
{
    private sealed class RecordingStripe : NoOpStripeServiceBase
    {
        public List<string> Cancelled { get; } = new();
        public override Task CancelSubscriptionAsync(string subscriptionId)
        {
            Cancelled.Add(subscriptionId);
            return Task.CompletedTask;
        }
    }

    private abstract class NoOpStripeServiceBase : IStripeService
    {
        private readonly NoOpStripeService _inner = new();
        public Task<string> GetOrCreateCustomerAsync(Guid u, string e, string n) => _inner.GetOrCreateCustomerAsync(u, e, n);
        public Task<string> CreateCheckoutSessionAsync(string c, string s, string x) => _inner.CreateCheckoutSessionAsync(c, s, x);
        public Task<string> CreateBillingPortalSessionAsync(string c, string r) => _inner.CreateBillingPortalSessionAsync(c, r);
        public Task<StripeWebhookResult> HandleWebhookAsync(string p, string s) => _inner.HandleWebhookAsync(p, s);
        public abstract Task CancelSubscriptionAsync(string subscriptionId);
    }

    private FakeSupabase _supabase = null!;
    private RecordingStripe _stripe = null!;
    private AccountDeletion _deletion = null!;
    private Guid _userId;

    private string _plan = "free";
    private string? _subscription;
    private int _authStatus = 200;
    private int _bucketStatus = 200;

    [SetUp]
    public void SetUp()
    {
        _supabase = new FakeSupabase();
        _stripe   = new RecordingStripe();
        _userId   = Guid.NewGuid();
        _plan = "free"; _subscription = null; _authStatus = 200; _bucketStatus = 200;

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Supabase:Url"]        = _supabase.Url,
                ["Supabase:SecretKey"]  = "test-secret-key",
                ["Supabase:BucketName"] = "dig_files",
            })
            .Build();

        // The real repositories, storage service and auth call: the order that
        // matters here is the order of requests the live services would see.
        _deletion = new AccountDeletion(
            new UserRepository(_supabase.Client),
            new SupabaseStorageService(_supabase.Client, config),
            new TeamRepository(_supabase.Client),
            new WorkspaceRepository(_supabase.Client),
            _stripe,
            new SupabaseAuthAdmin(new HttpClient(), config));

        _supabase.Reply = Answer;
    }

    [TearDown]
    public void TearDown() => _supabase.Dispose();

    private (int, string) Answer(FakeSupabase.Seen r)
    {
        if (r.Path.Contains("/auth/v1/admin/users/"))
            return (_authStatus, "{}");

        if (r.Path.EndsWith("/storage/v1/object/list/dig_files"))
        {
            if (_bucketStatus != 200) return (_bucketStatus, """{"message":"unavailable"}""");
            var isTop = r.Text.Contains($"\"prefix\":\"users/{_userId}\"") || r.Text.Contains($"\"prefix\":\"users/{_userId}/\"");
            return (200, isTop
                ? """[{"name":"profile.png","id":"1"},{"name":"analyses","id":null}]"""
                : """[]""");
        }
        if (r.Path.Contains("/storage/v1/object/"))
            return (200, "[]");

        if (r.Method == "GET" && r.Path.EndsWith("/rest/v1/users"))
        {
            var subscription = _subscription == null ? "null" : $"\"{_subscription}\"";
            return (200, $$"""
                {"id":"{{_userId}}","first_name":"Ada","last_name":"King","email":"ada@example.com",
                 "password_hash":"supabase-auth","plan":"{{_plan}}","stripe_subscription_id":{{subscription}},
                 "reports_used":0,"reports_reset_at":"2026-01-01T00:00:00+00:00",
                 "created_at":"2026-01-01T00:00:00+00:00"}
                """);
        }
        if (r.Method == "GET" && r.Path.EndsWith("/rest/v1/annotations"))
            return (200, $$"""
                [{"id":"{{Guid.NewGuid()}}","shared_workspace_id":"{{Guid.NewGuid()}}","user_id":"{{_userId}}",
                  "file_type":"pdf","content":"x","created_at":"2026-01-01T00:00:00+00:00",
                  "updated_at":"2026-01-01T00:00:00+00:00"}]
                """);

        return (200, "[]");
    }

    private int Step(Func<FakeSupabase.Seen, bool> match)
    {
        var requests = _supabase.Requests.ToList();
        return requests.FindIndex(r => match(r));
    }

    private int FilesRemoved    => Step(r => r.Method == "DELETE" && r.Path.EndsWith("/storage/v1/object/dig_files"));
    private int RepliesRemoved  => Step(r => r.Method == "DELETE" && r.Path.EndsWith("/rest/v1/annotations"));
    private int InvitesCleared  => Step(r => r.Method == "PATCH" && r.Path.EndsWith("/rest/v1/team_invites"));
    private int RowRemoved      => Step(r => r.Method == "DELETE" && r.Path.EndsWith("/rest/v1/users"));
    private int SignInRemoved   => Step(r => r.Method == "DELETE" && r.Path.EndsWith($"/auth/v1/admin/users/{_userId}"));

    [Test]
    public async Task Everything_goes_in_an_order_the_database_will_accept()
    {
        await _deletion.DeleteAsync(_userId);

        FilesRemoved.Should().BeGreaterThanOrEqualTo(0, "the files have to go");
        RepliesRemoved.Should().BeGreaterThan(FilesRemoved);
        InvitesCleared.Should().BeGreaterThan(RepliesRemoved);
        RowRemoved.Should().BeGreaterThan(InvitesCleared, "the database refuses it while those still point at the user");
        SignInRemoved.Should().BeGreaterThan(RowRemoved);
    }

    [Test]
    public async Task Every_file_under_the_account_is_removed()
    {
        await _deletion.DeleteAsync(_userId);

        var remove = _supabase.Requests[FilesRemoved];
        remove.Text.Should().Contain($"users/{_userId}/profile.png");
    }

    [Test]
    public async Task The_sign_in_record_call_carries_the_secret_key_both_ways()
    {
        await _deletion.DeleteAsync(_userId);

        var call = _supabase.Requests[SignInRemoved];
        call.Headers["apikey"].Should().Be("test-secret-key");
        call.Headers["Authorization"].Should().Be("Bearer test-secret-key");
    }

    [Test]
    public async Task A_pro_subscription_is_cancelled_so_nobody_is_billed_for_a_deleted_account()
    {
        _plan = "pro";
        _subscription = "sub_123";

        await _deletion.DeleteAsync(_userId);

        _stripe.Cancelled.Should().ContainSingle().Which.Should().Be("sub_123");
    }

    [Test]
    public async Task An_old_subscription_id_on_a_free_account_is_left_alone()
    {
        _subscription = "sub_old";

        await _deletion.DeleteAsync(_userId);

        _stripe.Cancelled.Should().BeEmpty();
    }

    [Test]
    public async Task If_the_files_cannot_be_reached_the_account_stays()
    {
        _bucketStatus = 503;

        var attempt = async () => await _deletion.DeleteAsync(_userId);

        await attempt.Should().ThrowAsync<Exception>();
        RowRemoved.Should().Be(-1, "a row deleted now would strand the files for good");
        SignInRemoved.Should().Be(-1);
    }

    [Test]
    public async Task A_sign_in_record_that_is_already_gone_is_not_a_failure()
    {
        _authStatus = 404;

        await _deletion.DeleteAsync(_userId);

        RowRemoved.Should().BeGreaterThanOrEqualTo(0);
    }

    [Test]
    public async Task A_failed_sign_in_removal_is_reported_so_the_person_can_retry()
    {
        _authStatus = 500;

        var attempt = async () => await _deletion.DeleteAsync(_userId);

        await attempt.Should().ThrowAsync<HttpRequestException>();
    }
}

/// <summary>
/// Downloads from a shared workspace. They went through the owner-only route,
/// so every teammate got "not found" on files they had been given.
/// </summary>
[TestFixture]
public class WorkspaceDownloadTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;
    private Guid _member;
    private SharedWorkspace _workspace = null!;

    [SetUp]
    public void SetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();
        _member  = Guid.NewGuid();
        TestAuthHandler.CurrentUserId   = _member;
        TestAuthHandler.IsAuthenticated = true;

        var owner = Guid.NewGuid();
        var analysis = Analysis.Restore(
            Guid.NewGuid(), owner, "sales.csv", 10, "done", DateTime.UtcNow,
            originalCsv: "users/o/original.csv", pdfPath: "users/o/report.pdf", wordPath: "users/o/report.docx");
        _factory.AnalysisRepo.Store.Add(analysis);

        _workspace = new SharedWorkspace(Guid.NewGuid(), analysis.Id, owner);
        _factory.WorkspaceRepo.Workspace = _workspace;
        _factory.TeamRepo.Members.Add(_member);
    }

    [TearDown]
    public void TearDown()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private void Set(string file, string permission) => _factory.WorkspaceRepo.Permissions.Add(
        new WorkspaceFilePermission(_workspace.Id, _member, file, permission, _workspace.SharedBy));

    private Task<HttpResponseMessage> Get(string file) =>
        _client.GetAsync($"/api/workspaces/{_workspace.Id}/download/{file}");

    [TestCase("pdf", "report.pdf")]
    [TestCase("word", "report.docx")]
    [TestCase("original_csv", "original.csv")]
    public async Task A_teammate_gets_the_owners_file(string file, string stored)
    {
        var response = await Get(file);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync()).Should().Contain(stored);
    }

    [Test]
    public async Task Someone_outside_the_team_gets_nothing()
    {
        _factory.TeamRepo.Members.Clear();

        (await Get("pdf")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Test]
    public async Task A_file_set_to_none_stays_closed_even_when_called_directly()
    {
        Set("pdf", "none");

        (await Get("pdf")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await Get("word")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Test]
    public async Task A_rule_for_one_file_beats_the_rule_for_all_files()
    {
        Set("all", "none");
        Set("pdf", "view");

        (await Get("pdf")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Get("word")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Test]
    public async Task A_file_the_run_never_made_says_so()
    {
        (await Get("pptx")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}

/// <summary>The same flow through the HTTP route, with the wiring the app really uses.</summary>
[TestFixture]
public class AccountRoutesTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;
    private Guid _userId;

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
        TestAuthHandler.IsAuthenticated = true;
        _client.Dispose();
        _factory.Dispose();
    }

    private void Picture(string? stored) => _factory.UserRepo.DefaultUser = User.Restore(
        _userId, "user", "user@example.com", "supabase-auth",
        stored, null, true, true, DateTime.UtcNow.AddDays(-10), null,
        plan: "free", reportsUsed: 0, reportsResetAt: DateTime.UtcNow);

    [Test]
    public async Task Delete_account_really_deletes()
    {
        Picture(null);

        var response = await _client.DeleteAsync("/api/user/me");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        _factory.UserRepo.DefaultUser.Should().BeNull();
        _factory.AuthAdmin.Deleted.Should().ContainSingle().Which.Should().Be(_userId);
    }

    [Test]
    public async Task A_failure_says_try_again_and_gives_nothing_away()
    {
        Picture(null);
        _factory.StorageSvc.FailUserFileDeletion = true;

        var response = await _client.DeleteAsync("/api/user/me");

        response.StatusCode.Should().Be(HttpStatusCode.BadGateway);
        var text = await response.Content.ReadAsStringAsync();
        text.Should().Contain("try again").And.NotContain("Exception");
        _factory.UserRepo.DefaultUser.Should().NotBeNull();
        _factory.AuthAdmin.Deleted.Should().BeEmpty();
    }

    [Test]
    public async Task A_stored_picture_reaches_the_browser_as_a_url_it_can_load()
    {
        Picture($"users/{_userId}/profile.png");

        var text = await _client.GetStringAsync("/api/user/me");

        var picture = System.Text.Json.JsonDocument.Parse(text).RootElement.GetProperty("profilePicture").GetString();
        picture.Should().StartWith("https://", "the bucket is private, so a bare path never loads");
    }

    [Test]
    public async Task Removing_a_picture_clears_the_row_and_the_file()
    {
        var stored = $"users/{_userId}/profile.png";
        Picture(stored);

        var response = await _client.DeleteAsync("/api/user/me/profile-picture");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        _factory.UserRepo.DefaultUser!.ProfilePicture.Should().BeNull();
        _factory.StorageSvc.DeletedFiles.Should().ContainSingle().Which.Should().Be(stored);
    }
}
