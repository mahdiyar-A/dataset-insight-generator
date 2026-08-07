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
            new global::Stripe.CustomerSearchOptions { Query = $"email:'{email}'" });

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
            SuccessUrl    = successUrl + "?session_id={CHECKOUT_SESSION_ID}",
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

    public Task<StripeWebhookResult> HandleWebhookAsync(string payload, string signature)
    {
        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(payload, signature, _webhookSecret);
        }
        catch (StripeException ex)
        {
            _logger.LogWarning("[Stripe] Webhook signature validation failed: {Msg}", ex.Message);
            throw;
        }

        _logger.LogInformation("[Stripe] Webhook received: {Type}", stripeEvent.Type);

        string? customerId    = null;
        string? subscriptionId = null;
        string? status         = null;
        DateTime? periodEnd    = null;

        switch (stripeEvent.Type)
        {
            case Events.CustomerSubscriptionCreated:
            case Events.CustomerSubscriptionUpdated:
            case Events.CustomerSubscriptionDeleted:
            {
                var sub = stripeEvent.Data.Object as Subscription;
                customerId     = sub?.CustomerId;
                subscriptionId = sub?.Id;
                status         = sub?.Status;           // "active", "canceled", "past_due"
                periodEnd      = sub?.CurrentPeriodEnd;
                break;
            }
            case Events.InvoicePaymentSucceeded:
            {
                var inv = stripeEvent.Data.Object as Invoice;
                customerId     = inv?.CustomerId;
                subscriptionId = inv?.SubscriptionId;
                status         = "active";
                break;
            }
            case Events.InvoicePaymentFailed:
            {
                var inv = stripeEvent.Data.Object as Invoice;
                customerId     = inv?.CustomerId;
                subscriptionId = inv?.SubscriptionId;
                status         = "past_due";
                break;
            }
        }

        return Task.FromResult(new StripeWebhookResult(
            stripeEvent.Type, customerId, subscriptionId, status, periodEnd));
    }
}
