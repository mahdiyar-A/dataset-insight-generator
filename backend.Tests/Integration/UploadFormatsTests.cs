using backend.Application.Services;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace backend.Tests.Integration;

/// <summary>
/// Uploads in any supported format, from the form through to stored files.
///
/// Risk focus: the file used to be assumed to be a CSV at every step. Excel
/// was accepted, then lost ("No dataset found"); rows were counted by splitting
/// lines on commas; and the original was stored as original.csv whatever it was.
/// </summary>
[TestFixture]
public class UploadFormatsTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;
    private Guid _userId;

    [SetUp]
    public void SetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();
        _userId  = Guid.NewGuid();
        TestAuthHandler.CurrentUserId   = _userId;
        TestAuthHandler.IsAuthenticated = true;
    }

    [TearDown]
    public void TearDown()
    {
        UploadStore.Users.Delete(_userId);
        _client.Dispose();
        _factory.Dispose();
    }

    private static MultipartFormDataContent Form(string name, string content = "a,b\n1,2\n3,4\n")
    {
        var part = new ByteArrayContent(Encoding.UTF8.GetBytes(content));
        part.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        return new MultipartFormDataContent { { part, "file", name } };
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<HttpResponseMessage> Upload(string name, string content = "a,b\n1,2\n3,4\n") =>
        await _client.PostAsync("/api/analyses/upload", Form(name, content));

    // ── What the browser is told ─────────────────────────────────────────────

    [Test]
    public async Task Parquet_IsAccepted_WithWhatTheAiServiceRead()
    {
        var response = await Upload("sales.parquet");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await Json(response);
        body.GetProperty("fileName").GetString().Should().Be("sales.parquet");
        body.GetProperty("rowCount").GetInt32().Should().Be(1200);
        body.GetProperty("columnCount").GetInt32().Should().Be(3);
        body.GetProperty("formatLabel").GetString().Should().Be("Parquet");
        body.GetProperty("headers").EnumerateArray().Select(h => h.GetString())
            .Should().Equal("date", "region", "revenue");
        body.GetProperty("preview")[0][1].GetString().Should().Be("North");
        body.GetProperty("columnKinds")[2].GetProperty("kind").GetString().Should().Be("number");
        body.GetProperty("isPending").GetBoolean().Should().BeTrue();

        UploadStore.Users.Find(_userId).Should().EndWith(".parquet");
        UploadStore.Users.ReadMeta(_userId)!.Headers.Should().Contain("region");
    }

    [Test]
    public async Task UnsupportedType_IsRefused_SayingWhatIsAccepted()
    {
        var response = await Upload("report.pdf");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await Json(response);
        body.GetProperty("error").GetString().Should().Be("INVALID_TYPE");
        body.GetProperty("message").GetString().Should().Contain("Parquet");
        _factory.PythonAi.InspectedFileNames.Should().BeEmpty("nothing to read in a refused file");
        UploadStore.Users.Find(_userId).Should().BeNull();
    }

    [Test]
    public async Task UnreadableFile_IsRefusedNow_WithTheReason_AndNotKept()
    {
        // Risk: without this the user only learns the file is bad after pressing
        // Start, and the broken file sits waiting for the next analysis.
        _factory.PythonAi.InspectJson = """{"ok": false, "error": "This zip is password-protected."}""";

        var response = await Upload("locked.zip");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await Json(response);
        body.GetProperty("error").GetString().Should().Be("UNREADABLE");
        body.GetProperty("message").GetString().Should().Be("This zip is password-protected.");
        UploadStore.Users.Find(_userId).Should().BeNull();
    }

    [Test]
    public async Task AiServiceDown_StillAcceptsACsv_AndCountsIt()
    {
        // Risk: an upload should not depend on a preview. The analysis's own
        // quality check will still catch a bad file.
        _factory.PythonAi.SimulateDown = true;

        var response = await Upload("data.csv", "a,b,c\n1,2,3\n4,5,6\n\n7,8,9\n");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await Json(response);
        body.GetProperty("rowCount").GetInt32().Should().Be(3);
        body.GetProperty("columnCount").GetInt32().Should().Be(3);
        UploadStore.Users.Find(_userId).Should().NotBeNull();
    }

    [Test]
    public async Task AiServiceDown_DoesNotGuessAtBinaryFormats()
    {
        // Risk: counting "lines" in a Parquet file reports nonsense as fact.
        _factory.PythonAi.SimulateDown = true;

        var body = await Json(await Upload("sales.parquet", "PAR1\n\n\n\n\nbinary,bytes\n"));

        body.GetProperty("rowCount").GetInt32().Should().Be(0);
        body.GetProperty("columnCount").GetInt32().Should().Be(0);
    }

    [Test]
    public async Task GuestUpload_TakesTheSameFormats()
    {
        var session = Guid.NewGuid();
        var form    = Form("survey.sav");
        form.Add(new StringContent(session.ToString()), "sessionId");

        var response = await _client.PostAsync("/api/guest/upload", form);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await Json(response);
        body.GetProperty("sessionId").GetString().Should().Be(session.ToString());
        body.GetProperty("rowCount").GetInt32().Should().Be(1200);
        UploadStore.Guests.Find(session).Should().EndWith(".sav");
        UploadStore.Guests.Delete(session);
    }

    [Test]
    public async Task GuestUpload_WithACraftedSessionId_IsRefused()
    {
        var form = Form("data.csv");
        form.Add(new StringContent("../../etc/passwd"), "sessionId");

        var response = await _client.PostAsync("/api/guest/upload", form);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── The regression: Excel was accepted, then lost ────────────────────────

    [Test]
    public async Task ExcelUpload_CanStartAnAnalysis()
    {
        await Upload("sales.xlsx");

        var response = await _client.PostAsJsonAsync("/api/chat/message", new
        {
            message = "start_analysis", fileName = "sales.xlsx", fileSizeBytes = 2048,
        });

        var body = await Json(response);
        body.GetProperty("failed").GetBoolean().Should().BeFalse();
        body.GetProperty("reply").GetString().Should().NotContain("No dataset found");
        _factory.PythonAi.CheckedFileNames.Should().Equal("sales.xlsx");
    }

    [Test]
    public async Task NotWorkable_ShowsWhatTheAiServiceSaidIsWrong()
    {
        await Upload("thin.csv");
        _factory.PythonAi.CheckCondition = "not_workable";
        _factory.PythonAi.CheckError     = "Only 2 rows: at least 10 are needed.";

        var body = await Json(await _client.PostAsJsonAsync("/api/chat/message", new
        {
            message = "start_analysis", fileName = "thin.csv",
        }));

        body.GetProperty("reply").GetString().Should().Contain("Only 2 rows");
        body.GetProperty("failed").GetBoolean().Should().BeTrue();
    }

    [Test]
    public async Task Analysis_KeepsTheOriginalInItsOwnFormat_AndSavesTheChatContext()
    {
        // Driven directly: TryStartAsync is fire-and-forget, so over HTTP this
        // would race the background task.
        var storage = _factory.StorageSvc;
        var repo    = _factory.AnalysisRepo;
        var python  = _factory.PythonAi;
        python.ChatContextJson = """{"version": 1, "report": {"title": "Sales"}}""";

        await using (var bytes = new MemoryStream(Encoding.UTF8.GetBytes("PK-excel-bytes")))
            await UploadStore.Users.SaveAsync(_userId, "sales.xlsx", bytes);
        UploadStore.Users.SaveMeta(_userId, new UploadMeta("sales.xlsx", "xlsx", "Excel", 40, 6, new[] { "region" }));

        var service = new AnalysisService(repo, storage, python, _factory.UserRepo,
            new AnalysisGate(new AnalysisLimits()), NullLogger<AnalysisService>.Instance);

        // Row and column counts of 0: the browser cannot count an Excel file.
        await service.RunAsync(_userId, "data.csv", 2048, 0, 0);

        var analysis = repo.Store.Single();
        analysis.Status.Should().Be("done");
        analysis.RowCount.Should().Be(40);
        analysis.ColumnCount.Should().Be(6);
        analysis.OriginalCsvPath.Should().EndWith("/original.xlsx");
        storage.Files[analysis.OriginalCsvPath!].Should().Equal(Encoding.UTF8.GetBytes("PK-excel-bytes"));
        python.LastRequest!.CsvFileName.Should().Be("sales.xlsx", "the upload's own name is the reader's hint");

        var context = await storage.ReadChatContextAsync(_userId, analysis.Id);
        JsonDocument.Parse(context!).RootElement.GetProperty("report").GetProperty("title").GetString()
            .Should().Be("Sales");

        UploadStore.Users.Find(_userId).Should().BeNull("the temp file goes once everything is stored");
        UploadStore.Users.ReadMeta(_userId).Should().BeNull();
    }

    [Test]
    public async Task OlderAiServiceWithoutChatContext_StillCompletes()
    {
        var storage = _factory.StorageSvc;
        await using (var bytes = new MemoryStream(Encoding.UTF8.GetBytes("a,b\n1,2\n")))
            await UploadStore.Users.SaveAsync(_userId, "data.csv", bytes);

        var service = new AnalysisService(_factory.AnalysisRepo, storage, _factory.PythonAi, _factory.UserRepo,
            new AnalysisGate(new AnalysisLimits()), NullLogger<AnalysisService>.Instance);
        await service.RunAsync(_userId, "data.csv", 8, 1, 2);

        var analysis = _factory.AnalysisRepo.Store.Single();
        analysis.Status.Should().Be("done");
        (await storage.ReadChatContextAsync(_userId, analysis.Id)).Should().BeNull();
    }

    // ── History and downloads ────────────────────────────────────────────────

    [Test]
    public async Task DeletingAHistoryEntry_KeepsTheWaitingUpload()
    {
        // Risk: removing an old report used to delete the file the user had
        // just uploaded for their next analysis.
        var old = new Analysis(_userId, "old.csv", 100);
        old.SetStatus("done");
        _factory.AnalysisRepo.Store.Add(old);
        await Upload("next.csv");

        var response = await _client.DeleteAsync($"/api/analyses/{old.Id}");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        UploadStore.Users.Find(_userId).Should().NotBeNull();
    }

    [Test]
    public async Task CleanedDownload_IsNamedCsv_WhateverTheUploadWas()
    {
        var a = new Analysis(_userId, "sales.xlsx", 100);
        a.SetStatus("done");
        a.SetCleanedCsvPath($"users/{_userId}/analyses/{a.Id}/cleaned.csv");
        _factory.AnalysisRepo.Store.Add(a);

        var body = await Json(await _client.GetAsync($"/api/analyses/{a.Id}/download/cleaned"));

        body.GetProperty("fileName").GetString().Should().Be("cleaned_sales.csv");
    }
}
