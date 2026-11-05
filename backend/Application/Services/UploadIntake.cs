using System.Text.Json;
using backend.Application.Interfaces;

namespace backend.Application.Services;

/// <summary>An accepted upload, as the upload endpoints report it to the browser.</summary>
public sealed record UploadSummary(
    string FileName,
    long FileSizeBytes,
    int Rows,
    int Columns,
    string? Format,
    string? FormatLabel,
    IReadOnlyList<string> Headers,
    // Pass-throughs from the AI service, shown as they are.
    JsonElement? Preview,
    JsonElement? ColumnKinds,
    JsonElement? Notes)
{
    /// <summary>The fields every upload endpoint returns. Callers add their own.</summary>
    public Dictionary<string, object?> ToResponse() => new()
    {
        ["fileName"]      = FileName,
        ["fileSizeBytes"] = FileSizeBytes,
        ["rowCount"]      = Rows,
        ["columnCount"]   = Columns,
        ["status"]        = "pending",
        ["isPending"]     = true,
        ["format"]        = Format,
        ["formatLabel"]   = FormatLabel,
        ["headers"]       = Headers,
        ["preview"]       = Preview,
        ["columnKinds"]   = ColumnKinds,
        ["notes"]         = Notes,
    };
}

/// <summary>Either the stored upload, or why it was refused (Code and a Message for the user).</summary>
public sealed record UploadOutcome(UploadSummary? Summary, string? Code, string? Message)
{
    public bool Accepted => Summary != null;
    public static UploadOutcome Refuse(string code, string message) => new(null, code, message);
}

/// <summary>
/// Takes an upload in: checks the type and size, stores it, and asks the AI
/// service how it reads the file, so the browser can show the shape and first
/// rows of formats it cannot open itself (Parquet, SPSS, a database).
///
/// The row and column counts used to be computed here by splitting lines on
/// commas — wrong for a semicolon CSV and meaningless for Excel. The AI
/// service's reader is the one the analysis will use, so its answer is the
/// one shown. A file it cannot read at all is refused now, with its reason,
/// rather than after the user has pressed Start.
///
/// If the AI service is down or slow, the upload is still accepted: the
/// analysis's own quality check will catch an unreadable file.
/// </summary>
public sealed class UploadIntake
{
    private readonly IPythonAiClient       _python;
    private readonly ILogger<UploadIntake> _logger;

    // Reading a 50 MB file costs the AI service real memory, and the server
    // has 2 GB shared with running analyses. Two reads at once at most; an
    // upload that cannot get a slot quickly skips the preview instead of waiting.
    private static readonly SemaphoreSlim InspectSlots = new(2, 2);
    private static readonly TimeSpan      SlotWait     = TimeSpan.FromSeconds(15);

    public UploadIntake(IPythonAiClient python, ILogger<UploadIntake> logger)
    {
        _python = python;
        _logger = logger;
    }

    public async Task<UploadOutcome> AcceptAsync(UploadStore store, Guid owner, IFormFile? file,
                                                 int? rows = null, int? columns = null)
    {
        if (file == null || file.Length == 0)
            return UploadOutcome.Refuse("NO_FILE", "No file provided.");
        if (!FileFormats.IsAccepted(file.FileName))
            return UploadOutcome.Refuse("INVALID_TYPE",
                $"That file type isn't supported. Upload {FileFormats.Described}.");
        if (file.Length > FileFormats.MaxUploadBytes)
            return UploadOutcome.Refuse("TOO_LARGE", "File exceeds the 50 MB limit.");

        byte[] bytes;
        using (var buffer = new MemoryStream((int)file.Length))
        {
            await file.CopyToAsync(buffer);
            bytes = buffer.ToArray();
        }
        using (var stream = new MemoryStream(bytes, writable: false))
            await store.SaveAsync(owner, file.FileName, stream);

        using var inspected = await InspectAsync(bytes, file.FileName);
        var root = inspected?.RootElement;

        if (root is { } refused && refused.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.False)
        {
            store.Delete(owner);
            var reason = refused.TryGetProperty("error", out var e) ? e.GetString() : null;
            return UploadOutcome.Refuse("UNREADABLE", string.IsNullOrWhiteSpace(reason) ? "The file could not be read." : reason);
        }

        UploadSummary summary;
        if (root is { } r && r.TryGetProperty("ok", out var good) && good.ValueKind == JsonValueKind.True)
        {
            summary = new UploadSummary(
                file.FileName, file.Length,
                Int(r, "rows"), Int(r, "columns"),
                Text(r, "format"), Text(r, "formatLabel"),
                r.TryGetProperty("headers", out var h) && h.ValueKind == JsonValueKind.Array
                    ? h.EnumerateArray().Select(x => x.ToString()).ToList()
                    : new List<string>(),
                Clone(r, "preview"), Clone(r, "columnKinds"), Clone(r, "notes"));
        }
        else
        {
            var (countedRows, countedColumns) = FileFormats.IsPlainText(file.FileName) && (rows == null || columns == null)
                ? CountText(bytes)
                : (0, 0);
            summary = new UploadSummary(file.FileName, file.Length,
                rows ?? countedRows, columns ?? countedColumns,
                null, null, new List<string>(), null, null, null);
        }

        try
        {
            store.SaveMeta(owner, new UploadMeta(summary.FileName, summary.Format, summary.FormatLabel,
                                                 summary.Rows, summary.Columns, summary.Headers));
        }
        catch (Exception ex)
        {
            // Only the chat brief reads it, for column names. Not worth failing an upload over.
            _logger.LogWarning(ex, "[Upload] Could not record what was read from the upload");
        }

        return new UploadOutcome(summary, null, null);
    }

    private async Task<JsonDocument?> InspectAsync(byte[] bytes, string fileName)
    {
        if (!await InspectSlots.WaitAsync(SlotWait))
        {
            _logger.LogInformation("[Upload] AI service busy reading other uploads — skipping the preview");
            return null;
        }
        try
        {
            return JsonDocument.Parse(await _python.InspectAsync(bytes, fileName));
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[Upload] Inspect failed ({Type}: {Message}) — accepting without a preview",
                ex.GetType().Name, ex.Message);
            return null;
        }
        finally
        {
            InspectSlots.Release();
        }
    }

    private static int Int(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.TryGetInt32(out var n) ? n : 0;

    private static string? Text(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static JsonElement? Clone(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v.Clone() : null;

    /// <summary>Rows and columns of comma-separated text, for when the AI service cannot be asked.</summary>
    private static (int Rows, int Columns) CountText(byte[] bytes)
    {
        using var reader = new StreamReader(new MemoryStream(bytes));
        string? header = null;
        var count = 0;
        while (reader.ReadLine() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            header ??= line;
            count++;
        }
        return (Math.Max(0, count - 1), header?.Split(',').Length ?? 0);
    }
}
