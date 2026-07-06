namespace backend.Application.Interfaces;

public interface IStripeService
{
    // Creates or retrieves a Stripe customer for this user
    Task<string> GetOrCreateCustomerAsync(Guid userId, string email, string name);

    // Creates a Stripe Checkout Session for the Pro plan subscription
    // Returns the Checkout URL to redirect the user to
    Task<string> CreateCheckoutSessionAsync(
        string stripeCustomerId,
        string successUrl,
        string cancelUrl);

    // Creates a Stripe Billing Portal session so the user can manage / cancel their subscription
    Task<string> CreateBillingPortalSessionAsync(string stripeCustomerId, string returnUrl);

    // Verifies a Stripe webhook payload and returns the event type + relevant data
    Task<StripeWebhookResult> HandleWebhookAsync(string payload, string signature);
}

public record StripeWebhookResult(
    string EventType,
    string? CustomerId,
    string? SubscriptionId,
    string? Status,          // "active" | "canceled" | "past_due" etc.
    DateTime? CurrentPeriodEnd
);
