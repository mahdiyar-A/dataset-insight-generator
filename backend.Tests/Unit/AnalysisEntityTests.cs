using backend.Domain.Entities;
using FluentAssertions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// Tests for the Analysis domain entity.
///
/// Risk focus: the Analysis entity is the central state machine for the pipeline.
/// Bugs here mean the frontend shows wrong status, completed analyses don't
/// have timestamps, or storage paths aren't recorded — all of which are silent
/// failures that corrupt the user's history without throwing exceptions.
/// </summary>
[TestFixture]
public class AnalysisEntityTests
{
    // ── Constructor ──────────────────────────────────────────────────────────

    [Test]
    public void NewAnalysis_DefaultsToStatusPending()
    {
        // Risk: if default status isn't "pending", the frontend's polling loop
        // might never transition through the expected states.
        var a = new Analysis(Guid.NewGuid(), "sales.csv", 1024);
        a.Status.Should().Be("pending");
    }

    [Test]
    public void NewAnalysis_AssignsNewId_NotEmptyGuid()
    {
        // Risk: an empty GUID as a primary key would silently overwrite other
        // analyses in the DB — critical data loss bug.
        var a = new Analysis(Guid.NewGuid(), "data.csv", 512);
        a.Id.Should().NotBe(Guid.Empty);
    }

    [Test]
    public void NewAnalysis_TwoInstances_HaveDifferentIds()
    {
        // Risk: if Id generation is seeded or broken, two concurrent uploads
        // from the same user would collide and corrupt each other's history.
        var a1 = new Analysis(Guid.NewGuid(), "file1.csv", 100);
        var a2 = new Analysis(Guid.NewGuid(), "file2.csv", 200);
        a1.Id.Should().NotBe(a2.Id);
    }

    [Test]
    public void NewAnalysis_SetsFileMetadata()
    {
        var userId = Guid.NewGuid();
        var a = new Analysis(userId, "report.csv", 2048);
        a.UserId.Should().Be(userId);
        a.FileName.Should().Be("report.csv");
        a.FileSizeBytes.Should().Be(2048);
    }

    [Test]
    public void NewAnalysis_CompletedAt_IsNull_UntilTerminalStatus()
    {
        // Risk: if CompletedAt is set eagerly, duration calculations in the UI
        // will show negative or zero times for in-flight analyses.
        var a = new Analysis(Guid.NewGuid(), "data.csv", 100);
        a.CompletedAt.Should().BeNull();
    }

    // ── Status lifecycle ─────────────────────────────────────────────────────

    [Test]
    public void SetStatus_Processing_DoesNotSetCompletedAt()
    {
        // Risk: processing is a transient state, not a terminal one.
        // Setting CompletedAt here would corrupt duration metrics.
        var a = new Analysis(Guid.NewGuid(), "data.csv", 100);
        a.SetStatus("processing");
        a.CompletedAt.Should().BeNull();
    }

    [Test]
    public void SetStatus_Done_SetsCompletedAt()
    {
        // Risk: without CompletedAt, the history card can't show "took X seconds"
        // and download buttons won't know the pipeline is finished.
        var before = DateTime.UtcNow;
        var a = new Analysis(Guid.NewGuid(), "data.csv", 100);
        a.SetStatus("done");
        a.CompletedAt.Should().NotBeNull();
        a.CompletedAt!.Value.Should().BeOnOrAfter(before);
    }

    [Test]
    public void SetStatus_Failed_SetsCompletedAt()
    {
        // Risk: failed analyses without CompletedAt would appear stuck in
        // "processing" from the frontend's perspective.
        var a = new Analysis(Guid.NewGuid(), "data.csv", 100);
        a.SetStatus("failed");
        a.CompletedAt.Should().NotBeNull();
    }

    [Test]
    public void SetStatus_TransitionsThroughLifecycle()
    {
        // Risk: verifies valid state machine: pending → processing → done.
        // Any skip in this sequence means the polling UI never transitions.
        var a = new Analysis(Guid.NewGuid(), "data.csv", 100);
        a.SetStatus("processing");
        a.Status.Should().Be("processing");
        a.SetStatus("done");
        a.Status.Should().Be("done");
    }

    // ── Shape and customization ──────────────────────────────────────────────

    [Test]
    public void SetShape_StoresRowsAndColumns()
    {
        // Risk: if shape isn't stored, the history card shows 0×0 for all analyses.
        var a = new Analysis(Guid.NewGuid(), "data.csv", 100);
        a.SetShape(1000, 12);
        a.RowCount.Should().Be(1000);
        a.ColumnCount.Should().Be(12);
    }

