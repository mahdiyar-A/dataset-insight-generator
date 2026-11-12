using backend.Application.Services;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NUnit.Framework;
using System.Net;

namespace backend.Tests.Integration;

/// <summary>
/// The owner's alarm, as the app really puts it together.
///
/// The alarm is switched off on a developer's machine, which is also how every
/// other test runs. So without these, nothing would build the alarm the way
/// the live server does, and a missing registration would only show up there:
/// as a server that will not start, or as an alarm that silently never rings.
/// </summary>
[TestFixture]
public class AlertsWiringTests
{
    /// <summary>The app with the alarm on, as on the live server.</summary>
    private sealed class LiveLikeFactory : TestWebApplicationFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            // UseSetting, because Program.cs reads these while it is still building.
            builder.UseSetting("Alerts:Enabled", "true");
            builder.UseSetting("Alerts:Email",   "owner@example.com");
        }
    }

    [Test]
    public async Task WithTheAlarmOnTheAppStartsAndTheDailyCheckIsScheduled()
    {
        using var factory = new LiveLikeFactory();
        using var client  = factory.CreateClient();

        (await client.GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);
        factory.Services.GetServices<IHostedService>().OfType<ModelWatch>().Should().ContainSingle();
    }

    [Test]
    public async Task TheDailyCheckReachesTheAiServiceAndTheOwnersInbox()
    {
        using var factory = new LiveLikeFactory();
        using var client  = factory.CreateClient();
        factory.PythonAi.ModelStatusJson = """{"problems": ["Qwen 3.8 27B is no longer offered by Groq."], "notes": []}""";

        var watch = factory.Services.GetServices<IHostedService>().OfType<ModelWatch>().Single();
        var sent  = await watch.CheckOnceAsync();

        sent.Should().BeTrue();
        var alert = factory.EmailSvc.OwnerAlerts.Should().ContainSingle().Subject;
        alert.ToEmail.Should().Be("owner@example.com");
        alert.Lines.Should().Contain("Qwen 3.8 27B is no longer offered by Groq.");
    }

    [Test]
    public void AnAnalysisIsGivenTheAlarm()
    {
        // The alarm is an optional part of AnalysisService so the tests that
        // build one by hand need not care. The app must still hand it over.
        using var factory = new LiveLikeFactory();
        using var scope   = factory.Services.CreateScope();

        var service = scope.ServiceProvider.GetRequiredService<AnalysisService>();

        typeof(AnalysisService)
            .GetField("_alerts", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .GetValue(service).Should().BeSameAs(factory.Services.GetRequiredService<OwnerAlerts>());
    }

    [Test]
    public async Task OnADevelopersMachineNothingIsSentAndNothingIsScheduled()
    {
        // Risk: a laptop reporting its own missing keys to the live inbox,
        // through the live mail account.
        using var factory = new TestWebApplicationFactory();
        using var client  = factory.CreateClient();

        factory.Services.GetServices<IHostedService>().OfType<ModelWatch>().Should().BeEmpty();
        var sent = await factory.Services.GetRequiredService<OwnerAlerts>()
            .RaiseAsync("a", "Subject", new[] { "A line." });

        sent.Should().BeFalse();
        factory.EmailSvc.OwnerAlerts.Should().BeEmpty();
    }
}
