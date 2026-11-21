using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
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
    ReadOnly,      // this person may read the report but not change it
    Rejected,      // the edit cannot become a report; Code says why
    Unavailable,   // the files could not be rebuilt just now
}

/// <summary>One entry in a report's version list: who, when, and what kind of save.</summary>
public sealed record ReportVersionSummary(int Version, string Kind, int? RestoredFrom, DateTime CreatedAt, bool ByDig,
                                          Guid? EditedBy = null, string? EditedByName = null);

public sealed record ReportResult(
    ReportOutcome Outcome,
    int Version = 0,
    JsonElement? Document = null,
    JsonElement? Warnings = null,
    IReadOnlyList<ReportVersionSummary>? Versions = null,
    string? Code = null,
    IReadOnlyDictionary<int, string>? Pictures = null,
    bool CanEdit = false,
    // The parts two saves both changed, when a save was refused for it.
    JsonElement? Parts = null,
    // The versions saved since this person opened the report: combined with
    // their save, or the reason it was refused.
    IReadOnlyList<ReportVersionSummary>? SavedSince = null);

/// <summary>
/// A suggestion as the page sees it: an id to apply it by, the version it was
/// made to, what each change does (with a drawn chart as a data URL) and any
/// figures worth a second look.
/// </summary>
public sealed record OfferedProposal(Guid Id, int BaseVersion, JsonElement Preview, JsonElement Warnings);

public sealed record DrawResult(ReportOutcome Outcome, OfferedProposal? Proposal = null, string? Message = null);

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
///
/// The owner and the people a team shares the analysis with edit it together
/// (ReportAccess says who). A save made to a version someone else has saved
/// over since is combined with theirs part by part; only when both changed the
/// same part is it refused, naming the parts. Every save is announced to the
/// pages that have the report open (IReportLive).
///
/// The chat may suggest changes to the report (see ReportProposals). Applying
/// one is a save like any other: a new version, rebuilt files, undone by going
/// back. A chart DIG drew for a suggestion is stored as one more chart picture
/// of the analysis, under the number the AI service gives it.
/// </summary>
public class ReportService
{
    /// <summary>Versions kept besides version 1, which is kept for as long as the analysis.</summary>
    public const int KeepVersions = 20;

    /// <summary>
    /// Chart pictures an analysis can hold: the run's own (at most 5) and those
    /// drawn later at the owner's request. MAX_CHART_FILES in report_document.py.
    /// </summary>
    public const int MaxChartFiles = 20;

    /// <summary>Charts are drawn from data files up to this size, as questions are.</summary>
    public const long MaxDataFileBytes = 20L * 1024 * 1024;

    /// <summary>A drawn chart larger than this is not kept: something is wrong with it.</summary>
    private const int MaxPictureBytes = 3 * 1024 * 1024;

    private readonly IAnalysisRepository      _analyses;
    private readonly IReportVersionRepository _versions;
    private readonly IStorageService          _storage;
    private readonly IPythonAiClient          _ai;
    private readonly ReportProposals          _proposals;
    private readonly ReportAccess             _access;
    private readonly IUserRepository          _users;
    private readonly IReportLive              _live;
    private readonly ILogger<ReportService>   _logger;

    // One save per report at a time on this server. The version number already
    // refuses a second save from the same starting point; this keeps a save's
    // file uploads from interleaving with the next one's.
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> Locks = new();

    public ReportService(IAnalysisRepository analyses, IReportVersionRepository versions, IStorageService storage,
                         IPythonAiClient ai, ReportProposals proposals, ReportAccess access, IUserRepository users,
                         IReportLive live, ILogger<ReportService> logger)
    {
        _analyses  = analyses;
        _versions  = versions;
        _storage   = storage;
        _ai        = ai;
        _proposals = proposals;
        _access    = access;
        _users     = users;
        _live      = live;
        _logger    = logger;
    }

    // ── Reading ──────────────────────────────────────────────────────────────

    public async Task<ReportResult> GetAsync(Guid userId, Guid analysisId)
    {
        var (analysis, role) = await _access.ForAsync(userId, analysisId);
        if (analysis == null || role == ReportRole.None || analysis.Status != "done") return new(ReportOutcome.NotFound);

        var latest = await _versions.GetLatestAsync(analysisId);
        if (latest == null) return new(ReportOutcome.NotEditable);

        return new(ReportOutcome.Ok, latest.Version, Parse(latest.Document),
                   Versions: await SummariesAsync(analysisId),
                   Pictures: await PicturesAsync(analysis, latest.Document),
                   CanEdit: role == ReportRole.Edit);
    }