    [Test]
    public void SetCustomization_StoresJsonBlob()
    {
        // Risk: if customization is dropped, a Pro user's chosen tone/audience
        // settings are silently ignored — the pipeline uses defaults instead.
        var a = new Analysis(Guid.NewGuid(), "data.csv", 100);
        const string json = """{"tone":"academic","audience":"technical"}""";
        a.SetCustomization(json);
        a.Customization.Should().Be(json);
    }

    // ── Storage paths ────────────────────────────────────────────────────────

    [Test]
    public void StoragePaths_StartNull_SetIndividually()
    {
        // Risk: path setters that are no-ops or set wrong fields mean the download
        // endpoint serves null and the user gets a 404 for their own report.
        var a = new Analysis(Guid.NewGuid(), "data.csv", 100);
        a.PdfReportPath.Should().BeNull();
        a.WordReportPath.Should().BeNull();
        a.PptxReportPath.Should().BeNull();

        a.SetPdfPath("users/x/report.pdf");
        a.SetWordPath("users/x/report.docx");
        a.SetPptxPath("users/x/report.pptx");

        a.PdfReportPath.Should().Be("users/x/report.pdf");
        a.WordReportPath.Should().Be("users/x/report.docx");
        a.PptxReportPath.Should().Be("users/x/report.pptx");
    }

    [Test]
    public void SetOriginalCsvPath_AndCleanedCsvPath_AreStoredSeparately()
    {
        // Risk: confusing original and cleaned paths would serve wrong file on download.
        var a = new Analysis(Guid.NewGuid(), "data.csv", 100);
        a.SetOriginalCsvPath("users/x/original.csv");
        a.SetCleanedCsvPath("users/x/cleaned.csv");

        a.OriginalCsvPath.Should().Be("users/x/original.csv");
        a.CleanedCsvPath.Should().Be("users/x/cleaned.csv");
        a.OriginalCsvPath.Should().NotBe(a.CleanedCsvPath);
    }

    // ── Computed property ────────────────────────────────────────────────────

    [Test]
    public void ReportFileName_ContainsDateAndExtension()
    {
        // Risk: if this property is wrong, the Content-Disposition header in
        // the download response shows a garbled or empty filename.
        var a = new Analysis(Guid.NewGuid(), "sales_data.csv", 100);
        var name = a.ReportFileName;
        name.Should().StartWith("analysis_report_");
        name.Should().EndWith(".pdf");
        name.Should().Contain(DateTime.UtcNow.Year.ToString());
    }

    // ── Restore factory ──────────────────────────────────────────────────────

    [Test]
    public void Restore_RehydratesAllCoreFields()
    {
        // Risk: if Restore() ignores parameters (e.g. takes defaults instead of
        // the passed values), loading history from DB shows wrong filenames,
        // statuses, or user associations.
        var id        = Guid.NewGuid();
        var userId    = Guid.NewGuid();
        var created   = new DateTime(2025, 3, 15, 10, 0, 0, DateTimeKind.Utc);
        var completed = new DateTime(2025, 3, 15, 10, 2, 0, DateTimeKind.Utc);

        var a = Analysis.Restore(
            id, userId, "historical.csv", 204800,
            "done", created,
            rowCount: 500, columnCount: 8,
            pdfPath: "users/x/report.pdf",
            wordPath: "users/x/report.docx",
            completedAt: completed,
            customization: """{"tone":"casual"}"""
        );

        a.Id.Should().Be(id);
        a.UserId.Should().Be(userId);
        a.FileName.Should().Be("historical.csv");
        a.FileSizeBytes.Should().Be(204800);
        a.Status.Should().Be("done");
        a.CreatedAt.Should().Be(created);
        a.CompletedAt.Should().Be(completed);
        a.RowCount.Should().Be(500);
        a.ColumnCount.Should().Be(8);
        a.PdfReportPath.Should().Be("users/x/report.pdf");
        a.WordReportPath.Should().Be("users/x/report.docx");
        a.Customization.Should().Be("""{"tone":"casual"}""");
    }

    [Test]
    public void Restore_WithNullOptionalPaths_LeavesThemNull()
    {
        // Risk: a "not yet generated" null path that becomes an empty string
        // would cause the download endpoint to call GetSignedUrlAsync("")
        // which returns an invalid URL.
        var a = Analysis.Restore(
            Guid.NewGuid(), Guid.NewGuid(), "file.csv", 100,
            "processing", DateTime.UtcNow
        );

        a.PdfReportPath.Should().BeNull();
        a.WordReportPath.Should().BeNull();
        a.PptxReportPath.Should().BeNull();
        a.CleanedCsvPath.Should().BeNull();
    }
}
