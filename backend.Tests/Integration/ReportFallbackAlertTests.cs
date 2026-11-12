using System.Security.Claims;
using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Controllers;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// When no model answers, the person still gets a report: the plain one built
/// from the statistics alone. It is the one failure that arrives looking like a
/// result, and when the paid provider's credit ran out in 2026 every report was
/// one for days before anyone knew. The owner is told the moment it happens.
/// </summary>
[TestFixture]
public class ReportFallbackAlertTests
{
    private static readonly string TempDir = Path.Combine(Path.GetTempPath(), "dig_uploads");

    private FakeAnalysisRepository _analyses = null!;
    private FakePythonAiClient     _python   = null!;
    private NoOpEmailService       _email    = null!;
    private AnalysisService        _service  = null!;
    private Guid                   _userId;

    [SetUp]
    public void SetUp()
    {
        _analyses = new FakeAnalysisRepository();
        _python   = new FakePythonAiClient();
        _email    = new NoOpEmailService();

        var scopes = new ServiceCollection()
            .AddScoped<IEmailService>(_ => _email)
            .BuildServiceProvider()
            .GetRequiredService<IServiceScopeFactory>();
        var alerts = new OwnerAlerts(scopes, NullLogger<OwnerAlerts>.Instance, "owner@example.com");

        _service = new AnalysisService(
            _analyses, new FakeStorageService(), _python, new FakeUserRepository(),
            new AnalysisGate(new AnalysisLimits()),
            NullLogger<AnalysisService>.Instance, alerts);

        _userId = Guid.NewGuid();
        Directory.CreateDirectory(TempDir);
        File.WriteAllText(TempCsvPath, "a,b\n1,2\n3,4\n5,6\n");
    }

    [TearDown]
    public void TearDown()
    {
        if (File.Exists(TempCsvPath)) File.Delete(TempCsvPath);
    }

    private string TempCsvPath => Path.Combine(TempDir, $"{_userId}.csv");

    private async Task Run()
    {
        File.WriteAllText(TempCsvPath, "a,b\n1,2\n3,4\n5,6\n");
        await _service.RunAsync(_userId, "data.csv", 1024, rowCount: 100, columnCount: 5);
        // The alert is not awaited by the run, so that it can never hold one up.
        for (var i = 0; i < 50 && _email.OwnerAlerts.Count == 0; i++) await Task.Delay(10);
    }

    [Test]
    public async Task AReportNoModelWroteIsReportedAtOnce()
    {
        _python.ReportWriter = "";

        await Run();

        _analyses.Store.Single().Status.Should().Be("done", "the person still gets their report");
        _email.OwnerAlerts.Should().ContainSingle().Which.Subject.Should().Contain("without AI");
    }

    [Test]
    public async Task AReportAModelWroteSendsNothing()
    {
        _python.ReportWriter = "NVIDIA Nemotron 3 Ultra";

        await Run();

        _email.OwnerAlerts.Should().BeEmpty();
    }

    [Test]
    public async Task AnOlderAiServiceThatDoesNotSaySendsNothing()
    {
        // Risk: reading "no field" as "no model" would raise the alarm on every
        // analysis in the minutes between deploying the two services.
        _python.ReportWriter = null;

        await Run();

        _email.OwnerAlerts.Should().BeEmpty();
    }

    [Test]
    public async Task ADayOfThemIsOneEmail()
    {
        _python.ReportWriter = "";

        await Run();
        await Run();
        await Run();

        _email.OwnerAlerts.Should().ContainSingle();
    }

    // ── The same picture on demand ───────────────────────────────────────────

    private AdminController AdminAs(string plan)
    {
        var id   = Guid.NewGuid();
        var user = User.CreateWithId(id, "ada", "ada@example.com", "supabase-auth");
        if (plan != "free") user.SetPlan(plan, null, null);
        return new AdminController(new FakeUserRepository { DefaultUser = user }, _analyses,
            NullLogger<AdminController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", id.ToString()) }, "test")),
                },
            },
        };
    }

    [Test]
    public async Task AnAdminCanReadTheModelCheck()
    {
        var result = await AdminAs("admin").GetModels(_python);

        result.Should().BeOfType<ContentResult>().Which.Content.Should().Contain("\"problems\"");
    }

    [TestCase("free")]
    [TestCase("pro")]
    public async Task NobodyElseCan(string plan)
    {
        var result = await AdminAs(plan).GetModels(_python);

        result.Should().BeOfType<ForbidResult>();
        _python.ModelStatusCalls.Should().Be(0);
    }

    // ── Hearing the alarm ring ───────────────────────────────────────────────

    private OwnerAlerts AlertsTo(string inbox, bool enabled = true)
    {
        var scopes = new ServiceCollection()
            .AddScoped<IEmailService>(_ => _email)
            .BuildServiceProvider()
            .GetRequiredService<IServiceScopeFactory>();
        return new OwnerAlerts(scopes, NullLogger<OwnerAlerts>.Instance, inbox, enabled);
    }

    private static System.Text.Json.JsonElement Body(IActionResult result) =>
        System.Text.Json.JsonSerializer.SerializeToElement(((ObjectResult)result).Value);

    [Test]
    public async Task AnAdminCanSendATestAlertAndIsToldWhereItWent()
    {
        var result = await AdminAs("admin").TestAlert(AlertsTo("owner@example.com"));

        Body(result).GetProperty("sent").GetBoolean().Should().BeTrue();
        Body(result).GetProperty("message").GetString().Should().Contain("owner@example.com");
        var alert = _email.OwnerAlerts.Should().ContainSingle().Subject;
        alert.ToEmail.Should().Be("owner@example.com");
        alert.Subject.Should().Contain("test");
    }

    [Test]
    public async Task TwoTestsInARowBothArrive()
    {
        // A real alert is held back for a day once sent. A test that did the
        // same would look broken to the person pressing the button twice.
        var alerts = AlertsTo("owner@example.com");

        await AdminAs("admin").TestAlert(alerts);
        await AdminAs("admin").TestAlert(alerts);

        _email.OwnerAlerts.Should().HaveCount(2);
    }

    [Test]
    public async Task ATestThatCouldNotBeSentSaysSo()
    {
        _email.ThrowOnAlert = true;

        var result = await AdminAs("admin").TestAlert(AlertsTo("owner@example.com"));

        Body(result).GetProperty("sent").GetBoolean().Should().BeFalse("\"sent\" must mean it was");
    }

    [Test]
    public async Task OnlyAnAdminCanSendOne()
    {
        var result = await AdminAs("pro").TestAlert(AlertsTo("owner@example.com"));

        result.Should().BeOfType<ForbidResult>();
        _email.OwnerAlerts.Should().BeEmpty();
    }

    [Test]
    public async Task AnAiServiceThatIsDownIsSaidPlainly()
    {
        _python.SimulateDown = true;

        var result = await AdminAs("admin").GetModels(_python);

        result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(503);
    }
}
