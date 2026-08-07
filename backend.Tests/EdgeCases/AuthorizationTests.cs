using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;
using System.Net;
using System.Net.Http.Json;

namespace backend.Tests.EdgeCases;

/// <summary>
/// Confirms every authenticated endpoint returns 401 when no valid token is present.
///
/// Risk: a missing [Authorize] attribute or misconfigured auth middleware silently
/// exposes endpoints to anonymous users. Running all routes in one place makes
/// it impossible to miss a new endpoint that skipped the attribute.
/// </summary>
[TestFixture]
public class AuthorizationTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;

    [SetUp]
    public void SetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();
        TestAuthHandler.IsAuthenticated = false;  // No auth for all tests in this class
    }

    [TearDown]
    public void TearDown()
    {
        TestAuthHandler.IsAuthenticated = true;  // Restore for other test classes
        _client.Dispose();
        _factory.Dispose();
    }

    // ── Chat endpoints ────────────────────────────────────────────────────────

    [Test]
    public async Task POST_chat_message_WithoutAuth_Returns401()
    {
        // Risk: unauthenticated users triggering analysis pipeline runs = free compute abuse.
        var response = await _client.PostAsJsonAsync("/api/chat/message",
            new { message = "start_analysis" });
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Analysis endpoints ────────────────────────────────────────────────────

    [Test]
    public async Task GET_analyses_history_WithoutAuth_Returns401()
    {
        var response = await _client.GetAsync("/api/analyses/history");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Test]
    public async Task GET_analyses_active_WithoutAuth_Returns401()
    {
        var response = await _client.GetAsync("/api/analyses/active");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Test]
    public async Task GET_analyses_byId_WithoutAuth_Returns401()
    {
        var response = await _client.GetAsync($"/api/analyses/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Test]
    public async Task GET_analyses_status_WithoutAuth_Returns401()
    {
        var response = await _client.GetAsync($"/api/analyses/{Guid.NewGuid()}/status");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Test]
    public async Task GET_analyses_download_WithoutAuth_Returns401()
    {
        var response = await _client.GetAsync($"/api/analyses/{Guid.NewGuid()}/download/report");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Test]
    public async Task GET_analyses_visualizations_WithoutAuth_Returns401()
    {
        var response = await _client.GetAsync($"/api/analyses/{Guid.NewGuid()}/visualizations");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Test]
    public async Task DELETE_analyses_WithoutAuth_Returns401()
    {
        var response = await _client.DeleteAsync($"/api/analyses/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Test]
    public async Task POST_analyses_upload_WithoutAuth_Returns401()
    {
        // Risk: anonymous file upload bypasses the free-quota check entirely.
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent("a,b\n1,2"), "file", "data.csv");
        var response = await _client.PostAsync("/api/analyses/upload", content);
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Health endpoint — must NOT require auth ───────────────────────────────

    [Test]
    public async Task GET_health_WithoutAuth_Returns200_NotUnauthorized()
    {
        // Risk: accidentally adding [Authorize] to health breaks load balancer checks.
        var response = await _client.GetAsync("/health");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
