using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Encodings.Web;

namespace backend.Tests.Helpers;

/// <summary>
/// Replaces JWT Bearer authentication in tests so we don't need a real
/// Supabase JWKS endpoint. Tests control which user is "logged in" by
/// setting CurrentUserId before making requests.
///
/// Uses plain static properties (no [ThreadStatic] or AsyncLocal) because:
///   - Tests run sequentially by default in NUnit, so no concurrent access.
///   - [ThreadStatic] doesn't work: NUnit SetUp and [Test] share a thread, but
///     async continuations inside the test may resume on thread-pool threads that
///     have their own uninitialized [ThreadStatic] slots.
///   - AsyncLocal doesn't work: NUnit creates independent execution contexts for
///     [SetUp] and [Test] methods, so AsyncLocal changes in SetUp don't flow into
///     the test method's async context.
///   - Plain static works: SetUp writes, the HTTP handler reads, no concurrency
///     since tests are sequential.
///
/// Risk mitigated: test isolation — each test can authenticate as any user ID
/// without sharing credentials or hitting external auth infrastructure.
/// </summary>
public class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "TestScheme";

    /// <summary>
    /// The user ID injected into the "sub" claim for authenticated requests.
    /// Set this in your test [SetUp] before creating the client.
    /// </summary>
    public static Guid CurrentUserId { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Set to false to simulate an unauthenticated request (triggers 401).
    /// Defaults to true so tests can just set CurrentUserId without explicitly
    /// setting IsAuthenticated.
    /// </summary>
    public static bool IsAuthenticated { get; set; } = true;

    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!IsAuthenticated)
            return Task.FromResult(AuthenticateResult.Fail("Test: not authenticated"));

        var claims = new[]
        {
            new Claim("sub",                          CurrentUserId.ToString()),
            new Claim(ClaimTypes.NameIdentifier,      CurrentUserId.ToString()),
            new Claim(ClaimTypes.Name,                "Test User"),
            new Claim(ClaimTypes.Email,               "test@example.com"),
        };

        var identity  = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket    = new AuthenticationTicket(principal, SchemeName);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
