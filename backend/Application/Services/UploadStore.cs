using System.Text.Json;

namespace backend.Application.Services;

/// <summary>What the AI service read from an upload, kept beside it until the analysis runs.</summary>
public sealed record UploadMeta(
    string FileName,
    string? Format,
    string? FormatLabel,
    int Rows,
    int Columns,
    IReadOnlyList<string> Headers);

/// <summary>
/// The file a user uploaded, waiting on the server's disk until its analysis
/// runs. Nothing reaches Supabase until the analysis succeeds.
///
/// One file per owner, stored as {owner}{extension}. The extension used to be
/// fixed in each caller: uploads were written as {userId}.xlsx while the chat
/// and the pipeline looked only for {userId}.csv, so an Excel upload answered
/// "No dataset found". Every caller now goes through Find, which accepts any
/// supported extension, and Save, which removes the previous upload first so
/// an old .csv can never shadow a new .xlsx.
///
/// Owners are GUIDs (user ids, or guest session ids validated as GUIDs), which
/// is also what keeps a crafted name from escaping the directory.
/// </summary>
public sealed class UploadStore
{
    public static readonly UploadStore Users  = new(Path.Combine(Path.GetTempPath(), "dig_uploads"));
    public static readonly UploadStore Guests = new(Path.Combine(Path.GetTempPath(), "dig_guest"));

    public string Root { get; }

    // Sidecar files live in a subdirectory so they can never be mistaken for
    // an upload: ".json" is itself an accepted data format.
    private string MetaDir => Path.Combine(Root, "meta");

    public UploadStore(string root)
    {
        Root = root;
        Directory.CreateDirectory(Root);
    }

    /// <summary>The owner's waiting upload, or null if there is none.</summary>
    public string? Find(Guid owner) =>
        Matches(owner).OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault();

    /// <summary>Store an upload, replacing whatever this owner uploaded before.</summary>
    public async Task<string> SaveAsync(Guid owner, string fileName, Stream content, CancellationToken ct = default)
    {
        var ext = FileFormats.ExtensionOf(fileName)
                  ?? throw new ArgumentException("Unsupported file type.", nameof(fileName));
        Directory.CreateDirectory(Root);
        Delete(owner);

        var path = Path.Combine(Root, $"{owner}{ext}");
        await using (var file = File.Create(path))
            await content.CopyToAsync(file, ct);
        return path;
    }

    /// <summary>Remove the owner's upload and what was read from it. Never throws.</summary>
    public void Delete(Guid owner)
    {
        foreach (var path in Matches(owner).ToList()) TryDelete(path);
        TryDelete(MetaPath(owner));
    }

    public void SaveMeta(Guid owner, UploadMeta meta)
    {
        Directory.CreateDirectory(MetaDir);
        File.WriteAllText(MetaPath(owner), JsonSerializer.Serialize(meta));
    }

    /// <summary>What was read from the owner's upload, or null if nothing was recorded.</summary>
    public UploadMeta? ReadMeta(Guid owner)
    {
        try
        {
            var path = MetaPath(owner);
            return File.Exists(path) ? JsonSerializer.Deserialize<UploadMeta>(File.ReadAllText(path)) : null;
        }
        catch
        {
            return null;
        }
    }

    private string MetaPath(Guid owner) => Path.Combine(MetaDir, $"{owner}.json");

    private IEnumerable<string> Matches(Guid owner)
    {
        if (!Directory.Exists(Root)) return Enumerable.Empty<string>();
        var stem = owner.ToString();
        return Directory.EnumerateFiles(Root, $"{stem}.*")
            .Where(p => Path.GetFileNameWithoutExtension(p) == stem && FileFormats.IsAccepted(p));
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch { /* a leftover temp file is harmless; the next upload replaces it */ }
    }
}
