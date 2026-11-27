using System.Security.Claims;
using System.Text;
using System.Text.Json;
using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Controllers;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// The admin page's sharp edges (QA 2026-11-27): an admin could demote or
/// delete themselves and lock everyone out, moving a paying customer to Free
/// left their Stripe subscription charging them, hand-given Pro was counted as
/// income, and the health panel answered "ok" without trying anything.
/// </summary>
[TestFixture]
public class AdminSafetyTests
{
    private ManyUsers       _users  = null!;
    private RecordingStripe _stripe = null!;
    private Guid            _me;

    [SetUp]
    public void SetUp()
    {
        _users  = new ManyUsers();
        _stripe = new RecordingStripe();
        _me     = _users.Add("owner", "admin");
    }

    private AdminController Controller() => new(_users, new FakeAnalysisRepository(), NullLogger<AdminController>.Instance)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", _me.ToString()) }, "test")),
            },
        },
    };

    private IServiceProvider Services(FakePythonAiClient? ai = null) => new ServiceCollection()
        .AddSingleton<IStripeService>(_stripe)
        .AddSingleton<IStorageService>(new FakeStorageService())
        .AddSingleton<IPythonAiClient>(ai ?? new FakePythonAiClient())
        .BuildServiceProvider();

    private AccountDeletion Deletion() => new(
        _users, new FakeStorageService(), new FakeTeamRepository(), new FakeWorkspaceRepository(),
        _stripe, new FakeAuthAdmin());

    private static JsonElement Json(object? value) => JsonSerializer.SerializeToElement(value);

    private static string ErrorOf(IActionResult result) =>
        Json(result.Should().BeOfType<ConflictObjectResult>().Subject.Value).GetProperty("error").GetString()!;

    // ── Locking yourself out ──────────────────────────────────────────────────

    [Test]
    public async Task An_admin_cannot_remove_their_own_admin()
    {
        var result = await Controller().SetPlan(_me, new AdminSetPlanRequest("free"), Services());

        ErrorOf(result).Should().Be("SELF");
        _users.PlanChanges.Should().BeEmpty();
    }

    [Test]
    public async Task Another_admin_can_be_moved_while_one_admin_stays()
    {
        var other = _users.Add("second", "admin");

        var result = await Controller().SetPlan(other, new AdminSetPlanRequest("pro"), Services());

        result.Should().BeOfType<OkObjectResult>();
        _users.PlanChanges.Should().ContainSingle().Which.Should().Be((other, "pro"));
    }

    [Test]
    public async Task An_admin_cannot_delete_their_own_account_here()
    {
        var result = await Controller().DeleteUser(_me, Deletion());

        ErrorOf(result).Should().Be("SELF");
        _users.Deleted.Should().BeEmpty();
    }

    [Test]
    public async Task Someone_else_can_still_be_deleted()
    {
        var other = _users.Add("someone", "free");

        var result = await Controller().DeleteUser(other, Deletion());

        result.Should().BeOfType<NoContentResult>();
        _users.Deleted.Should().Equal(other);
    }

    // ── Paying customers ──────────────────────────────────────────────────────

    [Test]
    public async Task A_paying_customer_is_not_moved_to_Free_without_a_yes()
    {
        var payer = _users.Add("payer", "pro", subscription: "sub_123");

        var result = await Controller().SetPlan(payer, new AdminSetPlanRequest("free"), Services());

        ErrorOf(result).Should().Be("PAYING_CUSTOMER");
        _stripe.Cancelled.Should().BeEmpty();
        _users.PlanChanges.Should().BeEmpty();
    }

    [Test]
    public async Task With_a_yes_the_subscription_is_cancelled_and_the_plan_set()
    {
        var payer = _users.Add("payer", "pro", subscription: "sub_123");

        var result = await Controller().SetPlan(payer,
            new AdminSetPlanRequest("free", CancelSubscription: true), Services());

        result.Should().BeOfType<OkObjectResult>();
        _stripe.Cancelled.Should().Equal("sub_123");
        _users.PlanChanges.Should().ContainSingle().Which.Should().Be((payer, "free"));
    }

    [Test]
    public async Task Hand_given_Pro_goes_back_to_Free_without_Stripe()
    {
        var friend = _users.Add("friend", "pro");

        var result = await Controller().SetPlan(friend, new AdminSetPlanRequest("free"), Services());

        result.Should().BeOfType<OkObjectResult>();
        _stripe.Cancelled.Should().BeEmpty();
    }

    [Test]
    public async Task A_missing_account_is_a_404_not_a_silent_ok()
    {
        var result = await Controller().SetPlan(Guid.NewGuid(), new AdminSetPlanRequest("pro"), Services());
        result.Should().BeOfType<NotFoundObjectResult>();
    }

    // ── Income ────────────────────────────────────────────────────────────────

    [Test]
    public async Task Only_paying_Pro_accounts_count_as_income()
    {
        _users.Add("payer", "pro", subscription: "sub_1");
        _users.Add("friend", "pro");

        var ok = (await Controller().GetAnalytics()).Should().BeOfType<OkObjectResult>().Subject;
        var users = Json(ok.Value).GetProperty("users");

        users.GetProperty("pro").GetInt32().Should().Be(2);
        users.GetProperty("paying").GetInt32().Should().Be(1);
        users.GetProperty("estimatedMrrUsd").GetDecimal().Should().Be(9.99m);
    }

    // ── Health ────────────────────────────────────────────────────────────────

    private static IConfiguration Config(string? stripeKey) => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?> { ["Stripe:SecretKey"] = stripeKey })
        .Build();

    private static Dictionary<string, JsonElement> Checks(IActionResult result)
    {
        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        return Json(ok.Value).GetProperty("checks").EnumerateArray()
            .ToDictionary(c => c.GetProperty("name").GetString()!, c => c);
    }

    [Test]
    public async Task Health_tries_each_service()
    {
        var checks = Checks(await Controller().Health(Services(), Config("sk_live_x")));

        checks.Keys.Should().BeEquivalentTo("Database", "File storage", "Payments", "AI service");
        checks.Values.Should().OnlyContain(c => c.GetProperty("ok").GetBoolean());
        checks["Payments"].GetProperty("note").GetString().Should().Be("live mode");
    }

    [Test]
    public async Task Health_says_which_service_is_down_and_why()
    {
        var ai = new FakePythonAiClient { SimulateDown = true };

        var checks = Checks(await Controller().Health(Services(ai), Config(null)));

        checks["AI service"].GetProperty("ok").GetBoolean().Should().BeFalse();
        checks["Payments"].GetProperty("ok").GetBoolean().Should().BeFalse();
        checks["Payments"].GetProperty("note").GetString().Should().Contain("No Stripe key");
        checks["Database"].GetProperty("ok").GetBoolean().Should().BeTrue();
    }

    // ── Fakes ─────────────────────────────────────────────────────────────────

    private sealed class ManyUsers : IUserRepository
    {
        private readonly Dictionary<Guid, User> _all = new();
        public List<(Guid, string)> PlanChanges { get; } = new();
        public List<Guid> Deleted { get; } = new();

        public Guid Add(string name, string plan, string? subscription = null)
        {
            var id = Guid.NewGuid();
            _all[id] = User.Restore(id, name, $"{name}@dig.test", "supabase-auth", null, null, true, true,
                DateTime.UtcNow.AddDays(-10), null, plan: plan, stripeSubscriptionId: subscription);
            return id;
        }

        public Task<User?> GetByIdAsync(Guid id) => Task.FromResult(_all.GetValueOrDefault(id));
        public Task<User?> GetByEmailAsync(string email) =>
            Task.FromResult(_all.Values.FirstOrDefault(u => u.Email == email));
        public Task<User?> GetByStripeCustomerIdAsync(string id) => Task.FromResult<User?>(null);
        public Task<List<User>> GetAllAsync() => Task.FromResult(_all.Values.ToList());
        public Task AddAsync(User user) => Task.CompletedTask;
        public Task UpdateAsync(User user) => Task.CompletedTask;
        public Task DeleteAsync(Guid id) { Deleted.Add(id); _all.Remove(id); return Task.CompletedTask; }
        public Task SetPlanAsync(Guid userId, string plan, DateTime? planExpiresAt, string? stripeSubscriptionId)
        { PlanChanges.Add((userId, plan)); return Task.CompletedTask; }
        public Task SetStripeCustomerIdAsync(Guid userId, string customerId) => Task.CompletedTask;
        public Task IncrementReportUsageAsync(Guid userId) => Task.CompletedTask;
        public Task ResetReportQuotaAsync(Guid userId) => Task.CompletedTask;
        public Task UpdateLastActiveAsync(Guid userId) => Task.CompletedTask;
    }

    private sealed class RecordingStripe : NoOpStripeService, IStripeService
    {
        public List<string> Cancelled { get; } = new();
        Task IStripeService.CancelSubscriptionAsync(string subscriptionId)
        { Cancelled.Add(subscriptionId); return Task.CompletedTask; }
    }
}

