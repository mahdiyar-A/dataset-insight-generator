using backend.Application.Interfaces;

namespace backend.Infrastructure.Storage;

/// <summary>
/// Supabase Storage implementation of <see cref="IStorageService"/>.
/// See the interface for the path layout and why every analysis output is keyed
/// by analysisId.
/// </summary>
public class SupabaseStorageService : IStorageService
{
    private readonly Supabase.Client _client;
    private readonly string _bucket;

    public SupabaseStorageService(Supabase.Client client, IConfiguration config)
    {
        _client = client;
        _bucket = config["Supabase:BucketName"] ?? "dig-files";
    }

    // ── Path construction ────────────────────────────────────────────────────
    // Single source of truth. Nothing outside this class builds a storage path.

    private static string AnalysisDir(Guid userId, Guid analysisId) =>
        $"users/{userId}/analyses/{analysisId}";

    /// <summary>Chart slots we generate. Used to enumerate files for deletion.</summary>
    private const int MaxCharts = 5;

    // ── Account-level files ──────────────────────────────────────────────────

    public async Task<string> SaveProfilePictureAsync(Guid userId, IFormFile file)
    {
        ValidateImage(file);
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        return await UploadAsync(file, $"users/{userId}/profile{ext}");
    }

    // ── Analysis outputs ─────────────────────────────────────────────────────

    public async Task<string> SaveOriginalCsvAsync(Guid userId, Guid analysisId, IFormFile file)
    {
        ValidateCsv(file);
        return await UploadAsync(file, $"{AnalysisDir(userId, analysisId)}/original.csv");
    }

    public async Task<string> SaveOriginalCsvAsync(Guid userId, Guid analysisId, byte[] csvBytes)
        => await UploadBytesAsync(csvBytes,
            $"{AnalysisDir(userId, analysisId)}/original.csv", "text/csv");

    public async Task<string> SaveCleanedCsvAsync(Guid userId, Guid analysisId, byte[] csvBytes)
        => await UploadBytesAsync(csvBytes,
            $"{AnalysisDir(userId, analysisId)}/cleaned.csv", "text/csv");

    public async Task<string> SavePdfReportAsync(Guid userId, Guid analysisId, byte[] pdfBytes)
        // Supabase rejects application/pdf on upload — octet-stream is accepted
        // and the download still opens correctly because the file name carries
        // the extension.
        => await UploadBytesAsync(pdfBytes,
            $"{AnalysisDir(userId, analysisId)}/report.pdf", "application/octet-stream");

