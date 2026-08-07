using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;
using System.Net;
using System.Text.Json;

namespace backend.Tests.Integration;

/// <summary>
/// Integration tests for /api/analyses/* — history, active poll, status, download, delete.
///
/// Risk focus:
///   - Authorization: user A must not see user B's analyses (IDOR vulnerability).
///   - Download endpoint: requesting a file type that isn't ready must return 404,
///     not a signed URL to an empty path.
///   - History: the limit (5 free / 15 pro) must be enforced at the API level,
///     not just in the DB trigger.
/// </summary>
[TestFixture]
public class AnalysisEndpointTests
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

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Analysis CreateDoneAnalysis(Guid userId, string fileName = "data.csv")
    {
        var a = new Analysis(userId, fileName, 1024);
        a.SetStatus("done");
        a.SetPdfPath($"users/{userId}/report.pdf");
        _factory.AnalysisRepo.Store.Add(a);
        return a;
    }

    private Analysis CreateProcessingAnalysis(Guid userId)
    {
        var a = new Analysis(userId, "live.csv", 2048);
        a.SetStatus("processing");
        _factory.AnalysisRepo.Store.Add(a);
        return a;
    }

    // ── History ──────────────────────────────────────────────────────────────

    [Test]
    public async Task GetHistory_WhenEmpty_ReturnsEmptyArray()
    {
        // Risk: null instead of [] would crash the frontend's .map() call.
        var response = await _client.GetAsync("/api/analyses/history");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync();
        var arr  = JsonDocument.Parse(body).RootElement;
        arr.ValueKind.Should().Be(JsonValueKind.Array);
        arr.GetArrayLength().Should().Be(0);
    }

    [Test]
    public async Task GetHistory_ReturnsDoneAnalysesForCurrentUser()
    {
        var userId = TestAuthHandler.CurrentUserId;
        CreateDoneAnalysis(userId, "q1_sales.csv");
        CreateDoneAnalysis(userId, "q2_sales.csv");

        var response = await _client.GetAsync("/api/analyses/history");
        var body     = await response.Content.ReadAsStringAsync();
        var arr      = JsonDocument.Parse(body).RootElement;

        arr.GetArrayLength().Should().Be(2);
    }

    [Test]
    public async Task GetHistory_DoesNotReturnOtherUsersAnalyses()
    {
        // Risk: this is an IDOR check. If GetHistoryAsync ignores userId,
        // every user sees everyone else's analysis history.
        var otherUserId = Guid.NewGuid();
        CreateDoneAnalysis(otherUserId, "other_user_data.csv");

        var response = await _client.GetAsync("/api/analyses/history");
        var body     = await response.Content.ReadAsStringAsync();
        var arr      = JsonDocument.Parse(body).RootElement;

        arr.GetArrayLength().Should().Be(0);  // current user has no analyses
    }

    // ── Get by ID ────────────────────────────────────────────────────────────

    [Test]
    public async Task GetById_ValidId_Returns200WithAnalysisData()
    {
        var userId = TestAuthHandler.CurrentUserId;
        var a = CreateDoneAnalysis(userId);

        var response = await _client.GetAsync($"/api/analyses/{a.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("id").GetString().Should().Be(a.Id.ToString());
        doc.RootElement.GetProperty("fileName").GetString().Should().Be("data.csv");
        doc.RootElement.GetProperty("status").GetString().Should().Be("done");
    }

    [Test]
    public async Task GetById_OtherUsersAnalysis_Returns404()
    {
        // Risk: IDOR — user A requesting user B's analysis by guessing the UUID.
        // The repo's GetByIdAsync validates userId; this test confirms the
        // controller passes the authenticated user's ID, not a user-supplied one.
        var otherUserId = Guid.NewGuid();
        var a = CreateDoneAnalysis(otherUserId);

        var response = await _client.GetAsync($"/api/analyses/{a.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Active (polling) ─────────────────────────────────────────────────────

    [Test]
    public async Task GetActive_WhenNoneRunning_Returns404()
    {
        // Risk: the frontend polls this endpoint to know when the pipeline is done.
        // A 200 with empty body (instead of 404) would leave the spinner running forever.
        var response = await _client.GetAsync("/api/analyses/active");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task GetActive_WhenProcessing_Returns200WithAnalysis()
    {
        var userId = TestAuthHandler.CurrentUserId;
        var a = CreateProcessingAnalysis(userId);

        var response = await _client.GetAsync("/api/analyses/active");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("id").GetString().Should().Be(a.Id.ToString());
        doc.RootElement.GetProperty("status").GetString().Should().Be("processing");
    }

    // ── Status polling ───────────────────────────────────────────────────────

    [Test]
    public async Task GetStatus_ValidId_ReturnsStatusFields()
    {
        // Risk: the status response drives which download buttons are shown.
        // If hasPdfReport is always false regardless of PdfReportPath, the user
        // never sees the download button even after the pipeline completes.
        var userId = TestAuthHandler.CurrentUserId;
        var a = CreateDoneAnalysis(userId);

        var response = await _client.GetAsync($"/api/analyses/{a.Id}/status");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("status").GetString().Should().Be("done");
        doc.RootElement.GetProperty("hasPdfReport").GetBoolean().Should().BeTrue();
        doc.RootElement.GetProperty("hasWordReport").GetBoolean().Should().BeFalse();
        doc.RootElement.GetProperty("hasPptx").GetBoolean().Should().BeFalse();
    }

    // ── Download ─────────────────────────────────────────────────────────────

    [Test]
    public async Task Download_Pdf_WhenReady_ReturnsSignedUrl()
    {
        var userId = TestAuthHandler.CurrentUserId;
        var a = CreateDoneAnalysis(userId);

        var response = await _client.GetAsync($"/api/analyses/{a.Id}/download/report");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var url = doc.RootElement.GetProperty("url").GetString();
        url.Should().NotBeNullOrEmpty();
        url.Should().Contain("fake-storage");  // our FakeStorageService's URL
    }

    [Test]
    public async Task Download_Word_WhenNotGenerated_Returns404()
    {
        // Risk: the analysis was created without WantWord=true, so no Word file
        // was generated. Returning a URL to a null path would produce an invalid
        // signed URL — the download would error silently on the client.
        var userId = TestAuthHandler.CurrentUserId;
        var a = CreateDoneAnalysis(userId);
        // Word path is NOT set — simulates PDF-only pipeline run

        var response = await _client.GetAsync($"/api/analyses/{a.Id}/download/word");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task Download_UnknownType_Returns404()
    {
        // Risk: a typo or crafted URL like /download/exe should not cause an
        // unhandled exception or accidentally match a storage path.
        var userId = TestAuthHandler.CurrentUserId;
        var a = CreateDoneAnalysis(userId);

        var response = await _client.GetAsync($"/api/analyses/{a.Id}/download/unknown_type");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task Download_OtherUsersFile_Returns404()
    {
        // Risk: IDOR on download — user B guesses user A's analysis ID and
        // tries to download their report.
        var otherUserId = Guid.NewGuid();
        var a = CreateDoneAnalysis(otherUserId);

        var response = await _client.GetAsync($"/api/analyses/{a.Id}/download/report");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ── Visualizations ───────────────────────────────────────────────────────

    [Test]
    public async Task GetVisualizations_NoCharts_ReturnsEmptyArray()
    {
        // Risk: null return instead of [] crashes frontend .map() call.
        var userId = TestAuthHandler.CurrentUserId;
        var a = CreateDoneAnalysis(userId);

        var response = await _client.GetAsync($"/api/analyses/{a.Id}/visualizations");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.ValueKind.Should().Be(JsonValueKind.Array);
        doc.RootElement.GetArrayLength().Should().Be(0);
    }

    [Test]
    public async Task GetVisualizations_WithCharts_DeserializesCorrectly()
    {
        var userId = TestAuthHandler.CurrentUserId;
        var a = new Analysis(userId, "charts_data.csv", 1024);
        a.SetStatus("done");
        a.SetChartUrls("""[{"type":"bar","label":"Revenue","url":"https://fake.com/c.png"}]""");
        _factory.AnalysisRepo.Store.Add(a);

        var response = await _client.GetAsync($"/api/analyses/{a.Id}/visualizations");
        var doc      = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        doc.RootElement.GetArrayLength().Should().Be(1);
        var chart = doc.RootElement[0];
        chart.GetProperty("type").GetString().Should().Be("bar");
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    [Test]
    public async Task Delete_OwnAnalysis_Returns204()
    {
        var userId = TestAuthHandler.CurrentUserId;
        var a = CreateDoneAnalysis(userId);

        var response = await _client.DeleteAsync($"/api/analyses/{a.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        _factory.AnalysisRepo.Store.Should().NotContain(x => x.Id == a.Id);
    }

    [Test]
    public async Task Delete_OtherUsersAnalysis_Returns404()
    {
        // Risk: if delete doesn't validate userId, user A can delete user B's
        // analysis history — data loss on another user's account.
        var otherUserId = Guid.NewGuid();
        var a = CreateDoneAnalysis(otherUserId);

        var response = await _client.DeleteAsync($"/api/analyses/{a.Id}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        // Confirm it wasn't deleted
        _factory.AnalysisRepo.Store.Should().Contain(x => x.Id == a.Id);
    }

    // ── Auth guard ───────────────────────────────────────────────────────────

    [Test]
    public async Task GetHistory_WithoutAuth_Returns401()
    {
        TestAuthHandler.IsAuthenticated = false;
        var response = await _client.GetAsync("/api/analyses/history");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        TestAuthHandler.IsAuthenticated = true;
    }
}