/// <summary>
/// Visits counted without cookies (QA item 28): what is written down, what is
/// skipped, and that a visitor can't be followed from one day to the next.
/// </summary>
[TestFixture]
public class VisitCountingTests
{
    [TestCase("/", "/")]
    [TestCase("/Plans/", "/plans")]
    [TestCase("/workspace/0b6c2f1e-6a1d-4e7a-9a43-2f0f5c1d7b11?tab=chat", "/workspace/:id")]
    [TestCase("/invite/Zx9_aB3kLmN0pQrStUvWxYz12", "/invite/:id")]
    [TestCase("/register#top", "/register")]
    public void Pages_are_stored_without_ids_or_queries(string raw, string stored) =>
        VisitCounter.PagePath(raw).Should().Be(stored);

    [TestCase("/admin")]
    [TestCase("/api/visits")]
    [TestCase("https://evil.example/x")]
    [TestCase("")]
    [TestCase("/<script>")]
    public void Some_paths_are_not_counted(string raw) => VisitCounter.PagePath(raw).Should().BeNull();

    [TestCase("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", true)]
    [TestCase("curl/8.4.0", true)]
    [TestCase("", true)]
    [TestCase("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36", false)]
    public void Robots_are_not_visitors(string ua, bool bot) => VisitCounter.IsBot(ua).Should().Be(bot);