    public async Task<string> SaveWordReportAsync(Guid userId, Guid analysisId, byte[] docxBytes)
        => await UploadBytesAsync(docxBytes, $"{AnalysisDir(userId, analysisId)}/report.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    public async Task<string> SavePptxReportAsync(Guid userId, Guid analysisId, byte[] pptxBytes)
        => await UploadBytesAsync(pptxBytes, $"{AnalysisDir(userId, analysisId)}/report.pptx",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation");

    public async Task<string> SaveChartAsync(Guid userId, Guid analysisId, int index, byte[] pngBytes)
        => await UploadBytesAsync(pngBytes,
            $"{AnalysisDir(userId, analysisId)}/chart_{index}.png", "image/png");

    // ── Deletion ─────────────────────────────────────────────────────────────

    public async Task DeleteAnalysisFilesAsync(Guid userId, Guid analysisId)
    {
        // Scoped to this analysis's directory. The previous version listed
        // users/{userId}/report.pdf and friends, so deleting one analysis wiped
        // the PDF, CSVs and charts shared by every other analysis the user had.
        var dir = AnalysisDir(userId, analysisId);
        var paths = new List<string>
        {
            $"{dir}/original.csv",
            $"{dir}/cleaned.csv",
            $"{dir}/report.pdf",
            $"{dir}/report.docx",
            $"{dir}/report.pptx",
        };
        for (var i = 0; i < MaxCharts; i++) paths.Add($"{dir}/chart_{i}.png");

        try
        {
            await _client.Storage.From(_bucket).Remove(paths);
        }
        catch (Exception ex)
        {
            // Never throw: the database row must still be deleted even if
            // storage cleanup fails, otherwise the user sees a history entry
            // they cannot remove.
            Console.WriteLine($"[Storage] DeleteAnalysisFilesAsync warning: {ex.Message}");
        }
    }

    public async Task DeleteUserFilesAsync(Guid userId)
    {
        // Recursive: enumerate everything under the user's prefix rather than
        // guessing file names. Account deletion must not leave orphans behind,
        // and analyses live in per-id subdirectories now.
        try
        {
            var paths = await ListAllUnderAsync($"users/{userId}");
            if (paths.Count > 0)
                await _client.Storage.From(_bucket).Remove(paths);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Storage] DeleteUserFilesAsync warning: {ex.Message}");
        }
    }

    /// <summary>
    /// Every object path under a prefix, walking one level of subdirectories.
    /// Supabase's List is not recursive — an entry with no id is a folder.
    /// </summary>
    private async Task<List<string>> ListAllUnderAsync(string prefix)
    {
        var found = new List<string>();

        var entries = await _client.Storage.From(_bucket).List(prefix);
        foreach (var entry in entries ?? new())
        {
            if (string.IsNullOrEmpty(entry.Name)) continue;

            if (entry.Id == null)
            {
                // Folder — recurse one level. The layout is at most
                // users/{id}/analyses/{id}/file, so this terminates.
                found.AddRange(await ListAllUnderAsync($"{prefix}/{entry.Name}"));
            }
            else
            {
                found.Add($"{prefix}/{entry.Name}");
            }
        }

        return found;
    }

    // ── Reads ────────────────────────────────────────────────────────────────

    // Expects a relative storage path — the value returned by a Save* method and
    // stored on the analysis row. Passing a full URL will not resolve.
    public async Task<string> GetSignedUrlAsync(string storagePath, int expiresInSeconds = 3600)
        => await _client.Storage.From(_bucket).CreateSignedUrl(storagePath, expiresInSeconds);

    public async Task<byte[]?> DownloadAsync(string storagePath)
    {
        try
        {
            // Overload resolution: Download(path, EventHandler<float>?) returns byte[].
            // The cast is required — an untyped null is ambiguous against the
            // TransformOptions overload.
            return await _client.Storage.From(_bucket)
                .Download(storagePath, (EventHandler<float>?)null);
        }
        catch (Exception ex)
        {
            // A missing object is an expected outcome (report not generated yet),
            // not an error worth propagating. Callers treat null as "not available".
            Console.WriteLine($"[Storage] DownloadAsync failed for {storagePath}: {ex.Message}");
            return null;
        }
    }

    // ── Upload helpers ───────────────────────────────────────────────────────

    private async Task<string> UploadAsync(IFormFile file, string storagePath)
    {
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        return await UploadBytesAsync(ms.ToArray(), storagePath, file.ContentType);
    }

    private async Task<string> UploadBytesAsync(byte[] bytes, string storagePath, string contentType)
    {
        var options = new Supabase.Storage.FileOptions { ContentType = contentType, Upsert = true };
        await _client.Storage.From(_bucket).Upload(bytes, storagePath, options);
        // Return the relative storage path, never a public URL. The caller
        // persists this and later passes it back to GetSignedUrlAsync, which is
        // what keeps files written under the old flat layout resolvable.
        return storagePath;
    }

    // ── Validation ───────────────────────────────────────────────────────────

    private static void ValidateImage(IFormFile file)
    {
        var allowed = new[] { ".jpg", ".jpeg", ".png", ".webp" };
        if (!allowed.Contains(Path.GetExtension(file.FileName).ToLowerInvariant()))
            throw new InvalidOperationException("Invalid image type");
        if (file.Length > 2 * 1024 * 1024)
            throw new InvalidOperationException("Image too large (max 2MB)");
    }

    private static void ValidateCsv(IFormFile file)
    {
        var allowed = new[] { ".csv", ".xlsx", ".xls", ".txt" };
        if (!allowed.Contains(Path.GetExtension(file.FileName).ToLowerInvariant()))
            throw new InvalidOperationException("Invalid file type");
        if (file.Length > 50 * 1024 * 1024)
            throw new InvalidOperationException("File too large (max 50MB)");
    }
}
