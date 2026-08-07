using backend.Application.Interfaces;
using backend.Application.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace backend.Tests.Helpers;

/// <summary>
/// Spins up the full ASP.NET Core pipeline in-process with:
///   - All infrastructure (Supabase, Stripe, SMTP, Python AI) replaced by fakes
///   - JWT authentication replaced by TestAuthHandler (no JWKS fetch needed)
///   - Configuration stubs so Program.cs startup doesn't throw on missing keys
///
/// This lets integration tests exercise the real routing, middleware, model binding,
/// controller logic, and response serialization — everything except external I/O.
///
/// Risk mitigated: tests that only mock at the controller level would miss
/// middleware bugs, auth policy mismatches, and DI wiring errors.
/// </summary>
public class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    // Shared fake instances — tests can inspect them to verify side-effects
    public FakeAnalysisRepository AnalysisRepo   { get; } = new();
    public FakeDatasetRepository  DatasetRepo    { get; } = new();
    public FakeUserRepository     UserRepo       { get; } = new();
    public FakeStorageService     StorageSvc     { get; } = new();
    public FakePythonAiClient     PythonAi       { get; } = new();
    public NoOpEmailService       EmailSvc       { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // ── Provide config values that Program.cs requires at startup ────────
        // Without these, the app throws InvalidOperationException before
        // ConfigureTestServices even runs.
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                // Allow all hostnames in tests (appsettings.json restricts to
                // production domains; the test client uses Host: localhost)
                ["AllowedHosts"] = "*",

                // Fake Supabase — the Supabase.Client singleton is replaced below
                // so these values are never actually used to connect
                ["Supabase:Url"]       = "https://fake-project.supabase.co",
                ["Supabase:SecretKey"] = "fake-secret-key",
                // Stripe — keys are read in StripeService constructor
                ["Stripe:SecretKey"]     = "sk_test_fake",
                ["Stripe:WebhookSecret"] = "whsec_fake",
                ["Stripe:ProPriceId"]    = "price_fake",
                // AI service — only used if real PythonAiClient is invoked
                ["AIService:BaseUrl"]    = "http://localhost:18000",
            });
        });

        builder.ConfigureServices(services =>
        {
            // ── Replace Supabase client singleton ────────────────────────────
            // The production registration calls InitializeAsync() which would
            // try to connect to a real Supabase URL. Replacing it prevents that.
            // Since all repositories are also replaced, nothing ever resolves
            // the real Supabase.Client.
            services.RemoveAll<Supabase.Client>();
            services.AddSingleton<Supabase.Client>(_ =>
                // Return a no-op client — never actually used by test fakes
                null!);

            // ── Replace all infrastructure with in-memory fakes ──────────────
            // Pattern: RemoveAll removes existing registrations, then re-add
            // with the shared fake instance so tests can inspect state.
            services.RemoveAll<IAnalysisRepository>();
            services.AddScoped<IAnalysisRepository>(_ => AnalysisRepo);

            services.RemoveAll<IDatasetRepository>();
            services.AddScoped<IDatasetRepository>(_ => DatasetRepo);

            services.RemoveAll<IUserRepository>();
            services.AddScoped<IUserRepository>(_ => UserRepo);

            services.RemoveAll<IStorageService>();
            services.AddScoped<IStorageService>(_ => StorageSvc);

            services.RemoveAll<IPythonAiClient>();
            services.AddScoped<IPythonAiClient>(_ => PythonAi);

            // Email and Stripe don't need to be replaced unless a test
            // specifically exercises those paths, but remove to avoid
            // real SMTP / Stripe network calls
            services.RemoveAll<IEmailService>();
            services.AddScoped<IEmailService>(_ => EmailSvc);

            services.RemoveAll<IStripeService>();
            services.AddScoped<IStripeService, NoOpStripeService>();

            // ── Replace JWT with test auth handler ───────────────────────────
            // The production JWT handler tries to fetch JWKS from Supabase.
            // This replaces the entire authentication pipeline with a handler
            // that reads user ID from TestAuthHandler.CurrentUserId.
            services.AddAuthentication(opts =>
            {
                opts.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                opts.DefaultChallengeScheme    = TestAuthHandler.SchemeName;
            })
            .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(
                TestAuthHandler.SchemeName, _ => { });
        });

        // Run in test environment to trigger development-mode behaviors
        builder.UseEnvironment("Development");
    }
}

// ── Minimal no-op implementations ────────────────────────────────────────────

/// <summary>
/// Recording IEmailService — captures what would have been sent instead of
/// hitting SMTP, and can be made to throw on demand.
///
/// Risk: a no-op email fake lets a test pass whether the endpoint sent a real
/// report, an empty attachment, or nothing at all. Capturing the payload is what
/// makes "did we actually email the report?" an assertable question.
/// </summary>
public class NoOpEmailService : IEmailService
{
    public record SentReport(string ToEmail, string UserName, byte[] PdfBytes, string FileName);

    /// <summary>Every report send, in order.</summary>
    public List<SentReport> SentReports { get; } = new();

    /// <summary>Set to true to simulate an SMTP failure on SendReportAsync.</summary>
    public bool ThrowOnSend { get; set; } = false;

    public Task SendEmailVerificationAsync(string toEmail, string userName, string token) => Task.CompletedTask;
    public Task SendPasswordResetAsync(string toEmail, string userName, string token) => Task.CompletedTask;
    public Task SendEmailChangeVerificationAsync(string toNewEmail, string userName, string token) => Task.CompletedTask;
    public Task SendPhoneOtpAsync(string toEmail, string userName, string otp) => Task.CompletedTask;
    public Task SendTeamInviteAsync(string toEmail, string inviterName, string teamName, string inviteUrl, string role) => Task.CompletedTask;

    public Task SendReportAsync(string toEmail, string userName, byte[] pdfBytes, string reportFileName)
    {
        if (ThrowOnSend)
            // Deliberately shaped like a real SMTP error: the message carries host
            // and credential hints, which is exactly what must not reach the client.
            throw new InvalidOperationException(
                "SMTP connect failed: smtp.internal.example.com:587 auth user=dig-mailer");

        SentReports.Add(new SentReport(toEmail, userName, pdfBytes, reportFileName));
        return Task.CompletedTask;
    }
}

public class NoOpStripeService : IStripeService
{
    public Task<string> GetOrCreateCustomerAsync(Guid userId, string email, string name) =>
        Task.FromResult("cus_fake");

    public Task<string> CreateCheckoutSessionAsync(string customerId, string successUrl, string cancelUrl) =>
        Task.FromResult("https://checkout.stripe.com/fake");

    public Task<string> CreateBillingPortalSessionAsync(string customerId, string returnUrl) =>
        Task.FromResult("https://billing.stripe.com/fake");

    public Task<StripeWebhookResult> HandleWebhookAsync(string payload, string signature) =>
        Task.FromResult(new StripeWebhookResult("fake_event", null, null, "active", null));
}