    private static readonly string[] Own = { "datainsightgen.com", "vercel.app" };

    [TestCase("https://www.google.com/search?q=dig", "google.com")]
    [TestCase("https://www.datainsightgen.com/plans", "")]
    [TestCase("https://dig-git-main.vercel.app/", "")]
    [TestCase("android-app://com.slack", "")]
    [TestCase("not a url", "")]
    public void Sources_are_other_sites_only(string referrer, string source) =>
        VisitCounter.Source(referrer, Own).Should().Be(source);

    [Test]
    public void A_visitor_counts_once_a_day_per_page_and_is_new_again_tomorrow()
    {
        var now = new DateTime(2026, 11, 27, 10, 0, 0, DateTimeKind.Utc);
        var counter = new VisitCounter(() => now);

        counter.Note("1.2.3.4", "Chrome", "/").Should().Be((new DateOnly(2026, 11, 27), true, true));
        counter.Note("1.2.3.4", "Chrome", "/").Should().Be((new DateOnly(2026, 11, 27), false, false));
        counter.Note("1.2.3.4", "Chrome", "/plans").Should().Be((new DateOnly(2026, 11, 27), true, false));
        counter.Note("5.6.7.8", "Chrome", "/").Should().Be((new DateOnly(2026, 11, 27), true, true));

        now = now.AddDays(1);
        counter.Note("1.2.3.4", "Chrome", "/").Should().Be((new DateOnly(2026, 11, 28), true, true));
    }