    /// <summary>
    /// The newest version, for the chat to suggest changes to. Null when the
    /// report cannot be edited, or the versions cannot be read just now: the
    /// chat then answers questions as before.
    /// </summary>
    public async Task<ReportVersion?> EditableVersionAsync(Guid analysisId)
    {
        try { return await _versions.GetLatestAsync(analysisId); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Report] Could not read the versions of {Id} — the chat answers without them",
                               analysisId);
            return null;
        }
    }

    /// <summary>Links to the pictures of the charts a document places, by file number.</summary>
    private async Task<Dictionary<int, string>> PicturesAsync(Analysis analysis, string document)
    {
        var pictures = new Dictionary<int, string>();
        foreach (var number in ChartFiles(document))
        {
            var url = await _storage.GetChartUrlAsync(analysis.UserId, analysis.Id, number);
            if (url != null) pictures[number] = url;
        }
        return pictures;
    }

    private async Task<List<ReportVersionSummary>> SummariesAsync(Guid analysisId)
    {
        var versions = await _versions.ListAsync(analysisId);
        var names = new Dictionary<Guid, string?>();
        foreach (var id in versions.Select(v => v.EditedBy).OfType<Guid>().Distinct())
            names[id] = await NameOfAsync(id);
        return versions
            .Select(v => new ReportVersionSummary(v.Version, v.Kind, v.RestoredFrom, v.CreatedAt, v.EditedBy == null,
                                                  v.EditedBy, v.EditedBy is { } by ? names[by] : null))
            .ToList();
    }

    /// <summary>The name a teammate sees on a save: the person's user name, never their address.</summary>
    private async Task<string?> NameOfAsync(Guid userId)
    {
        try
        {
            var name = (await _users.GetByIdAsync(userId))?.UserName;
            return string.IsNullOrWhiteSpace(name) ? null : name.Trim();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Report] Could not read the name of {User}", userId);
            return null;
        }
    }

    // ── Saving ───────────────────────────────────────────────────────────────

    /// <summary>
    /// What a save asks the AI service to make: a whole document (an edit, or
    /// an older version), or changes from the chat with their drawn pictures.
    /// </summary>
    private sealed record Edit(string? Document, string? ChangesJson = null,
                               IReadOnlyDictionary<int, byte[]>? Pictures = null);

    /// <summary>
    /// Save an edit made to version <paramref name="baseVersion"/>. When someone
    /// saved since, the two are combined part by part.
    /// </summary>
    public Task<ReportResult> SaveAsync(Guid userId, Guid analysisId, int baseVersion, JsonElement edited) =>
        ApplyAsync(userId, analysisId, baseVersion, _ => Task.FromResult<Edit?>(new Edit(edited.GetRawText())),
                   ReportVersion.Edited, restoredFrom: null, warn: true, combine: true);

    /// <summary>Go back to version <paramref name="target"/>, saving it again as the newest.</summary>
    public Task<ReportResult> RestoreAsync(Guid userId, Guid analysisId, int baseVersion, int target) =>
        ApplyAsync(userId, analysisId, baseVersion,
                   async id => (await _versions.GetAsync(id, target)) is { } v ? new Edit(v.Document) : null,
                   ReportVersion.Restored, restoredFrom: target, warn: false);

    /// <summary>
    /// Apply a suggestion from the chat, as the owner's own edit. Its figures
    /// were warned about on the suggestion, so they are not again.
    /// </summary>
    public async Task<ReportResult> ApplyProposalAsync(Guid userId, Guid analysisId, Guid proposalId)
    {
        var proposal = _proposals.Find(proposalId, userId, analysisId);
        if (proposal == null) return new(ReportOutcome.NotFound, Code: "SUGGESTION_EXPIRED");

        var result = await ApplyAsync(userId, analysisId, proposal.BaseVersion,
            _ => Task.FromResult<Edit?>(new Edit(null, proposal.ChangesJson, proposal.Pictures)),
            ReportVersion.Edited, restoredFrom: null, warn: false);
        if (result.Outcome is ReportOutcome.Ok or ReportOutcome.Conflict) _proposals.Remove(proposalId);
        return result;
    }

    /// <param name="combine">
    /// When someone saved since <paramref name="baseVersion"/>, combine this
    /// edit with what they saved instead of refusing it. Only for an edit: going
    /// back to a version, or a suggestion from the chat, is made to the whole
    /// report as it was.
    /// </param>
    private async Task<ReportResult> ApplyAsync(
        Guid userId, Guid analysisId, int baseVersion, Func<Guid, Task<Edit?>> editFor,
        string kind, int? restoredFrom, bool warn, bool combine = false)
    {
        var gate = Locks.GetOrAdd(analysisId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync();
        try
        {
            var (analysis, role) = await _access.ForAsync(userId, analysisId);
            if (analysis == null || role == ReportRole.None || analysis.Status != "done")
                return new(ReportOutcome.NotFound);
            if (role != ReportRole.Edit) return new(ReportOutcome.ReadOnly);

            var latest = await _versions.GetLatestAsync(analysisId);
            if (latest == null) return new(ReportOutcome.NotEditable);

            // Saved by someone else since this person opened it: combined with
            // what they saved, when there is still a version to combine from.
            ReportVersion? opened = null;
            if (latest.Version != baseVersion)
            {
                if (combine && baseVersion >= 1 && baseVersion < latest.Version)
                    opened = await _versions.GetAsync(analysisId, baseVersion);
                if (opened == null)
                    return new(ReportOutcome.Conflict, latest.Version, Code: "CHANGED_SINCE_OPENED");
            }

            var original = latest.Version == 1 ? latest : await _versions.GetAsync(analysisId, 1);
            if (original == null) return new(ReportOutcome.NotEditable);

            var edit = await editFor(analysisId);
            if (edit == null) return new(ReportOutcome.NotFound, Code: "NO_SUCH_VERSION");

            var rebuilt = await RebuildAsync(analysis, original.Document, latest.Document, edit, warn, opened?.Document);
            if (rebuilt.Error == "same_part")
                return new(ReportOutcome.Conflict, latest.Version, Code: "SAME_PART_CHANGED",
                           Parts: rebuilt.Parts, SavedSince: await SavedSinceAsync(analysisId, baseVersion));
            if (rebuilt.Error != null) return new(ReportOutcome.Rejected, latest.Version, Code: rebuilt.Error);
            if (rebuilt.Document is not { ValueKind: JsonValueKind.Object } document
                || string.IsNullOrEmpty(rebuilt.PdfReportBase64))
                return new(ReportOutcome.Unavailable, latest.Version);

            // A new chart's picture is stored before the version that shows it,
            // under a number no kept version uses.
            if (!await StoreNewChartsAsync(analysis, edit, rebuilt))
                return new(ReportOutcome.Unavailable, latest.Version);

            var next = latest.Version + 1;
            var stored = await _versions.TryInsertAsync(new ReportVersion(
                analysisId, next, document.GetRawText(), userId, kind, restoredFrom));
            if (!stored)
                return new(ReportOutcome.Conflict, latest.Version, Code: "CHANGED_SINCE_OPENED");

            await StoreFilesAsync(analysis, next, rebuilt);
            await TrimAsync(analysisId, next);
            await AnnounceAsync(analysisId, next, userId);

            var versions = await SummariesAsync(analysisId);
            return new(ReportOutcome.Ok, next, document, rebuilt.Warnings,
                       Versions: versions,
                       Pictures: await PicturesAsync(analysis, document.GetRawText()),
                       CanEdit: true,
                       SavedSince: opened == null ? null
                           : versions.Where(v => v.Version > baseVersion && v.Version < next)
                                     .OrderBy(v => v.Version).ToList());
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

    /// <summary>The versions saved after <paramref name="baseVersion"/>, oldest first.</summary>
    private async Task<List<ReportVersionSummary>> SavedSinceAsync(Guid analysisId, int baseVersion) =>
        (await SummariesAsync(analysisId)).Where(v => v.Version > baseVersion).OrderBy(v => v.Version).ToList();

    /// <summary>
    /// Tell the pages that have the report open. The save has happened: a
    /// failure here only means they catch up on their next load.
    /// </summary>
    private async Task AnnounceAsync(Guid analysisId, int version, Guid userId)
    {
        try { await _live.SavedAsync(analysisId, version, userId, await NameOfAsync(userId)); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Report] Saved version {Version} of {Id} but could not announce it", version, analysisId);
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

                var rebuilt = await RebuildAsync(analysis, original.Document, latest.Document,
                                                 new Edit(latest.Document), warn: false);
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

    /// <summary>
    /// The files for an edit. <paramref name="latest"/> always goes along: what
    /// DIG added at the owner's request is carried forward from it, never taken
    /// from an edit. With <paramref name="warn"/> figures typed since it are
    /// warned about. With <paramref name="opened"/>, the version the edit was
    /// made to, the edit is combined with what was saved since.
    /// </summary>
    private async Task<ReportRebuildResponseDto> RebuildAsync(Analysis analysis, string original, string latest,
                                                              Edit edit, bool warn, string? opened = null)
    {
        // Only the pictures the result can place: those of the document being
        // saved, or for changes, of the version they are made to. A new chart's
        // picture travels with the changes.
        var placing = edit.Document ?? (edit.ChangesJson != null ? latest : original);
        var charts = new Dictionary<int, byte[]>();
        foreach (var number in ChartFiles(placing))
        {
            var png = await _storage.ReadChartAsync(analysis.UserId, analysis.Id, number);
            if (png != null) charts[number] = png;
        }
        var chatContext = await _storage.ReadChatContextAsync(analysis.UserId, analysis.Id);

        var json = await _ai.RebuildReportAsync(new ReportRebuildRequest(
            original, edit.Document, latest, chatContext,
            WantWord: analysis.WordReportPath != null,
            WantPptx: analysis.PptxReportPath != null,
            charts,
            Warn: warn,
            ChangesJson: edit.ChangesJson,
            NewCharts: edit.Pictures,
            BaseJson: opened));
        return JsonSerializer.Deserialize<ReportRebuildResponseDto>(json) ?? new ReportRebuildResponseDto();
    }

    /// <summary>The chart pictures a document places, by file number.</summary>
    public static IEnumerable<int> ChartFiles(string document)
    {
        using var doc = JsonDocument.Parse(document);
        if (doc.RootElement.ValueKind != JsonValueKind.Object
            || !doc.RootElement.TryGetProperty("charts", out var charts) || charts.ValueKind != JsonValueKind.Array)
            return Array.Empty<int>();
        return charts.EnumerateArray()
            .Where(c => c.ValueKind == JsonValueKind.Object && c.TryGetProperty("file", out var f)
                        && f.ValueKind == JsonValueKind.Number && f.TryGetInt32(out _))
            .Select(c => c.GetProperty("file").GetInt32())
            .Where(n => n is >= 0 and < MaxChartFiles)
            .Distinct()
            .ToList();
    }

    /// <summary>
    /// Store the pictures DIG drew for applied changes, under the numbers the
    /// AI service gave them. False when one could not be stored: nothing is
    /// saved then, so no version shows a chart without its picture.
    /// </summary>
    private async Task<bool> StoreNewChartsAsync(Analysis analysis, Edit edit, ReportRebuildResponseDto rebuilt)
    {
        if (edit.Pictures is not { Count: > 0 } pictures || rebuilt.NewChartFiles is not { Count: > 0 } files)
            return true;
        try
        {
            foreach (var (position, number) in files)
            {
                if (!int.TryParse(position, out var k) || !pictures.TryGetValue(k, out var png)) continue;
                if (number is < 0 or >= MaxChartFiles) return false;
                await _storage.SaveChartAsync(analysis.UserId, analysis.Id, number, png);
            }
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Report] Could not store a drawn chart of {Id} — nothing was saved", analysis.Id);
            return false;
        }
    }

    // ── Suggestions ──────────────────────────────────────────────────────────

    /// <summary>
    /// Keep a suggestion the AI service made and checked, and return what the
    /// page shows of it. The changes stay here; the page gets an id. Null when
    /// there is nothing to offer.
    /// </summary>
    public OfferedProposal? Offer(Guid userId, Guid analysisId, int baseVersion, JsonElement proposal)
    {
        if (proposal.ValueKind != JsonValueKind.Object
            || !proposal.TryGetProperty("changes", out var changesElement)
            || changesElement.ValueKind != JsonValueKind.Array || changesElement.GetArrayLength() == 0)
            return null;

        var changes = JsonNode.Parse(changesElement.GetRawText())!.AsArray();
        var preview = proposal.TryGetProperty("preview", out var p) && p.ValueKind == JsonValueKind.Array
            ? JsonNode.Parse(p.GetRawText())!.AsArray()
            : new JsonArray();
        var pictures = new Dictionary<int, byte[]>();

        for (var k = 0; k < changes.Count; k++)
        {
            if (changes[k] is not JsonObject change) return null;
            if (change["picture"] is not JsonValue value) continue;
            change.Remove("picture");
            if (!value.TryGetValue<string>(out var base64)) return null;
            byte[] png;
            try { png = Convert.FromBase64String(base64); }
            catch (FormatException) { return null; }
            if (png.Length == 0 || png.Length > MaxPictureBytes) return null;
            pictures[k] = png;
            if (k < preview.Count && preview[k] is JsonObject shown)
                shown["picture"] = "data:image/png;base64," + base64;
        }

        var warnings = proposal.TryGetProperty("warnings", out var w) && w.ValueKind == JsonValueKind.Array
            ? w.Clone()
            : Parse("[]");
        var id = _proposals.Add(userId, analysisId, baseVersion, changes.ToJsonString(), pictures);
        return new OfferedProposal(id, baseVersion, Parse(preview.ToJsonString()), warnings);
    }

    /// <summary>
    /// What the owner might do next with the report, chosen without a model.
    /// An empty list when there is nothing to offer or the AI service cannot
    /// be reached: the page then shows its own suggestions.
    /// </summary>
    public async Task<(ReportOutcome Outcome, JsonElement Steps)> NextStepsAsync(Guid userId, Guid analysisId)
    {
        var none = Parse("[]");
        var analysis = await _analyses.GetByIdAsync(analysisId, userId);
        if (analysis == null || analysis.Status != "done") return (ReportOutcome.NotFound, none);

        var latest = await EditableVersionAsync(analysisId);
        if (latest == null) return (ReportOutcome.Ok, none);
        try
        {
            var chat = await _storage.ReadChatContextAsync(analysis.UserId, analysis.Id);
            using var doc = JsonDocument.Parse(await _ai.ReportNextStepsAsync(latest.Document, chat));
            return doc.RootElement.TryGetProperty("steps", out var steps) && steps.ValueKind == JsonValueKind.Array
                ? (ReportOutcome.Ok, steps.Clone())
                : (ReportOutcome.Ok, none);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[Report] No next steps for {Id} ({Type}: {Msg})", analysisId, ex.GetType().Name, ex.Message);
            return (ReportOutcome.Ok, none);
        }
    }

    /// <summary>
    /// A chart DIG draws from named columns, offered like a suggestion from the
    /// chat. No model: it costs no question.
    /// </summary>
    public async Task<DrawResult> DrawAsync(Guid userId, Guid analysisId, JsonElement chart, string label)
    {
        var analysis = await _analyses.GetByIdAsync(analysisId, userId);
        if (analysis == null || analysis.Status != "done") return new(ReportOutcome.NotFound);

        var latest = await EditableVersionAsync(analysisId);
        if (latest == null) return new(ReportOutcome.NotEditable);

        // The data the report read, as for questions.
        var (path, fileName) = AnalysisFiles.Find(analysis, analysis.CleanedCsvPath != null ? "cleaned" : "original");
        var bytes = path != null && analysis.FileSizeBytes is > 0 and <= MaxDataFileBytes
            ? await _storage.DownloadAsync(path)
            : null;
        if (bytes is not { Length: > 0 } || bytes.Length > MaxDataFileBytes)
            return new(ReportOutcome.Rejected, Message: "DIG can't draw from this analysis's data file: it is too large or no longer stored.");

        try
        {
            using var doc = JsonDocument.Parse(
                await _ai.ReportDrawAsync(latest.Document, chart.GetRawText(), label, bytes, fileName));
            var root = doc.RootElement;
            if (root.TryGetProperty("error", out var error))
                return new(ReportOutcome.Rejected,
                           Message: error.ValueKind == JsonValueKind.String ? error.GetString() : "That chart can't be drawn.");
            var offered = root.TryGetProperty("proposal", out var proposal)
                ? Offer(userId, analysisId, latest.Version, proposal)
                : null;
            return offered == null ? new(ReportOutcome.Unavailable) : new(ReportOutcome.Ok, offered);
        }
        catch (Exception ex) when (ex is TimeoutException or HttpRequestException or JsonException)
        {
            _logger.LogWarning(ex, "[Report] Could not draw a chart for {Id}", analysisId);
            return new(ReportOutcome.Unavailable);
        }
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
