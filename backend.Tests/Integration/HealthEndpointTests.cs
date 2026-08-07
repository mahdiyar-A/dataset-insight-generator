using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;
using System.Net;
using System.Text.Json;

namespace backend.Tests.Integration;

/// <summary>
/// Verifies the /health endpoint.
///
/// Risk mitigated: /health is used by load balancers and deployment pipelines
/// to decide whether to route traffic. If it returns 500 or wrong content,
/// the app is pulled from rotation even when the core pipeline is fine.
/// </summary>
[TestFixture]
public class HealthEndpointTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;

    [SetUp]
    public void SetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();
    }

    [TearDown]
    public void TearDown()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Test]
    public async Task GET_health_Returns200()
    {
        var response = await _client.GetAsync("/health");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Test]
    public async Task GET_health_ReturnsStatusOk_InResponseBody()
    {
        // Risk: a 200 with {"status":"degraded"} would look healthy to curl
        // but fail structured health checks.
        var response = await _client.GetAsync("/health");
        var body     = await response.Content.ReadAsStringAsync();
        var doc      = JsonDocument.Parse(body);
        doc.RootElement.GetProperty("status").GetString().Should().Be("ok");
    }

    [Test]
    public async Task GET_health_DoesNotRequireAuthentication()
    {
        // Risk: if the health endpoint accidentally gets an [Authorize] attribute
        // added, load balancers receive 401 and mark the service unhealthy.
        // This test runs without any auth header.
        TestAuthHandler.IsAuthenticated = false;
        var response = await _client.GetAsync("/health");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        TestAuthHandler.IsAuthenticated = true;
    }
}
