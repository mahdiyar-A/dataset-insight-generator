using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;
using System.Net;

namespace backend.Tests.Integration;

/// <summary>
/// The team and workspace routes, reached through the app as it is really put
/// together.
///
/// The unit tests build each controller by hand, so they cannot notice a
/// service the app forgot to register. A request that is not signed in cannot
/// either: it is turned away before the controller is built. So a missing
/// registration would pass every other test and fail every signed-in call on
/// the live site.
/// </summary>
[TestFixture]
public class TeamsWiringTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;

    [SetUp]
    public void SetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();
        TestAuthHandler.CurrentUserId   = Guid.NewGuid();
        TestAuthHandler.IsAuthenticated = true;
    }

    [TearDown]
    public void TearDown()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [TestCase("/api/teams")]
    [TestCase("/api/workspaces")]
    public async Task ASignedInPersonWithNoTeamsGetsAnEmptyList(string route)
    {
        var response = await _client.GetAsync(route);

        response.StatusCode.Should().Be(HttpStatusCode.OK, "the controller has to be buildable from what the app registers");
        (await response.Content.ReadAsStringAsync()).Should().Be("[]");
    }
}
