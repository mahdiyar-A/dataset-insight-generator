using System.Net;
using System.Net.Http.Json;
using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// The guest dashboard is gone, and with it every way to run an analysis
/// without an account. A visitor who can't be told apart can't be held to an
/// allowance, and each guest run spent the free AI quota everyone shares. The
/// demo shows the product instead; a free account runs it on your own data.
/// None of the old guest addresses may answer.
/// </summary>
[TestFixture]
public class NoGuestRoutesTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;

    [OneTimeSetUp]
    public void OneTimeSetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();
    }

    [OneTimeTearDown]
    public void OneTimeTearDown()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Test]
    public async Task TheGuestChat_IsGone()
    {
        var response = await _client.PostAsJsonAsync("/api/guest/chat",
            new { message = "start_analysis", sessionId = Guid.NewGuid() });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task TheGuestUpload_IsGone()
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("a,b\n1,2\n"), "file", "data.csv");
        form.Add(new StringContent(Guid.NewGuid().ToString()), "sessionId");

        var response = await _client.PostAsync("/api/guest/upload", form);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task TheGuestStatus_IsGone()
    {
        var response = await _client.GetAsync($"/api/guest/status/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
