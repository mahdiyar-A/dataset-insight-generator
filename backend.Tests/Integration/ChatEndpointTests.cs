using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace backend.Tests.Integration;

/// <summary>
/// Integration tests for POST /api/chat/message — the core chatbot flow.
///
/// This endpoint drives the entire analysis pipeline:
///   "start_analysis" → quality check → conditional yes/no prompt
///   "yes"/"no"       → kicks off background pipeline
///
/// Risk focus:
///   - The start_analysis branch has 4 conditional paths (all_good, not_clean,
///     low_accuracy, not_workable) — each must produce the correct Response shape.
///   - The yes/no branch must correctly wire userWantsCleaning and userConfirmedLow
///     based on what condition was pending.
///   - Empty message must be rejected before any file I/O is attempted.
/// </summary>
[TestFixture]
public class ChatEndpointTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;

    private static readonly string TempDir =
        Path.Combine(Path.GetTempPath(), "dig_uploads");

    [SetUp]
    public void SetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();

        // Set a fresh user ID for each test to avoid cross-test temp file collisions
        TestAuthHandler.CurrentUserId  = Guid.NewGuid();
        TestAuthHandler.IsAuthenticated = true;

        Directory.CreateDirectory(TempDir);
    }

    [TearDown]
    public void TearDown()
    {
        // Clean up any temp file left by the test
        var tempFile = Path.Combine(TempDir, $"{TestAuthHandler.CurrentUserId}.csv");
        if (File.Exists(tempFile)) File.Delete(tempFile);

        _client.Dispose();
        _factory.Dispose();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static async Task<JsonDocument> PostMessage(
        HttpClient client, string message,
        string? pendingCondition = null,
        object? customization = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["message"]          = message,
            ["fileName"]         = "test.csv",
            ["fileSizeBytes"]    = 1024,
            ["rowCount"]         = 100,
            ["columnCount"]      = 5,
            ["pendingCondition"] = pendingCondition,
            ["customization"]    = customization,
        };
        var response = await client.PostAsJsonAsync("/api/chat/message", body);
        var raw = await response.Content.ReadAsStringAsync();
        return JsonDocument.Parse(raw);
    }

    private static void WriteTempCsv(Guid userId, string content = "a,b\n1,2\n3,4")
    {
        var path = Path.Combine(TempDir, $"{userId}.csv");
        File.WriteAllText(path, content);
    }

    // ── Guard: empty message ─────────────────────────────────────────────────

    [Test]
    public async Task EmptyMessage_Returns400WithErrorCode()
    {
        // Risk: without this guard, an empty message falls through to the
        // unrecognized-message branch and sends a confusing "I didn't understand"
        // response instead of a clear validation error.
        var response = await _client.PostAsJsonAsync("/api/chat/message",
            new { message = "" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("EMPTY_MESSAGE");
    }

    [Test]
    public async Task WhitespaceOnlyMessage_Returns400()
    {
        // Risk: "   " trims to "" — should be rejected same as empty.
        var response = await _client.PostAsJsonAsync("/api/chat/message",
            new { message = "   " });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── start_analysis: no temp file ─────────────────────────────────────────

    [Test]
    public async Task StartAnalysis_WhenNoTempFileUploaded_ReturnsFailed()
    {
        // Risk: the controller checks for the temp file before calling Python.
        // If this guard is missing, the pipeline starts with an empty byte array
        // and produces a corrupted report with no data.
        var doc = await PostMessage(_client, "start_analysis");

        doc.RootElement.GetProperty("failed").GetBoolean().Should().BeTrue();
        doc.RootElement.GetProperty("done").GetBoolean().Should().BeFalse();
        var reply = doc.RootElement.GetProperty("reply").GetString();
        reply.Should().NotBeNullOrEmpty();
    }

    // ── start_analysis: with temp file, condition = all_good ─────────────────

    [Test]
    public async Task StartAnalysis_AllGood_ReturnsCorrectConditionAndNoPrompt()
    {
        // Risk: "all_good" should kick off analysis immediately without asking
        // the user yes/no. If requiresResponse is accidentally true here, the user
        // is stuck waiting for a prompt that never comes.
        WriteTempCsv(TestAuthHandler.CurrentUserId);
        _factory.PythonAi.CheckCondition = "all_good";

        var doc = await PostMessage(_client, "start_analysis");

        doc.RootElement.GetProperty("condition").GetString().Should().Be("all_good");
        doc.RootElement.GetProperty("requiresResponse").GetBoolean().Should().BeFalse();
        doc.RootElement.GetProperty("failed").GetBoolean().Should().BeFalse();
    }

    // ── start_analysis: condition = not_clean ────────────────────────────────

    [Test]
    public async Task StartAnalysis_NotClean_AsksCleaning_RequiresResponse()
    {
        // Risk: if requiresResponse is false here, the frontend doesn't show
        // yes/no buttons and the user can't consent to cleaning — silent skip.
        WriteTempCsv(TestAuthHandler.CurrentUserId);
        _factory.PythonAi.CheckCondition = "not_clean";

        var doc = await PostMessage(_client, "start_analysis");

        doc.RootElement.GetProperty("condition").GetString().Should().Be("not_clean");
        doc.RootElement.GetProperty("requiresResponse").GetBoolean().Should().BeTrue();
        doc.RootElement.GetProperty("failed").GetBoolean().Should().BeFalse();
    }

    // ── start_analysis: condition = low_accuracy ─────────────────────────────

    [Test]
    public async Task StartAnalysis_LowAccuracy_AsksConfirmation_RequiresResponse()
    {
        WriteTempCsv(TestAuthHandler.CurrentUserId);
        _factory.PythonAi.CheckCondition = "low_accuracy";

        var doc = await PostMessage(_client, "start_analysis");

        doc.RootElement.GetProperty("condition").GetString().Should().Be("low_accuracy");
        doc.RootElement.GetProperty("requiresResponse").GetBoolean().Should().BeTrue();
    }

    // ── start_analysis: condition = not_workable ─────────────────────────────

    [Test]
    public async Task StartAnalysis_NotWorkable_ReturnsFailed_NoPrompt()
    {
        // Risk: not_workable datasets should not proceed to yes/no — the user
        // needs to upload a different file, not confirm a broken one.
        WriteTempCsv(TestAuthHandler.CurrentUserId);
        _factory.PythonAi.CheckCondition = "not_workable";

        var doc = await PostMessage(_client, "start_analysis");

        doc.RootElement.GetProperty("condition").GetString().Should().Be("not_workable");
        doc.RootElement.GetProperty("requiresResponse").GetBoolean().Should().BeFalse();
        doc.RootElement.GetProperty("failed").GetBoolean().Should().BeTrue();
    }

    // ── yes / no branches ────────────────────────────────────────────────────

    [Test]
    public async Task Yes_WithTempFile_Returns200WithReply()
    {
        // Risk: "yes" must trigger StartInBackground — if the response is 200
        // but the pipeline was never kicked off, the user waits forever.
        WriteTempCsv(TestAuthHandler.CurrentUserId);

        var doc = await PostMessage(_client, "yes", pendingCondition: "not_clean");

        // Should return 200 with a reply message (not an error)
        doc.RootElement.GetProperty("failed").GetBoolean().Should().BeFalse();
        var reply = doc.RootElement.GetProperty("reply").GetString();
        reply.Should().NotBeNullOrEmpty();
    }

    [Test]
    public async Task No_WithTempFile_Returns200WithReply()
    {
        WriteTempCsv(TestAuthHandler.CurrentUserId);

        var doc = await PostMessage(_client, "no", pendingCondition: "not_clean");

        doc.RootElement.GetProperty("failed").GetBoolean().Should().BeFalse();
        var reply = doc.RootElement.GetProperty("reply").GetString();
        reply.Should().NotBeNullOrEmpty();
    }

    [Test]
    public async Task Yes_WithNoTempFile_ReturnsFailed()
    {
        // Risk: "yes" without a file could crash StartInBackground or silently
        // create a broken DB row.
        var doc = await PostMessage(_client, "yes", pendingCondition: "not_clean");
        doc.RootElement.GetProperty("failed").GetBoolean().Should().BeTrue();
    }

    // ── Unrecognized message ─────────────────────────────────────────────────

    [Test]
    public async Task UnrecognizedMessage_Returns200WithFallbackReply()
    {
        // Risk: the fallback branch must not throw. If it does, the user gets a
        // 500 from an innocuous message like "hello" and loses trust in the product.
        WriteTempCsv(TestAuthHandler.CurrentUserId);

        var doc = await PostMessage(_client, "something_random");

        // Should 200, not 500
        doc.RootElement.GetProperty("failed").GetBoolean().Should().BeFalse();
        var reply = doc.RootElement.GetProperty("reply").GetString();
        reply.Should().NotBeNullOrEmpty();
    }

    // ── Authentication ───────────────────────────────────────────────────────

    [Test]
    public async Task SendMessage_WithoutAuth_Returns401()
    {
        // Risk: unprotected chat endpoint means unauthenticated users can
        // trigger analysis pipeline runs (compute cost) or access other users' data.
        TestAuthHandler.IsAuthenticated = false;
        var response = await _client.PostAsJsonAsync("/api/chat/message",
            new { message = "start_analysis" });
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        TestAuthHandler.IsAuthenticated = true;
    }
}
