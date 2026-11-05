using backend.Application.Services;
using FluentAssertions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// The chat runs on free AI quotas shared by the whole site, so one user's
/// questions must not be able to spend everyone's day.
/// </summary>
[TestFixture]
public class ChatQuotaTests
{
    private sealed class ManualClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 3, 1, 12, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    [Test]
    public void TakesUpToTheLimit_ThenRefuses()
    {
        var quota = new ChatQuota();

        quota.TryTake("u", 2, out var first).Should().BeTrue();
        first.Should().Be(1);
        quota.TryTake("u", 2, out var second).Should().BeTrue();
        second.Should().Be(0);
        quota.TryTake("u", 2, out var third).Should().BeFalse();
        third.Should().Be(0);
    }

    [Test]
    public void KeysAreCountedSeparately()
    {
        var quota = new ChatQuota();
        quota.TryTake("a", 1, out _).Should().BeTrue();
        quota.TryTake("b", 1, out _).Should().BeTrue();
    }

    [Test]
    public void Refund_GivesBackOne_AndNeverGoesBelowZero()
    {
        var quota = new ChatQuota();
        quota.TryTake("u", 1, out _);
        quota.Refund("u");
        quota.Remaining("u", 1).Should().Be(1);

        quota.Refund("u");
        quota.Remaining("u", 1).Should().Be(1, "an extra refund must not add allowance");
    }

    [Test]
    public void Allowance_ResetsAtMidnightUtc()
    {
        var clock = new ManualClock();
        var quota = new ChatQuota(clock);
        quota.TryTake("u", 1, out _);
        quota.TryTake("u", 1, out _).Should().BeFalse();

        clock.Now = clock.Now.AddHours(11);
        quota.TryTake("u", 1, out _).Should().BeFalse("it is still the same UTC day");

        clock.Now = clock.Now.AddHours(1);
        quota.TryTake("u", 1, out _).Should().BeTrue();
    }

    [TestCase("free", 10)]
    [TestCase(null, 10)]
    [TestCase("pro", 100)]
    [TestCase("admin", 100)]
    public void QuestionsPerDay_FollowsThePlan(string? plan, int expected) =>
        new ChatLimits().QuestionsPerDay(plan).Should().Be(expected);
}
