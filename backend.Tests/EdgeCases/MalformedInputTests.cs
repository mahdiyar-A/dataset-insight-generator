using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace backend.Tests.EdgeCases;

/// <summary>
/// Tests for malformed/boundary inputs — invalid GUIDs in routes, null bodies,
/// broken JSON, and out-of-range field values.
///
/// Risk focus: a route that can't handle "abc" where a GUID is expected should
/// return 400/404, not 500 (unhandled exception). These tests guard the gap
/// between ASP.NET model binding and controller logic.
/// </summary>
[TestFixture]
public class MalformedInputTests
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

    // ── GUID route parameters ─────────────────────────────────────────────────

    [Test]
    public async Task GetAnalysis_WithNonGuidId_Returns404()
    {
        // Risk: if the route constraint :guid isn't set, a non-UUID reaches the
        // controller and causes a FormatException trying to parse it — 500 not 404.
        var response = await _client.GetAsync("/api/analyses/not-a-guid");
        ((int)response.StatusCode).Should().BeOneOf(400, 404);
    }

    [Test]
    public async Task GetStatus_WithNonGuidId_Returns404()
    {
        var response = await _client.GetAsync("/api/analyses/abc123/status");
        ((int)response.StatusCode).Should().BeOneOf(400, 404);
    }

    [Test]
    public async Task Download_WithNonGuidId_Returns404()
    {
        var response = await _client.GetAsync("/api/analyses/not-a-guid/download/report");
        ((int)response.StatusCode).Should().BeOneOf(400, 404);
    }

    [Test]
    public async Task Delete_WithNonGuidId_Returns404()
    {
        var response = await _client.DeleteAsync("/api/analyses/bad-id");
        ((int)response.StatusCode).Should().BeOneOf(400, 404);
    }

    // ── Null / missing request body ───────────────────────────────────────────

    [Test]
    public async Task PostChatMessage_WithNullBody_Returns400OrThrows()
    {
        // Risk: null body causes NullReferenceException in the controller if
        // the [FromBody] binding doesn't reject it first.
        var content  = new StringContent("null", Encoding.UTF8, "application/json");
        var response = await _client.PostAsync("/api/chat/message", content);
        ((int)response.StatusCode).Should().BeOneOf(400, 422);
    }

    [Test]
    public async Task PostChatMessage_WithMalformedJson_Returns400()
    {
        // Risk: unclosed braces / truncated JSON from a bad network request
        // should produce 400, not 500 (JSON parse exception leaked as error).
        var content  = new StringContent("{\"message\":", Encoding.UTF8, "application/json");
        var response = await _client.PostAsync("/api/chat/message", content);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task PostChatMessage_WithEmptyBody_Returns400()
    {
        // Risk: Content-Length: 0 with Content-Type: application/json causes
        // model binding to produce a null DTO — controller must handle that.
        var content  = new StringContent("", Encoding.UTF8, "application/json");
        var response = await _client.PostAsync("/api/chat/message", content);
        ((int)response.StatusCode).Should().BeOneOf(400, 422);
    }

    // ── Boundary: InsightsCount out of range ──────────────────────────────────

    [Test]
    public async Task PostChatMessage_InsightsCount_Zero_DoesNotCrash()
    {
        // Risk: Python expects insights_count >= 1. A zero slips through if C#
        // doesn't validate it and Python generates an empty list — silent failure.
        var body = new
        {
            message       = "start_analysis",
            fileName      = "test.csv",
            customization = new { insightsCount = 0 },
        };
        var response = await _client.PostAsJsonAsync("/api/chat/message", body);
        // Must not 500 — either 400 (validation rejected it) or 200 (controller
        // clamped it). A 500 means the bad value reached Python unchecked.
        ((int)response.StatusCode).Should().NotBe(500);
    }

    [Test]
    public async Task PostChatMessage_InsightsCount_Negative_DoesNotCrash()
    {
        var body = new
        {
            message       = "start_analysis",
            fileName      = "test.csv",
            customization = new { insightsCount = -5 },
        };
        var response = await _client.PostAsJsonAsync("/api/chat/message", body);
        ((int)response.StatusCode).Should().NotBe(500);
    }

    [Test]
    public async Task PostChatMessage_InsightsCount_VeryLarge_DoesNotCrash()
    {
        // Risk: insights_count = 1000 causes an extremely large prompt to Gemini,
        // blowing past token limits and causing the AI service to 500.
        var body = new
        {
            message       = "start_analysis",
            fileName      = "test.csv",
            customization = new { insightsCount = 99999 },
        };
        var response = await _client.PostAsJsonAsync("/api/chat/message", body);
        ((int)response.StatusCode).Should().NotBe(500);
    }

    // ── Boundary: empty string fields ─────────────────────────────────────────

    [Test]
    public async Task PostChatMessage_EmptyFileName_DoesNotCrash()
    {
        // Risk: empty fileName means Path.GetExtension returns "" and the temp
        // file lookup fails with a confusing exception instead of a clean error.
        var body = new
        {
            message  = "start_analysis",
            fileName = "",
        };
        var response = await _client.PostAsJsonAsync("/api/chat/message", body);
        ((int)response.StatusCode).Should().NotBe(500);
    }

    // ── Unknown download type ─────────────────────────────────────────────────

    [Test]
    public async Task Download_UnknownFileType_Returns404_NotServerError()
    {
        // Risk: an unknown type like "exe" or "../../etc/passwd" reaches the
        // switch expression and returns null path — should be 404, not 500.
        TestAuthHandler.IsAuthenticated = true;
        var analysis = new backend.Domain.Entities.Analysis(
            TestAuthHandler.CurrentUserId, "data.csv", 1024);
        analysis.SetStatus("done");
        analysis.SetPdfPath("some/path.pdf");
        _factory.AnalysisRepo.Store.Add(analysis);

        var response = await _client.GetAsync(
            $"/api/analyses/{analysis.Id}/download/../../etc/passwd");

        // The route constraint {type} is just a string — the :guid constraint on id
        // won't affect this. The switch returns null, so we expect 404.
        ((int)response.StatusCode).Should().BeOneOf(404, 400);
    }

    // ── Very long strings ─────────────────────────────────────────────────────

    [Test]
    public async Task PostChatMessage_VeryLongMessage_DoesNotCrash()
    {
        // Risk: an extremely long message (e.g., 100KB) could cause the chat
        // controller to pass a huge string to the AI or the DB without truncation.
        var longMessage = new string('x', 100_000);
        var body = new { message = longMessage };
        var response = await _client.PostAsJsonAsync("/api/chat/message", body);
        // Must not 500 — either 400 (too long) or 200 (gracefully handled/truncated).
        ((int)response.StatusCode).Should().NotBe(500);
    }
}
