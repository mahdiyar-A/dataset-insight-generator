using backend.Application.Interfaces;
using backend.Domain.Entities;
using backend.Tests.Helpers;
using FluentAssertions;
using NUnit.Framework;
using System.Net;
using System.Net.Http.Json;

namespace backend.Tests.Integration;

/// <summary>
/// Integration tests for POST /api/datasets/email-report.
///
/// This endpoint used to be a stub: it validated the request, then returned
/// "Report queued for delivery." without sending anything. The UI reported
/// success and no email ever arrived — a silent failure with no server-side
/// trace, which is the worst kind because nobody knows to look for it.
///
/// Risk focus now that it actually sends:
///   - Storage can disagree with the database. If the DB records a PDF path but
///     the object is gone, we must not send an empty attachment.
///   - SMTP failures must produce an error status, never a success message, and
///     must never leak ex.Message (SMTP errors expose host and credential hints).
///   - Users without an email on file must be rejected before any I/O.
/// </summary>
[TestFixture]
public class EmailReportTests
{
    private TestWebApplicationFactory _factory = null!;
    private HttpClient _client = null!;
    private Guid _userId;

    [SetUp]
    public void SetUp()
    {
        _factory = new TestWebApplicationFactory();
        _client  = _factory.CreateClient();

        _userId = Guid.NewGuid();
        TestAuthHandler.CurrentUserId   = _userId;
        TestAuthHandler.IsAuthenticated = true;
    }

    [TearDown]
    public void TearDown()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void SeedUser(string email = "user@example.com")
    {
        _factory.UserRepo.DefaultUser = User.Restore(
            _userId, "Test User", email, "supabase-auth",
            null, null, true, true,
            DateTime.UtcNow.AddDays(-1), null,
            plan: "pro", reportsUsed: 0,
            reportsResetAt: DateTime.UtcNow.AddDays(-1));
    }

    private Dataset SeedDatasetWithReport(string pdfPath)
    {
        var ds = new Dataset(_userId, "data.csv", 2048, $"users/{_userId}/original.csv");
        ds.SetPdfReport(pdfPath);
        _factory.DatasetRepo.Store.Add(ds);
        return ds;
    }

    private Task<HttpResponseMessage> Post() =>
        _client.PostAsJsonAsync("/api/datasets/email-report",
            new { subject = "My report", includeAttachment = true });

    // ── Guards ───────────────────────────────────────────────────────────────

    [Test]
    public async Task NoDataset_Returns404()
    {
        // Risk: attempting to email a report for a user with no analysis at all
        // must fail cleanly rather than throwing a null reference.
        var response = await Post();

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task Unauthenticated_Returns401()
    {
        // Risk: an unauthenticated caller must never trigger an email send —
        // that would be an open relay for spamming arbitrary inboxes.
        TestAuthHandler.IsAuthenticated = false;

        var response = await Post();

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Storage / database disagreement ──────────────────────────────────────

    [Test]
    public async Task ReportPathRecordedButFileMissing_Returns404NotSuccess()
    {
        // Risk: this is the case the old stub could never surface. The DB says a
        // report exists; storage returns nothing. Sending anyway would deliver an
        // email with a zero-byte attachment and still report success to the user.
        SeedUser();
        SeedDatasetWithReport($"users/{_userId}/report.pdf");
        _factory.StorageSvc.SimulateMissingFiles = true;

        var response = await Post();

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("REPORT_MISSING");
    }

    // ── Error handling ───────────────────────────────────────────────────────

    [Test]
    public async Task WhenSmtpThrows_Returns502AndDoesNotLeakExceptionDetail()
    {
        // Risk: SMTP exception messages routinely contain the mail host, port, and
        // sometimes the authenticating account. Returning ex.Message to the client
        // hands an attacker the mail infrastructure for free.
        SeedUser();
        var path = $"users/{_userId}/report.pdf";
        SeedDatasetWithReport(path);
        _factory.StorageSvc.Files[path] = "%PDF-1.4 fake"u8.ToArray();
        _factory.EmailSvc.ThrowOnSend = true;

        var response = await Post();

        ((int)response.StatusCode).Should().Be(502);

        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("SEND_FAILED");
        body.Should().NotContain("smtp", "the SMTP host must never reach the client");
        body.Should().NotContain("Exception");
        body.Should().NotContain("at backend.", "no stack frames in the response");
    }

    // ── Happy path ───────────────────────────────────────────────────────────

    [Test]
    public async Task ValidRequest_SendsEmailWithTheActualPdfBytes()
    {
        // Risk: the whole point of the fix. Assert the email service received real
        // report bytes, not an empty array — a send that "succeeds" with no
        // attachment is indistinguishable from success at the HTTP layer.
        SeedUser("recipient@example.com");
        var path = $"users/{_userId}/report.pdf";
        SeedDatasetWithReport(path);

        var pdfBytes = "%PDF-1.4 real report content"u8.ToArray();
        _factory.StorageSvc.Files[path] = pdfBytes;

        var response = await Post();

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        _factory.EmailSvc.SentReports.Should().HaveCount(1);
        var sent = _factory.EmailSvc.SentReports[0];
        sent.ToEmail.Should().Be("recipient@example.com");
        sent.PdfBytes.Should().BeEquivalentTo(pdfBytes,
            "the email must carry the report that was actually stored");
        sent.PdfBytes.Length.Should().BeGreaterThan(0);
    }

    [Test]
    public async Task ValidRequest_ResponseConfirmsTheDestinationAddress()
    {
        // Risk: a generic "queued for delivery" message gives the user no way to
        // notice the report went to a stale address on their account.
        SeedUser("recipient@example.com");
        var path = $"users/{_userId}/report.pdf";
        SeedDatasetWithReport(path);
        _factory.StorageSvc.Files[path] = "%PDF"u8.ToArray();

        var response = await Post();
        var body = await response.Content.ReadAsStringAsync();

        body.Should().Contain("recipient@example.com");
    }

    [Test]
    public async Task EmailIsNotSentWhenReportIsMissing()
    {
        // Risk: partial failure — returning 404 but having already dispatched.
        SeedUser();
        SeedDatasetWithReport($"users/{_userId}/report.pdf");
        _factory.StorageSvc.SimulateMissingFiles = true;

        await Post();

        _factory.EmailSvc.SentReports.Should().BeEmpty();
    }
}
