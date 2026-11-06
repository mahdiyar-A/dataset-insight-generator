using System.Text.Json;
using backend.Application.Interfaces;
using Stripe;
using Stripe.Checkout;

namespace backend.Infrastructure.Stripe;

/// <summary>
/// Wraps the Stripe .NET SDK.
/// We use Stripe Checkout (hosted payment page) so no card data ever
/// touches our server — Stripe handles PCI compliance entirely.
///
/// Pro plan = $9.99 CAD/month recurring subscription.
/// The price ID is configured in appsettings via Stripe:ProPriceId.
/// </summary>
public class StripeService : IStripeService
{
    private readonly string _proPriceId;
    private readonly string _webhookSecret;
    private readonly ILogger<StripeService> _logger;

    public StripeService(IConfiguration config, ILogger<StripeService> logger)
    {
        _logger        = logger;
        _webhookSecret = config["Stripe:WebhookSecret"] ?? "";
        _proPriceId    = config["Stripe:ProPriceId"]    ?? "";

        // Set the API key globally — Stripe SDK uses it for all calls
        StripeConfiguration.ApiKey = config["Stripe:SecretKey"]
            ?? throw new InvalidOperationException("Stripe:SecretKey not configured");
    }

    public async Task<string> GetOrCreateCustomerAsync(Guid userId, string email, string name)
    {
        // Look up an existing customer by email so we don't create duplicates
        var existing = await new global::Stripe.CustomerService().SearchAsync(
            new global::Stripe.CustomerSearchOptions { Query = EmailQuery(email) });

        if (existing.Data.Count > 0)
            return existing.Data[0].Id;

        var customer = await new CustomerService().CreateAsync(new CustomerCreateOptions
        {
            Email    = email,
            Name     = name,
            Metadata = new Dictionary<string, string> { ["dig_user_id"] = userId.ToString() },
        });

        return customer.Id;
    }

    /// <summary>A quote or backslash in an address would otherwise break the search.</summary>
    public static string EmailQuery(string email) =>
        $"email:'{email.Replace("\\", "\\\\").Replace("'", "\\'")}'";

    public async Task<string> CreateCheckoutSessionAsync(
        string stripeCustomerId, string successUrl, string cancelUrl)
    {
        var session = await new SessionService().CreateAsync(new SessionCreateOptions
        {
            Customer           = stripeCustomerId,
            Mode               = "subscription",
            PaymentMethodTypes = new List<string> { "card" },
            LineItems = new List<SessionLineItemOptions>
            {
                new() { Price = _proPriceId, Quantity = 1 }
            },
            SuccessUrl    = successUrl,
            CancelUrl     = cancelUrl,
            // Stripe handles the payment UI — we never see card numbers
            CustomerUpdate = new SessionCustomerUpdateOptions
            {
                Address = "auto",   // auto-populate billing address
            },
        });

        return session.Url;
    }

    public async Task<string> CreateBillingPortalSessionAsync(
        string stripeCustomerId, string returnUrl)
    {
        var session = await new global::Stripe.BillingPortal.SessionService().CreateAsync(
            new global::Stripe.BillingPortal.SessionCreateOptions
            {
                Customer  = stripeCustomerId,
                ReturnUrl = returnUrl,
            });
        return session.Url;
    }

    public async Task CancelSubscriptionAsync(string subscriptionId)
    {
        try
        {
            await new SubscriptionService().CancelAsync(subscriptionId);
        }
        catch (StripeException e) when (e.HttpStatusCode is System.Net.HttpStatusCode.NotFound
                                                         or System.Net.HttpStatusCode.BadRequest)
        {
            // Already cancelled, or an id from test mode. Either way nothing is
            // left to bill, and it must not block deleting the account.
            _logger.LogInformation("[Stripe] Nothing to cancel for {Subscription}: {Message}",
                subscriptionId, e.Message);
        }
    }

    public Task<StripeWebhookResult> HandleWebhookAsync(string payload, string signature)
    {
        // Only the signature is left to the library. Its own event parser refuses
        // anything newer than the API version it was built for, and a webhook
        // created today is newer: the customer would be charged and never upgraded.
        try
        {
            EventUtility.ValidateSignature(payload, signature, _webhookSecret);
        }
        catch (StripeException ex)
        {
            _logger.LogWarning("[Stripe] Webhook signature validation failed: {Msg}", ex.Message);
            throw;
        }

        var result = ReadEvent(payload);
        _logger.LogInformation("[Stripe] Webhook received: {Type}", result.EventType);
        return Task.FromResult(result);
    }

    /// <summary>
    /// The few fields DIG needs, wherever this event's API version keeps them.
    /// </summary>
    public static StripeWebhookResult ReadEvent(string payload)
    {
        using var doc = JsonDocument.Parse(payload);
        var type = doc.RootElement.GetProperty("type").GetString() ?? "";
        var item = doc.RootElement.GetProperty("data").GetProperty("object");

        switch (type)
        {
            case Events.CustomerSubscriptionCreated:
            case Events.CustomerSubscriptionUpdated:
            case Events.CustomerSubscriptionDeleted:
                return new StripeWebhookResult(
                    type, Text(item, "customer"), Text(item, "id"), Text(item, "status"), PeriodEnd(item));

            case Events.InvoicePaymentSucceeded:
                return new StripeWebhookResult(
                    type, Text(item, "customer"), InvoiceSubscription(item), "active", null);

            case Events.InvoicePaymentFailed:
                return new StripeWebhookResult(
                    type, Text(item, "customer"), InvoiceSubscription(item), "past_due", null);

            default:
                return new StripeWebhookResult(type, null, null, null, null);
        }
    }

    private static string? Text(JsonElement item, string name) =>
        item.ValueKind == JsonValueKind.Object
        && item.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static DateTime? Time(JsonElement item) =>
        item.ValueKind == JsonValueKind.Object
        && item.TryGetProperty("current_period_end", out var value)
        && value.ValueKind == JsonValueKind.Number
            ? DateTimeOffset.FromUnixTimeSeconds(value.GetInt64()).UtcDateTime
            : null;

    /// <summary>On the subscription until the 2025-03-31 API, on its items since.</summary>
    private static DateTime? PeriodEnd(JsonElement subscription)
    {
        if (Time(subscription) is { } onTheSubscription) return onTheSubscription;

        return subscription.TryGetProperty("items", out var items)
            && items.TryGetProperty("data", out var data)
            && data.ValueKind == JsonValueKind.Array
            && data.GetArrayLength() > 0
                ? Time(data[0])
                : null;
    }

    /// <summary>On the invoice until the 2025-03-31 API, under its parent since.</summary>
    private static string? InvoiceSubscription(JsonElement invoice)
    {
        if (Text(invoice, "subscription") is { } onTheInvoice) return onTheInvoice;

        return invoice.TryGetProperty("parent", out var parent)
            && parent.ValueKind == JsonValueKind.Object
            && parent.TryGetProperty("subscription_details", out var details)
                ? Text(details, "subscription")
                : null;
    }
}
