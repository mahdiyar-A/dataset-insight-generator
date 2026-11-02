using backend.Application.Services;
using FluentAssertions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// AnalysisGate decides who may start an analysis. Each rule protects
/// something concrete on a 2 GB server running on free AI quotas:
///   - one at a time per caller: a double-click must not start two runs
///   - a concurrency cap: a third simultaneous pandas run risks killing them all
///   - daily allowances: one guest must not spend the site's AI quota
/// </summary>
[TestFixture]
public class AnalysisGateTests
{
    private sealed class ManualClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 2, 12, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static AnalysisLimits Limits(
        int concurrent = 2, int queued = 8, int guestPerIp = 2, int guestSite = 20, int pro = 20) => new()
    {
        MaxConcurrent = concurrent, MaxQueued = queued,
        GuestPerIpPerDay = guestPerIp, GuestSiteWidePerDay = guestSite, ProPerDay = pro,
    };

    private static AnalysisCaller Guest(string ip) => AnalysisCaller.ForGuest(ip);
    private static AnalysisCaller User(string plan) => AnalysisCaller.ForUser(Guid.NewGuid(), plan);

    /// <summary>Finish an admitted run so its caller's place is released.</summary>
    private static Task Finish(AnalysisGate gate, AnalysisCaller caller) =>
        gate.RunAsync(caller, () => Task.CompletedTask);

    // ── One at a time ─────────────────────────────────────────────────────────

    [Test]
    public void SecondStart_WhileFirstIsActive_IsRefused()
    {
        var gate = new AnalysisGate(Limits());
        var user = User("pro");

        gate.TryAdmit(user).Allowed.Should().BeTrue();
        gate.TryAdmit(user).Code.Should().Be("ALREADY_RUNNING");
    }

    [Test]
    public async Task Caller_CanStartAgain_OnceTheRunFinishes()
    {
        var gate = new AnalysisGate(Limits());
        var user = User("pro");

        gate.TryAdmit(user);
        await Finish(gate, user);

        gate.TryAdmit(user).Allowed.Should().BeTrue();
    }

    [Test]
    public async Task PlaceIsReleased_EvenWhenTheRunThrows()
    {
        // Risk: an exception leaking out of an analysis would leave the caller
        // marked "running" for ever, locking them out until a restart.
        var gate = new AnalysisGate(Limits());
        var user = User("pro");
        gate.TryAdmit(user);

        var run = () => gate.RunAsync(user, () => throw new InvalidOperationException("boom"));
        await run.Should().ThrowAsync<InvalidOperationException>();

        gate.InFlight.Should().Be(0);
        gate.TryAdmit(user).Allowed.Should().BeTrue();
    }

    // ── Capacity ──────────────────────────────────────────────────────────────

    [Test]
    public void NewCallers_AreRefused_WhenRunningAndQueuedAreFull()
    {
        var gate = new AnalysisGate(Limits(concurrent: 2, queued: 1));
        gate.TryAdmit(User("pro")).Allowed.Should().BeTrue();
        gate.TryAdmit(User("pro")).Allowed.Should().BeTrue();
        gate.TryAdmit(User("pro")).Allowed.Should().BeTrue();   // queued

        gate.TryAdmit(User("pro")).Code.Should().Be("BUSY");
    }

    [Test]
    public async Task NoMoreThanMaxConcurrent_RunAtOnce()
    {
        var gate    = new AnalysisGate(Limits(concurrent: 2));
        var release = new TaskCompletionSource();
        var running = 0;
        var peak    = 0;

        async Task Work()
        {
            var now = Interlocked.Increment(ref running);
            InterlockedMax(ref peak, now);
            await release.Task;
            Interlocked.Decrement(ref running);
        }

        var callers = Enumerable.Range(0, 4).Select(_ => User("pro")).ToList();
        callers.ForEach(c => gate.TryAdmit(c));
        var runs = callers.Select(c => gate.RunAsync(c, Work)).ToList();

        await Task.Delay(100);
        peak.Should().Be(2, "the other two must wait for a slot");

        release.SetResult();
        await Task.WhenAll(runs);
        gate.InFlight.Should().Be(0);
    }

    private static void InterlockedMax(ref int target, int value)
    {
        int seen;
        while ((seen = target) < value && Interlocked.CompareExchange(ref target, value, seen) != seen) { }
    }

