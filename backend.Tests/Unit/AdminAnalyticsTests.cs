using System.Security.Claims;
using backend.Controllers;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;
using System.Text.Json;

namespace backend.Tests.Unit;

/// <summary>
/// GET /api/admin/analytics — the owner's cost and usage view.
///
/// Two properties matter: only an admin can read it (it aggregates every
/// user's activity), and the aggregates are honest — in particular, runs that
/// predate cost telemetry must not be averaged in as free.
/// </summary>
[TestFixture]
public class AdminAnalyticsTests
{
    private FakeUserRepository     _users    = null!;
    private FakeAnalysisRepository _analyses = null!;
    private FakeStorageService     _storage  = null!;
    private Guid                   _callerId;

    [SetUp]
    public void SetUp()
    {
        _users    = new FakeUserRepository();
        _analyses = new FakeAnalysisRepository();
        _storage  = new FakeStorageService();
        _callerId = Guid.NewGuid();
    }

    private AdminController Controller(string callerPlan)
    {
        _users.DefaultUser = User.Restore(
            _callerId, "owner", "owner@dig.test", "supabase-auth",
            null, null, true, true,
            DateTime.UtcNow.AddDays(-30), null,
            plan: callerPlan);

        var controller = new AdminController(
            _users, _analyses, _storage, NullLogger<AdminController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                        new[] { new Claim("sub", _callerId.ToString()) }, "test")),
                },
            },
        };
        return controller;
    }

    private void Seed(string status, DateTime createdAt, decimal? costUsd = null,
        long? tokensIn = null, long? tokensOut = null)
    {
        _analyses.Store.Add(Analysis.Restore(
            id: Guid.NewGuid(), userId: Guid.NewGuid(),
            fileName: "f.csv", fileSizeBytes: 10,
            status: status, createdAt: createdAt,
            costUsd: costUsd, tokensIn: tokensIn, tokensOut: tokensOut));
    }

    private static JsonElement Body(IActionResult result)
    {
        var ok = result.Should().BeOfType<OkObjectResult>().Subject;
        return JsonSerializer.SerializeToElement(ok.Value);
    }

    [Test]
    public async Task NonAdmin_IsForbidden()
    {
        // Risk: this endpoint aggregates every user's activity and spend.
        var result = await Controller("pro").GetAnalytics();
        result.Should().BeOfType<ForbidResult>();
    }

    [Test]
    public async Task Admin_GetsAggregates()
    {
        var now = DateTime.UtcNow;
        Seed("done",   now,              costUsd: 0.01m, tokensIn: 1000, tokensOut: 100);
        Seed("done",   now.AddDays(-1),  costUsd: 0.03m, tokensIn: 3000, tokensOut: 300);
        Seed("failed", now.AddDays(-1));

        var body   = Body(await Controller("admin").GetAnalytics(days: 7));
        var totals = body.GetProperty("totals");

        totals.GetProperty("analyses").GetInt32().Should().Be(2);
        totals.GetProperty("failed").GetInt32().Should().Be(1);
        totals.GetProperty("totalCostUsd").GetDecimal().Should().Be(0.04m);
        totals.GetProperty("avgCostUsd").GetDecimal().Should().Be(0.02m);
        totals.GetProperty("tokensIn").GetInt64().Should().Be(4000);
        totals.GetProperty("successRate").GetDouble().Should().BeApproximately(2.0 / 3, 0.001);

        body.GetProperty("perDay").GetArrayLength().Should().Be(7);
    }

    [Test]
    public async Task RunsWithoutRecordedCost_DoNotDilute_AvgCost()
    {
        // Risk: rows written before the usage columns existed have null cost.
        // Averaging them in as zero would report a per-run cost lower than
        // anything the product has ever actually achieved.
        var now = DateTime.UtcNow;
        Seed("done", now, costUsd: 0.02m, tokensIn: 100, tokensOut: 10);
        Seed("done", now);                       // pre-telemetry row
        Seed("done", now, costUsd: 0.04m, tokensIn: 100, tokensOut: 10);

        var totals = Body(await Controller("admin").GetAnalytics(days: 7))
            .GetProperty("totals");

        totals.GetProperty("analyses").GetInt32().Should().Be(3);
        totals.GetProperty("costedRuns").GetInt32().Should().Be(2);
        totals.GetProperty("avgCostUsd").GetDecimal().Should().Be(0.03m,
            "the average must be over runs that recorded cost, not all runs");
    }

    // ── Account deletion ─────────────────────────────────────────────────────

    [Test]
    public async Task DeletingAUser_AlsoRemovesTheirFiles()
    {
        // The bug this pins: DeleteUser removed the row and nothing else. The
        // database cascades to analyses, annotations and memberships, but no
        // trigger can reach the storage bucket — so every file that user ever
        // uploaded stayed behind with no record of whose it was. Four such
        // orphaned folders were found in the live bucket.
        var victim = Guid.NewGuid();
        _storage.Files[$"users/{victim}/analyses/a1/report.pdf"] = new byte[] { 1 };
        _storage.Files[$"users/{victim}/analyses/a1/original.csv"] = new byte[] { 2 };
        _storage.Files[$"users/{victim}/profile.jpg"] = new byte[] { 3 };

        var keeper = Guid.NewGuid();
        _storage.Files[$"users/{keeper}/profile.jpg"] = new byte[] { 4 };

        var result = await Controller("admin").DeleteUser(victim);

        result.Should().BeOfType<NoContentResult>();
        _storage.Files.Keys.Should().NotContain(k => k.StartsWith($"users/{victim}/"),
            "deleting an account must not leave its files in the bucket");
        _storage.Files.Keys.Should().Contain($"users/{keeper}/profile.jpg",
            "only the deleted user's files may be removed");
    }

    [Test]
    public async Task NonAdmin_CannotDeleteAUser()
    {
        var victim = Guid.NewGuid();
        _storage.Files[$"users/{victim}/profile.jpg"] = new byte[] { 1 };

        var result = await Controller("pro").DeleteUser(victim);

        result.Should().BeOfType<ForbidResult>();
        _storage.Files.Keys.Should().Contain($"users/{victim}/profile.jpg",
            "a forbidden request must not have deleted anything on the way out");
    }

    [Test]
    public async Task AnalysesOutsideTheWindow_AreExcluded()
    {
        Seed("done", DateTime.UtcNow, costUsd: 0.01m);
        Seed("done", DateTime.UtcNow.AddDays(-40), costUsd: 9.99m);

        var totals = Body(await Controller("admin").GetAnalytics(days: 30))
            .GetProperty("totals");

        totals.GetProperty("analyses").GetInt32().Should().Be(1);
        totals.GetProperty("totalCostUsd").GetDecimal().Should().Be(0.01m);
    }
}
