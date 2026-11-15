using System.Collections.Concurrent;
using System.Text.Json;
using backend.Application.DTOs.AI;
using backend.Application.Interfaces;
using backend.Domain.Entities;

namespace backend.Application.Services;

public enum ReportOutcome
{
    Ok,
    NotFound,      // no such analysis for this person, or no such version
    NotEditable,   // made before reports could be edited: there is no document
    Conflict,      // saved since this person opened it
    Rejected,      // the edit cannot become a report; Code says why
    Unavailable,   // the files could not be rebuilt just now
}

/// <summary>One entry in a report's version list: who, when, and what kind of save.</summary>
public sealed record ReportVersionSummary(int Version, string Kind, int? RestoredFrom, DateTime CreatedAt, bool ByDig);

public sealed record ReportResult(
    ReportOutcome Outcome,
    int Version = 0,
    JsonElement? Document = null,
    JsonElement? Warnings = null,
    IReadOnlyList<ReportVersionSummary>? Versions = null,
    string? Code = null);

/// <summary>
/// The report as a document a person edits, with every save kept as a version.
///
/// A save sends the edit to the AI service, which applies it to version 1 and
/// rebuilds the PDF (and Word and PowerPoint, when the analysis has them). The
/// version is stored only once the files are built, and stored under the next
/// number only if nobody took that number first: two saves from the same
/// starting point never silently overwrite each other.
///
/// Going back to an older version saves it again as the newest, so nothing is
/// ever lost and going back can itself be undone.
/// </summary>
public class ReportService
{
    /// <summary>Versions kept besides version 1, which is kept for as long as the analysis.</summary>
    public const int KeepVersions = 20;

    private readonly IAnalysisRepository      _analyses;
    private readonly IReportVersionRepository _versions;
    private readonly IStorageService          _storage;
    private readonly IPythonAiClient          _ai;
    private readonly ILogger<ReportService>   _logger;

    // One save per report at a time on this server. The version number already
    // refuses a second save from the same starting point; this keeps a save's
    // file uploads from interleaving with the next one's.
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> Locks = new();

    public ReportService(IAnalysisRepository analyses, IReportVersionRepository versions, IStorageService storage,
                         IPythonAiClient ai, ILogger<ReportService> logger)
    {
        _analyses = analyses;
        _versions = versions;
        _storage  = storage;
        _ai       = ai;
        _logger   = logger;
    }

    // ── Reading ──────────────────────────────────────────────────────────────

    public async Task<ReportResult> GetAsync(Guid userId, Guid analysisId)
    {
        var analysis = await _analyses.GetByIdAsync(analysisId, userId);
        if (analysis == null || analysis.Status != "done") return new(ReportOutcome.NotFound);

        var latest = await _versions.GetLatestAsync(analysisId);
        if (latest == null) return new(ReportOutcome.NotEditable);

        return new(ReportOutcome.Ok, latest.Version, Parse(latest.Document),
                   Versions: await SummariesAsync(analysisId));
    }

    private async Task<List<ReportVersionSummary>> SummariesAsync(Guid analysisId) =>
        (await _versions.ListAsync(analysisId))
            .Select(v => new ReportVersionSummary(v.Version, v.Kind, v.RestoredFrom, v.CreatedAt, v.EditedBy == null))
            .ToList();

    // ── Saving ───────────────────────────────────────────────────────────────

    /// <summary>Save an edit made to version <paramref name="baseVersion"/>.</summary>
    public Task<ReportResult> SaveAsync(Guid userId, Guid analysisId, int baseVersion, JsonElement edited) =>
        ApplyAsync(userId, analysisId, baseVersion, _ => Task.FromResult<string?>(edited.GetRawText()),
                   ReportVersion.Edited, restoredFrom: null, warn: true);

    /// <summary>Go back to version <paramref name="target"/>, saving it again as the newest.</summary>
    public Task<ReportResult> RestoreAsync(Guid userId, Guid analysisId, int baseVersion, int target) =>
        ApplyAsync(userId, analysisId, baseVersion,
                   async id => (await _versions.GetAsync(id, target))?.Document,
                   ReportVersion.Restored, restoredFrom: target, warn: false);