    // ── Guests ────────────────────────────────────────────────────────────────

    [Test]
    public async Task Guest_GetsTheDailyAllowancePerIp_ThenIsRefused()
    {
        var gate  = new AnalysisGate(Limits(guestPerIp: 2));
        var guest = Guest("203.0.113.7");

        for (var i = 0; i < 2; i++)
        {
            gate.TryAdmit(guest).Allowed.Should().BeTrue();
            await Finish(gate, guest);
        }

        var third = gate.TryAdmit(guest);
        third.Code.Should().Be("GUEST_DAILY_LIMIT");
        third.Message.Should().Contain("free account", "the refusal should point at the way forward");
    }

    [Test]
    public async Task OneGuestUsingTheirAllowance_DoesNotAffectAnother()
    {
        var gate = new AnalysisGate(Limits(guestPerIp: 1));
        var a = Guest("203.0.113.7");
        gate.TryAdmit(a);
        await Finish(gate, a);

        gate.TryAdmit(Guest("198.51.100.9")).Allowed.Should().BeTrue();
    }

    [Test]
    public async Task SiteWideGuestCap_ProtectsTheSharedAiQuota()
    {
        var gate = new AnalysisGate(Limits(guestPerIp: 5, guestSite: 3));
        for (var i = 0; i < 3; i++)
        {
            var g = Guest($"203.0.113.{i}");
            gate.TryAdmit(g).Allowed.Should().BeTrue();
            await Finish(gate, g);
        }

        gate.TryAdmit(Guest("203.0.113.99")).Code.Should().Be("GUEST_SITE_LIMIT");
        gate.TryAdmit(User("free")).Allowed.Should().BeTrue("registered users are not counted against guests");
    }

    [Test]
    public async Task Allowances_ResetAtUtcMidnight()
    {
        var clock = new ManualClock();
        var gate  = new AnalysisGate(Limits(guestPerIp: 1), clock);
        var guest = Guest("203.0.113.7");
        gate.TryAdmit(guest);
        await Finish(gate, guest);
        gate.TryAdmit(guest).Allowed.Should().BeFalse();

        clock.Now = clock.Now.AddDays(1);

        gate.TryAdmit(guest).Allowed.Should().BeTrue();
    }

    // ── Plans ─────────────────────────────────────────────────────────────────

    [Test]
    public async Task Pro_HitsTheFairUseCeiling()
    {
        var gate = new AnalysisGate(Limits(pro: 2));
        var pro  = AnalysisCaller.ForUser(Guid.NewGuid(), "pro");
        for (var i = 0; i < 2; i++) { gate.TryAdmit(pro); await Finish(gate, pro); }

        gate.TryAdmit(pro).Code.Should().Be("PRO_DAILY_LIMIT");
    }

    [Test]
    public async Task Admin_HasNoDailyCeiling()
    {
        var gate  = new AnalysisGate(Limits(pro: 1));
        var admin = AnalysisCaller.ForUser(Guid.NewGuid(), "admin");
        for (var i = 0; i < 5; i++)
        {
            gate.TryAdmit(admin).Allowed.Should().BeTrue();
            await Finish(gate, admin);
        }
    }

    [Test]
    public async Task FreePlan_IsNotCountedByTheGate()
    {
        // The free plan's 2-per-48h quota is persisted on the user row so a
        // restart cannot refill it; the in-memory gate must not double-count.
        var gate = new AnalysisGate(Limits(pro: 1, guestPerIp: 1));
        var free = AnalysisCaller.ForUser(Guid.NewGuid(), "free");
        for (var i = 0; i < 4; i++)
        {
            gate.TryAdmit(free).Allowed.Should().BeTrue();
            await Finish(gate, free);
        }
    }

    // ── Check is read-only ────────────────────────────────────────────────────

    [Test]
    public void Check_NeverSpendsTheAllowance()
    {
        // The chat checks before running a quality check, then admits only when
        // the analysis really starts. Checking must not cost a guest a turn.
        var gate  = new AnalysisGate(Limits(guestPerIp: 1));
        var guest = Guest("203.0.113.7");

        for (var i = 0; i < 5; i++) gate.Check(guest).Allowed.Should().BeTrue();
        gate.TryAdmit(guest).Allowed.Should().BeTrue();
    }
}
