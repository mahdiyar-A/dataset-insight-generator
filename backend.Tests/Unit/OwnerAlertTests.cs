using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// Telling the owner that something is wrong, and the daily model check.
///
/// DIG runs on free models other companies withdraw without notice. The chain
/// moves on to the next model when one goes, so nothing breaks and nothing
/// says so. These emails are the only way the owner hears before a visitor
/// does, and an alarm that floods the inbox gets ignored, so the limits are
/// tested as hard as the sending.
/// </summary>
[TestFixture]
public class OwnerAlertTests
{
    private const string Owner = "owner@example.com";

    private NoOpEmailService   _email = null!;
    private FakePythonAiClient _ai    = null!;
    private Clock              _clock = null!;
    private IServiceScopeFactory _scopes = null!;

    /// <summary>A clock the test moves by hand.</summary>
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 11, 9, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
        public void Forward(TimeSpan by) => Now += by;
    }

    [SetUp]
    public void SetUp()
    {
        _email = new NoOpEmailService();
        _ai    = new FakePythonAiClient();
        _clock = new Clock();
        _scopes = new ServiceCollection()
            .AddScoped<IEmailService>(_ => _email)
            .AddScoped<IPythonAiClient>(_ => _ai)
            .BuildServiceProvider()
            .GetRequiredService<IServiceScopeFactory>();
    }

    private OwnerAlerts Alerts(bool enabled = true) =>
        new(_scopes, NullLogger<OwnerAlerts>.Instance, Owner, enabled, _clock);

    private ModelWatch Watch(OwnerAlerts alerts) =>
        new(_scopes, alerts, NullLogger<ModelWatch>.Instance, _clock);

    private static readonly string[] Line = { "Something needs a look." };

    private static string Status(params string[] problems) =>
        System.Text.Json.JsonSerializer.Serialize(new
        {
            problems,
            notes = Array.Empty<string>(),
            allowance = new { openrouter = new { used = 50, limit = 50, remaining = 0 } },
        });

    // ── The limits ───────────────────────────────────────────────────────────

    [Test]
    public async Task TheSameAlertIsSentOnceADay()
    {
        var alerts = Alerts();

        (await alerts.RaiseAsync("a", "Subject", Line)).Should().BeTrue();
        _clock.Forward(TimeSpan.FromHours(23));
        (await alerts.RaiseAsync("a", "Subject", Line)).Should().BeFalse("it was said less than a day ago");
        _clock.Forward(TimeSpan.FromHours(2));
        (await alerts.RaiseAsync("a", "Subject", Line)).Should().BeTrue("a day later it is worth saying again");

        _email.OwnerAlerts.Should().HaveCount(2).And.OnlyContain(a => a.ToEmail == Owner);
    }

    [Test]
    public async Task DifferentProblemsAreNotHeldBackByEachOther()
    {
        var alerts = Alerts();

        await alerts.RaiseAsync("a", "First", Line);
        await alerts.RaiseAsync("b", "Second", Line);

        _email.OwnerAlerts.Select(a => a.Subject).Should().Equal("First", "Second");
    }

    [Test]
    public async Task NoMoreThanAFewGoOutInADay()
    {
        // Risk: something failing in a loop sends an email per failure, on the
        // allowance sign-up and password-reset emails need.
        var alerts = Alerts();

        for (var i = 0; i < OwnerAlerts.MaxPerDay + 5; i++)
            await alerts.RaiseAsync($"problem-{i}", "Subject", Line);

        _email.OwnerAlerts.Should().HaveCount(OwnerAlerts.MaxPerDay);

        _clock.Forward(TimeSpan.FromDays(1));
        (await alerts.RaiseAsync("tomorrow", "Subject", Line)).Should().BeTrue("the limit is per day");
    }

    [Test]
    public async Task AnAlertThatCouldNotBeSentIsTriedAgainNextTime()
    {
        // Risk: counting a failed send as sent keeps the owner in the dark for
        // a day about the very thing the alert exists for.
        var alerts = Alerts();
        _email.ThrowOnAlert = true;
        (await alerts.RaiseAsync("a", "Subject", Line)).Should().BeFalse();

        _email.ThrowOnAlert = false;

        (await alerts.RaiseAsync("a", "Subject", Line)).Should().BeTrue();
    }

    [Test]
    public async Task SwitchedOffItSendsNothing()
    {
        (await Alerts(enabled: false).RaiseAsync("a", "Subject", Line)).Should().BeFalse();

        _email.OwnerAlerts.Should().BeEmpty();
    }

    // ── The daily check ──────────────────────────────────────────────────────

    [Test]
    public async Task ADayWithNothingWrongSendsNothing()
    {
        var sent = await Watch(Alerts()).CheckOnceAsync();

        sent.Should().BeFalse();
        _ai.ModelStatusCalls.Should().Be(1);
        _email.OwnerAlerts.Should().BeEmpty("an email every morning saying all is well is one nobody reads");
    }

    [Test]
    public async Task AWithdrawnModelIsEmailedInTheAiServicesOwnWords()
    {
        const string problem = "Qwen 3.8 27B is no longer offered by Groq. DIG uses it for reports and answering questions.";
        _ai.ModelStatusJson = Status(problem);

        var sent = await Watch(Alerts()).CheckOnceAsync();

        sent.Should().BeTrue();
        var alert = _email.OwnerAlerts.Should().ContainSingle().Subject;
        alert.ToEmail.Should().Be(Owner);
        alert.Lines.Should().Contain(problem);
        alert.Lines.Should().Contain(l => l.Contains("50 of 50"), "the day's free allowance is part of the picture");
    }

    [Test]
    public async Task TheSameProblemIsNotEmailedTwiceInOneDay()
    {
        _ai.ModelStatusJson = Status("A model is gone.");
        var watch = Watch(Alerts());

        await watch.CheckOnceAsync();
        _clock.Forward(TimeSpan.FromHours(1));
        await watch.CheckOnceAsync();

        _email.OwnerAlerts.Should().ContainSingle();
    }

    [Test]
    public async Task AProblemStillThereTomorrowIsEmailedAgain()
    {
        _ai.ModelStatusJson = Status("A model is gone.");
        var watch = Watch(Alerts());

        await watch.CheckOnceAsync();
        _clock.Forward(TimeSpan.FromHours(24));
        await watch.CheckOnceAsync();

        _email.OwnerAlerts.Should().HaveCount(2);
    }

    [Test]
    public async Task ADayOfChecksOnOneOngoingProblemIsOneEmail()
    {
        // The check runs every few hours, and the counts in a sentence move
        // between runs. That is the same trouble, not four emails a day.
        var watch = Watch(Alerts());
        var counts = new[] { (2, 9), (3, 11), (3, 14) };

        foreach (var (failed, total) in counts)
        {
            _ai.ModelStatusJson = Status(
                $"{failed} reports out of {total} in the last 24 hours had to be written without AI, because no model answered.");
            await watch.CheckOnceAsync();
            _clock.Forward(ModelWatch.Every);
        }

        _email.OwnerAlerts.Should().ContainSingle();
    }

    [Test]
    public void TheCheckRunsOftenEnoughToSeeAnAllowanceRunOut()
    {
        // A free allowance used up in the afternoon is back at midnight UTC.
        // Checked once a day, it would never be seen.
        ModelWatch.Every.Should().BeLessThanOrEqualTo(TimeSpan.FromHours(8));
        ModelWatch.Quiet.Should().BeGreaterThan(ModelWatch.Every, "or every check would be an email");
    }

    [Test]
    public async Task ANewProblemIsEmailedEvenIfAnotherWasSentToday()
    {
        var watch = Watch(Alerts());
        _ai.ModelStatusJson = Status("A model is gone.");
        await watch.CheckOnceAsync();

        _ai.ModelStatusJson = Status("A model is gone.", "No working model is left for reports.");
        _clock.Forward(TimeSpan.FromHours(1));
        await watch.CheckOnceAsync();

        _email.OwnerAlerts.Should().HaveCount(2);
        _email.OwnerAlerts[1].Subject.Should().Contain("2 things");
    }

    [Test]
    public async Task AnAiServiceThatDoesNotAnswerIsItselfTheAlert()
    {
        _ai.SimulateDown = true;

        var sent = await Watch(Alerts()).CheckOnceAsync();

        sent.Should().BeTrue();
        _email.OwnerAlerts.Should().ContainSingle().Which.Subject.Should().Contain("not answering");
    }

    [TestCase("not json at all")]
    [TestCase("{\"problems\": \"a string, not a list\"}")]
    [TestCase("{}")]
    public async Task AnAnswerThatMakesNoSenseSendsNothingAndBreaksNothing(string answer)
    {
        _ai.ModelStatusJson = answer;

        var sent = await Watch(Alerts()).CheckOnceAsync();

        sent.Should().BeFalse();
        _email.OwnerAlerts.Should().BeEmpty();
    }
}