    private async Task<ReportResult> ApplyAsync(
        Guid userId, Guid analysisId, int baseVersion, Func<Guid, Task<string?>> editedFor,
        string kind, int? restoredFrom, bool warn)
    {
        var gate = Locks.GetOrAdd(analysisId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync();
        try
        {
            var analysis = await _analyses.GetByIdAsync(analysisId, userId);
            if (analysis == null || analysis.Status != "done") return new(ReportOutcome.NotFound);

            var latest = await _versions.GetLatestAsync(analysisId);
            if (latest == null) return new(ReportOutcome.NotEditable);
            if (latest.Version != baseVersion)
                return new(ReportOutcome.Conflict, latest.Version, Code: "CHANGED_SINCE_OPENED");

            var original = latest.Version == 1 ? latest : await _versions.GetAsync(analysisId, 1);
            if (original == null) return new(ReportOutcome.NotEditable);

            var edited = await editedFor(analysisId);
            if (edited == null) return new(ReportOutcome.NotFound, Code: "NO_SUCH_VERSION");

            var rebuilt = await RebuildAsync(analysis, original.Document, edited,
                                             warn ? latest.Document : null);
            if (rebuilt.Error != null) return new(ReportOutcome.Rejected, latest.Version, Code: rebuilt.Error);
            if (rebuilt.Document is not { ValueKind: JsonValueKind.Object } document
                || string.IsNullOrEmpty(rebuilt.PdfReportBase64))
                return new(ReportOutcome.Unavailable, latest.Version);

            var next = latest.Version + 1;
            var stored = await _versions.TryInsertAsync(new ReportVersion(
                analysisId, next, document.GetRawText(), userId, kind, restoredFrom));
            if (!stored)
                return new(ReportOutcome.Conflict, latest.Version, Code: "CHANGED_SINCE_OPENED");

            await StoreFilesAsync(analysis, next, rebuilt);
            await TrimAsync(analysisId, next);

            return new(ReportOutcome.Ok, next, document, rebuilt.Warnings,
                       Versions: await SummariesAsync(analysisId));
        }
        catch (Exception ex) when (ex is TimeoutException or HttpRequestException)
        {
            _logger.LogWarning(ex, "[Report] AI service unavailable while saving {Id}", analysisId);
            return new(ReportOutcome.Unavailable);
        }
        finally
        {
            gate.Release();
        }
    }

    // ── Keeping the files current ────────────────────────────────────────────

    /// <summary>
    /// Rebuild the files when the newest version's never were: a save whose
    /// upload failed. Called before a download or an email. Never throws: when
    /// it cannot rebuild, the files already stored are served.
    /// </summary>
    public async Task EnsureFilesCurrentAsync(Analysis analysis)
    {
        try
        {
            var latest = await _versions.GetLatestAsync(analysis.Id);
            if (latest == null || latest.FilesBuilt) return;

            var gate = Locks.GetOrAdd(analysis.Id, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync();
            try
            {
                latest = await _versions.GetLatestAsync(analysis.Id);
                if (latest == null || latest.FilesBuilt) return;
                var original = latest.Version == 1 ? latest : await _versions.GetAsync(analysis.Id, 1);
                if (original == null) return;

                var rebuilt = await RebuildAsync(analysis, original.Document, latest.Document, current: null);
                if (rebuilt.Error == null && !string.IsNullOrEmpty(rebuilt.PdfReportBase64))
                    await StoreFilesAsync(analysis, latest.Version, rebuilt);
            }
            finally
            {
                gate.Release();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Report] Could not bring the files of {Id} up to date — serving the stored ones",
                               analysis.Id);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<ReportRebuildResponseDto> RebuildAsync(Analysis analysis, string original, string edited,
                                                              string? current)
    {
        var charts = new Dictionary<int, byte[]>();
        foreach (var number in ChartFiles(original))
        {
            var png = await _storage.ReadChartAsync(analysis.UserId, analysis.Id, number);
            if (png != null) charts[number] = png;
        }
        var chatContext = await _storage.ReadChatContextAsync(analysis.UserId, analysis.Id);

        var json = await _ai.RebuildReportAsync(new ReportRebuildRequest(
            original, edited, current, chatContext,
            WantWord: analysis.WordReportPath != null,
            WantPptx: analysis.PptxReportPath != null,
            charts));
        return JsonSerializer.Deserialize<ReportRebuildResponseDto>(json) ?? new ReportRebuildResponseDto();
    }

    /// <summary>The chart pictures a document places, by file number.</summary>
    public static IEnumerable<int> ChartFiles(string document)
    {
        using var doc = JsonDocument.Parse(document);
        if (!doc.RootElement.TryGetProperty("charts", out var charts) || charts.ValueKind != JsonValueKind.Array)
            return Array.Empty<int>();
        return charts.EnumerateArray()
            .Where(c => c.ValueKind == JsonValueKind.Object && c.TryGetProperty("file", out var f)
                        && f.ValueKind == JsonValueKind.Number)
            .Select(c => c.GetProperty("file").GetInt32())
            .Where(n => n is >= 0 and < 5)
            .Distinct()
            .ToList();
    }

    /// <summary>
    /// Upload the rebuilt files and the chat's copy of the words, then mark
    /// the version built. A failure leaves it unbuilt for the next download
    /// to finish; the save itself has already happened.
    /// </summary>
    private async Task StoreFilesAsync(Analysis analysis, int version, ReportRebuildResponseDto rebuilt)
    {
        try
        {
            await _storage.SavePdfReportAsync(analysis.UserId, analysis.Id,
                                              Convert.FromBase64String(rebuilt.PdfReportBase64!));
            if (analysis.WordReportPath != null && !string.IsNullOrEmpty(rebuilt.WordReportBase64))
                await _storage.SaveWordReportAsync(analysis.UserId, analysis.Id,
                                                   Convert.FromBase64String(rebuilt.WordReportBase64));
            if (analysis.PptxReportPath != null && !string.IsNullOrEmpty(rebuilt.PptxReportBase64))
                await _storage.SavePptxReportAsync(analysis.UserId, analysis.Id,
                                                   Convert.FromBase64String(rebuilt.PptxReportBase64));
            if (rebuilt.ChatContext is { ValueKind: JsonValueKind.Object } chat)
                await _storage.SaveChatContextAsync(analysis.UserId, analysis.Id, chat.GetRawText());
            await _versions.MarkFilesBuiltAsync(analysis.Id, version);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Report] Saved version {Version} of {Id} but not its files — the next download rebuilds them",
                             version, analysis.Id);
        }
    }

    private async Task TrimAsync(Guid analysisId, int newest)
    {
        try { await _versions.TrimAsync(analysisId, newest, KeepVersions); }
        catch (Exception ex) { _logger.LogWarning(ex, "[Report] Could not trim old versions of {Id}", analysisId); }
    }

    private static JsonElement Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }
}
