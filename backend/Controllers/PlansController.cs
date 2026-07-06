using backend.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace backend.Controllers;

/// <summary>
/// Handles plan management and Stripe billing.
///
/// Flow:
///   1. GET  /api/plans              → show available plans + user's current plan
///   2. POST /api/plans/subscribe    → create Stripe Checkout session, return redirect URL
///   3. POST /api/plans/portal       → open Stripe Billing Portal (cancel / update card)
///   4. POST /api/plans/webhook      → Stripe event listener (payment success / cancel)
/// </summary>
[ApiController]
[Route("api/plans")]
public class PlansController : ControllerBase
{
    private readonly IStripeService  _stripe;
    private readonly IUserRepository _users;
    private readonly ILogger<PlansController> _logger;
    private readonly IConfiguration  _config;

    // Static plan definitions — could come from config but kept inline for clarity
    private static readonly object FreePlan = new
    {
        id          = "free",
        name        = "Free",
        priceCAD    = 0,
        interval    = "forever",
        reports     = 2,
        reportWindow = "48h",
        historyLimit = 5,
        features    = new[]
        {
            "2 analyses per 48 hours",
            "5 history slots",
            "Standard AI model",
            "PDF report",
            "CSV download",
        },
        missingFeatures = new[]
        {
            "Unlimited analyses",
            "Word & PowerPoint export",
            "Chatbot customization",
            "Team collaboration",
            "Real-time workspace",
            "15 history slots",
        }
    };

    private static readonly object ProPlan = new
    {
        id          = "pro",
        name        = "Pro",
        priceCAD    = 9.99m,
        interval    = "month",
        reports     = -1,      // unlimited
        historyLimit = 15,
        features    = new[]
        {
            "Unlimited analyses",
            "15 history slots",
            "Full AI model (Gemini 2.5 Flash)",
            "PDF, Word & PowerPoint export",
            "Chatbot customization (language, tone, insights)",
            "Team collaboration workspace",
            "Real-time cursors & annotations",
            "Priority support",
        },
        missingFeatures = Array.Empty<string>()
    };

    public PlansController(
        IStripeService  stripe,
        IUserRepository users,
        IConfiguration  config,
        ILogger<PlansController> logger)
    {
        _stripe = stripe;
        _users  = users;
        _config = config;
        _logger = logger;
    }

    private Guid? TryGetUserId()
    {
        var c = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(c, out var id) ? id : null;
    }

    // ── GET /api/plans ────────────────────────────────────────────────────────
    // Returns both plan definitions + the authenticated user's current plan
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetPlans()
    {
        object? userPlanInfo = null;
        var userId = TryGetUserId();

        if (userId.HasValue)
        {
            var user = await _users.GetByIdAsync(userId.Value);
            if (user != null)
            {
                userPlanInfo = new
                {
                    plan           = user.Plan,
                    planExpiresAt  = user.PlanExpiresAt,
                    reportsUsed    = user.ReportsUsed,
                    reportsResetAt = user.ReportsResetAt,
                    historyLimit   = user.Plan is "pro" or "admin" ? 15 : 5,
                };
            }
        }

        return Ok(new { plans = new[] { FreePlan, ProPlan }, userPlan = userPlanInfo });
    }

    // ── POST /api/plans/subscribe ─────────────────────────────────────────────
    // Creates a Stripe Checkout session and returns the hosted payment URL.
    // The user is redirected to Stripe's page — no card data touches DIG.
    [HttpPost("subscribe")]
    [Authorize]
    public async Task<IActionResult> Subscribe()
    {
        var userId = TryGetUserId();
        if (!userId.HasValue) return Unauthorized();

        var user = await _users.GetByIdAsync(userId.Value);
        if (user == null) return NotFound(new { error = "USER_NOT_FOUND" });

        if (user.Plan == "pro")
            return BadRequest(new { error = "ALREADY_PRO", message = "You are already on the Pro plan." });

        var appUrl = _config["AppUrl"]?.TrimEnd('/') ?? "https://datainsightgen.com";

        try
        {
            // Create or retrieve Stripe customer for this user
            var customerId = await _stripe.GetOrCreateCustomerAsync(
                userId.Value, user.Email, user.UserName);

            // Save the Stripe customer ID so we can link webhook events back to this user
            await _users.SetStripeCustomerIdAsync(userId.Value, customerId);

            var checkoutUrl = await _stripe.CreateCheckoutSessionAsync(
                customerId,
                successUrl: $"{appUrl}/dashboard/plan?upgraded=1",
                cancelUrl:  $"{appUrl}/plans");

            return Ok(new { url = checkoutUrl });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Plans] Checkout session creation failed for user {Id}", userId);
            return StatusCode(500, new { error = "STRIPE_ERROR", message = "Could not create payment session." });
        }
    }

    // ── POST /api/plans/portal ────────────────────────────────────────────────
    // Returns the Stripe Billing Portal URL where the user can manage / cancel.
    [HttpPost("portal")]
    [Authorize]
    public async Task<IActionResult> Portal()
    {
        var userId = TryGetUserId();
        if (!userId.HasValue) return Unauthorized();

        var user = await _users.GetByIdAsync(userId.Value);
        if (user?.StripeCustomerId == null)
            return BadRequest(new { error = "NO_SUBSCRIPTION", message = "No active subscription found." });

        var appUrl    = _config["AppUrl"]?.TrimEnd('/') ?? "https://datainsightgen.com";
        var portalUrl = await _stripe.CreateBillingPortalSessionAsync(
            user.StripeCustomerId,
            returnUrl: $"{appUrl}/dashboard/plan");

        return Ok(new { url = portalUrl });
    }

    // ── POST /api/plans/webhook ───────────────────────────────────────────────
    // Stripe sends signed events here. We update the user's plan based on them.
    // NO authentication header — Stripe doesn't send one.
    // Security: we verify the Stripe-Signature header instead.
    [HttpPost("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Webhook()
    {
        var payload   = await new StreamReader(Request.Body).ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"].FirstOrDefault() ?? "";

        StripeWebhookResult result;
        try
        {
            result = await _stripe.HandleWebhookAsync(payload, signature);
        }
        catch
        {
            return BadRequest(); // Invalid signature
        }

        if (result.CustomerId == null) return Ok(); // Event we don't care about

        var user = await _users.GetByStripeCustomerIdAsync(result.CustomerId);
        if (user == null)
        {
            _logger.LogWarning("[Plans] Webhook: no user found for customer {Id}", result.CustomerId);
            return Ok();
        }

        switch (result.EventType)
        {
            case "customer.subscription.created":
            case "invoice.payment_succeeded":
                // Payment went through — upgrade to pro
                await _users.SetPlanAsync(user.Id, "pro",
                    planExpiresAt:      result.CurrentPeriodEnd,
                    stripeSubscriptionId: result.SubscriptionId);
                _logger.LogInformation("[Plans] Upgraded user {Id} to pro", user.Id);
                break;

            case "customer.subscription.deleted":
                // Subscription cancelled — downgrade to free
                await _users.SetPlanAsync(user.Id, "free",
                    planExpiresAt: null, stripeSubscriptionId: null);
                _logger.LogInformation("[Plans] Downgraded user {Id} to free", user.Id);
                break;

            case "invoice.payment_failed":
                // Payment failed — mark as past_due but keep access until period ends
                _logger.LogWarning("[Plans] Payment failed for user {Id}", user.Id);
                break;
        }

        return Ok();
    }
}
