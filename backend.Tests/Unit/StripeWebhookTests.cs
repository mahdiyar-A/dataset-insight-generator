using System.Security.Cryptography;
using System.Text;
using backend.Application.Interfaces;
using backend.Controllers;
using backend.Domain.Entities;
using backend.Infrastructure.Stripe;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;
using Stripe;

namespace backend.Tests.Unit;

/// <summary>
/// What happens after a customer pays. Stripe sends a signed message, and that
/// message is the only thing that turns on Pro, so a rejected one means someone
/// was charged for nothing. These run the real signature check.
/// </summary>
[TestFixture]
public class StripeWebhookTests
{
    private const string Secret  = "whsec_for_these_tests_only";
    private const string Newest  = "2026-01-28.clover";
    private const string Library = "2024-06-20";

    private static StripeService Service() => new(
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Stripe:SecretKey"]     = "not-a-real-key",
            ["Stripe:WebhookSecret"] = Secret,
            ["Stripe:ProPriceId"]    = "price_for_these_tests",
        }).Build(),
        NullLogger<StripeService>.Instance);

    private static string Sign(string body, string secret = Secret)
    {
        var time = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{time}.{body}"))).ToLowerInvariant();
        return $"t={time},v1={hash}";
    }

    private static string Event(string version, string type, string body) =>
        $$$"""{"id":"evt_1","object":"event","api_version":"{{{version}}}","created":1790000000,"livemode":true,"pending_webhooks":1,"request":{"id":null,"idempotency_key":null},"type":"{{{type}}}","data":{"object":{{{body}}}}}""";

    private static Task<StripeWebhookResult> Deliver(string body) =>
        Service().HandleWebhookAsync(body, Sign(body));

    [Test]
    public async Task AWebhookCreatedTodayIsAccepted()
    {
        var body = Event(Newest, "customer.subscription.created",
            """{"id":"sub_1","object":"subscription","customer":"cus_1","status":"active","items":{"object":"list","data":[{"id":"si_1","current_period_end":1800000000}]}}""");

        var result = await Deliver(body);

        result.CustomerId.Should().Be("cus_1");
        result.SubscriptionId.Should().Be("sub_1");
        result.Status.Should().Be("active");
        result.CurrentPeriodEnd.Should().Be(DateTimeOffset.FromUnixTimeSeconds(1800000000).UtcDateTime);
    }

    [Test]
    public async Task TheOlderLayoutStillReads()
    {
        var body = Event(Library, "customer.subscription.updated",
            """{"id":"sub_1","object":"subscription","customer":"cus_1","status":"active","current_period_end":1800000000}""");

        var result = await Deliver(body);

        result.CurrentPeriodEnd.Should().Be(DateTimeOffset.FromUnixTimeSeconds(1800000000).UtcDateTime);
    }

    [TestCase(Newest, """{"id":"in_1","object":"invoice","customer":"cus_1","parent":{"subscription_details":{"subscription":"sub_1"}}}""")]
    [TestCase(Library, """{"id":"in_1","object":"invoice","customer":"cus_1","subscription":"sub_1"}""")]
    public async Task APaidInvoiceNamesItsSubscription(string version, string invoice)
    {
        var result = await Deliver(Event(version, "invoice.payment_succeeded", invoice));

        result.CustomerId.Should().Be("cus_1");
        result.SubscriptionId.Should().Be("sub_1");
        result.Status.Should().Be("active");
    }

    [Test]
    public async Task AFailedInvoiceReadsAsPastDue()
    {
        var result = await Deliver(Event(Newest, "invoice.payment_failed",
            """{"id":"in_1","object":"invoice","customer":"cus_1"}"""));

        result.Status.Should().Be("past_due");
    }

    [Test]
    public async Task AnEventDigDoesNotUseNamesNoCustomer()
    {
        var result = await Deliver(Event(Newest, "charge.refunded", """{"id":"ch_1","customer":"cus_1"}"""));

        result.CustomerId.Should().BeNull();
    }

    [Test]
    public async Task AForgedMessageIsRefused()
    {
        var body = Event(Newest, "customer.subscription.created", """{"id":"sub_1","customer":"cus_1","status":"active"}""");

        var deliver = () => Service().HandleWebhookAsync(body, Sign(body, "whsec_someone_elses"));

        await deliver.Should().ThrowAsync<StripeException>();
    }

    [TestCase("ada@example.com", "email:'ada@example.com'")]
    [TestCase("o'brien@example.com", @"email:'o\'brien@example.com'")]
    public void AnEmailIsSafeInsideTheSearch(string email, string query) =>
        StripeService.EmailQuery(email).Should().Be(query);

    // ── From the message to the plan ─────────────────────────────────────────

    private sealed class Scripted : NoOpStripeService
    {
        private readonly StripeWebhookResult _result;
        public Scripted(StripeWebhookResult result) => _result = result;
        public override Task<StripeWebhookResult> HandleWebhookAsync(string payload, string signature) =>
            Task.FromResult(_result);
    }

    private static async Task<FakeUserRepository> Received(
        string type, string status, string plan = "free", string? paying = null, string eventFor = "sub_1")
    {
        var user = User.CreateWithId(Guid.NewGuid(), "Ada", "ada@example.com", "supabase-auth");
        user.SetStripeCustomerId("cus_1");
        if (plan != "free") user.SetPlan(plan, null, paying);
        var users = new FakeUserRepository { DefaultUser = user };

        var controller = new PlansController(
            new Scripted(new StripeWebhookResult(type, "cus_1", eventFor, status, null)),
            users, new ConfigurationBuilder().Build(), NullLogger<PlansController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };

        (await controller.Webhook()).Should().BeOfType<OkResult>();
        return users;
    }

    [TestCase("customer.subscription.created", "active")]
    [TestCase("customer.subscription.created", "trialing")]
    [TestCase("customer.subscription.updated", "active")]
    [TestCase("invoice.payment_succeeded", "active")]
    public async Task AConfirmedPaymentTurnsOnPro(string type, string status)
    {
        var users = await Received(type, status);

        users.PlanChanges.Should().ContainSingle().Which.Plan.Should().Be("pro");
    }

    [TestCase("incomplete")]
    [TestCase("incomplete_expired")]
    [TestCase("past_due")]
    [TestCase("unpaid")]
    public async Task ASubscriptionWithoutAPaymentDoesNot(string status)
    {
        var users = await Received("customer.subscription.created", status);

        users.PlanChanges.Should().BeEmpty();
    }

    [Test]
    public async Task ACancelledSubscriptionGoesBackToFree()
    {
        var users = await Received("customer.subscription.deleted", "canceled");

        users.PlanChanges.Should().ContainSingle().Which.Plan.Should().Be("free");
    }

    [TestCase("unpaid")]
    [TestCase("canceled")]
    [TestCase("incomplete_expired")]
    public async Task ProEndsWhenPaymentsStopWithoutADeletion(string status)
    {
        // Risk: Stripe's "mark the subscription unpaid" setting never sends a
        // deletion, and Pro used to stay on for free, for good.
        var users = await Received("customer.subscription.updated", status, plan: "pro", paying: "sub_1");

        users.PlanChanges.Should().ContainSingle().Which.Plan.Should().Be("free");
    }

    [Test]
    public async Task ProStaysWhileStripeIsStillRetryingTheCard()
    {
        var users = await Received("customer.subscription.updated", "past_due", plan: "pro", paying: "sub_1");

        users.PlanChanges.Should().BeEmpty();
    }

    [Test]
    public async Task TheLateEndOfAnOlderSubscriptionLeavesTheCurrentOneAlone()
    {
        // Stripe does not promise order: the end of sub_1 can arrive after sub_2 is paid.
        var users = await Received("customer.subscription.deleted", "canceled",
            plan: "pro", paying: "sub_2", eventFor: "sub_1");

        users.PlanChanges.Should().BeEmpty();
    }

    // ── Manage subscription ──────────────────────────────────────────────────

    private sealed class PortalNotSetUp : NoOpStripeService
    {
        public override Task<string> CreateBillingPortalSessionAsync(string customerId, string returnUrl) =>
            throw new StripeException("No configuration provided and your live mode default configuration has not been created.");
    }

    [Test]
    public async Task APortalStripeRefusesStillTellsTheCustomerHowToCancel()
    {
        // Risk: until the portal is set up in Stripe, a paying customer pressing
        // "Manage subscription" got a bare server error and no way to cancel.
        var user = User.CreateWithId(Guid.NewGuid(), "Ada", "ada@example.com", "supabase-auth");
        user.SetStripeCustomerId("cus_1");
        var controller = new PlansController(
            new PortalNotSetUp(), new FakeUserRepository { DefaultUser = user },
            new ConfigurationBuilder().Build(), NullLogger<PlansController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(
                        new[] { new System.Security.Claims.Claim("sub", user.Id.ToString()) }, "test")),
                },
            },
        };

        var result = await controller.Portal();

        var refused = result.Should().BeOfType<ObjectResult>().Subject;
        refused.StatusCode.Should().Be(503);
        System.Text.Json.JsonSerializer.Serialize(refused.Value).Should().Contain(PlansController.SupportEmail);
    }

    [TestCase("customer.subscription.deleted", "canceled")]
    [TestCase("customer.subscription.updated", "active")]
    public async Task BillingNeverChangesAnAdmin(string type, string status)
    {
        var users = await Received(type, status, plan: "admin");

        users.PlanChanges.Should().BeEmpty();
    }
}