    private sealed class Recorded : IVisitRepository
    {
        public List<(DateOnly Day, string Path, string Source, bool NewToPage, bool NewToSite)> Calls { get; } = new();
        public List<VisitTotal> Rows { get; } = new();
        public Task RecordAsync(DateOnly day, string path, string source, bool newToPage, bool newToSite)
        { Calls.Add((day, path, source, newToPage, newToSite)); return Task.CompletedTask; }
        public Task<List<VisitTotal>> GetSinceAsync(DateOnly since) =>
            Task.FromResult(Rows.Where(r => r.Day >= since).ToList());
    }

    private const string Chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

    private static VisitsController Beacon(Recorded repo, string body, string ua = Chrome,
        params (string Name, string Value)[] headers)
    {
        var http = new DefaultHttpContext();
        http.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(body));
        http.Request.Headers.UserAgent = ua;
        foreach (var (name, value) in headers) http.Request.Headers[name] = value;
        http.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("10.0.0.1");
        return new VisitsController(new VisitCounter(), repo, NullLogger<VisitsController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
    }

    [Test]
    public async Task A_page_view_is_recorded_without_its_token()
    {
        var repo = new Recorded();
        await Beacon(repo, """{"p":"/invite/Zx9_aB3kLmN0pQrStUvWxYz12","r":"https://www.linkedin.com/feed"}""").Seen();

        repo.Calls.Should().ContainSingle();
        repo.Calls[0].Path.Should().Be("/invite/:id");
        repo.Calls[0].Source.Should().Be("linkedin.com");
    }

    [TestCase("DNT")]
    [TestCase("Sec-GPC")]
    public async Task Do_not_track_is_honoured(string header)
    {
        var repo = new Recorded();
        await Beacon(repo, """{"p":"/"}""", Chrome, (header, "1")).Seen();
        repo.Calls.Should().BeEmpty();
    }

    [Test]
    public async Task Robots_and_rubbish_are_not_recorded()
    {
        var repo = new Recorded();
        await Beacon(repo, """{"p":"/"}""", "Googlebot/2.1").Seen();
        await Beacon(repo, "not json").Seen();
        await Beacon(repo, """{"p":"/admin"}""").Seen();
        repo.Calls.Should().BeEmpty();
    }

    [Test]
    public async Task The_admin_page_gets_daily_totals_top_pages_and_sources()
    {
        var users = new FakeUserRepository();
        var me = Guid.NewGuid();
        users.DefaultUser = User.Restore(me, "owner", "owner@dig.test", "supabase-auth", null, null, true, true,
            DateTime.UtcNow.AddDays(-30), null, plan: "admin");
        var admin = new AdminController(users, new FakeAnalysisRepository(), NullLogger<AdminController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", me.ToString()) }, "test")),
                },
            },
        };
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var repo = new Recorded();
        repo.Rows.AddRange(new[]
        {
            new VisitTotal(today, "*", "", 12, 5),
            new VisitTotal(today.AddDays(-1), "*", "", 8, 3),
            new VisitTotal(today.AddDays(-40), "*", "", 99, 99),   // outside the window
            new VisitTotal(today, "/", "", 7, 4),
            new VisitTotal(today, "/", "google.com", 3, 2),
            new VisitTotal(today, "/plans", "", 2, 1),
        });

        var ok = (await admin.GetVisits(repo, days: 30)).Should().BeOfType<OkObjectResult>().Subject;
        var body = JsonSerializer.SerializeToElement(ok.Value);

        body.GetProperty("today").GetProperty("views").GetInt32().Should().Be(12);
        body.GetProperty("total").GetProperty("visitors").GetInt32().Should().Be(8);
        body.GetProperty("perDay").GetArrayLength().Should().Be(30);
        var top = body.GetProperty("topPages")[0];
        top.GetProperty("path").GetString().Should().Be("/");
        top.GetProperty("views").GetInt32().Should().Be(10);
        body.GetProperty("topSources")[0].GetProperty("source").GetString().Should().Be("google.com");
    }
}
