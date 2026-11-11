using System.Net.Http.Json;
using System.Text.Json;
using backend.Application.Services;
using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;

namespace backend.Tests.Integration;

/// <summary>
/// A guest who answers No to "proceed anyway?" gets no run. It used to start
/// one regardless and spend one of the guest's two daily analyses.
/// </summary>
[TestFixture]
public class GuestAnswerTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;
    private Guid _session;

    [SetUp]
    public void SetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();
        _session = Guid.NewGuid();
        Directory.CreateDirectory(UploadStore.Guests.Root);
        File.WriteAllText(Path.Combine(UploadStore.Guests.Root, $"{_session}.csv"), "a,b\n1,2\n3,4");
    }

    [TearDown]
    public void TearDown()
    {
        UploadStore.Guests.Delete(_session);
        _client.Dispose();
        _factory.Dispose();
    }

    private async Task<JsonElement> Answer(string message, string pending)
    {
        var res = await _client.PostAsJsonAsync("/api/guest/chat", new
        {
            message, sessionId = _session.ToString(), fileName = "data.csv", pendingCondition = pending,
        });
        return JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
    }

    [Test]
    public async Task No_ToProceedAnyway_RunsNothing()
    {
        var reply = await Answer("no", "low_accuracy");

        reply.GetProperty("failed").GetBoolean().Should().BeTrue();
        reply.GetProperty("reply").GetString().Should().Contain("nothing was run");
        File.Exists(Path.Combine(UploadStore.Guests.Root, $"{_session}.csv"))
            .Should().BeTrue("the upload stays, so the guest can still choose to run it");
    }
}
