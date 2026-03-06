using backend.Application.Interfaces;

namespace backend.Infrastructure.Storage;

public class SupabaseStorageService : IStorageService
{
    private readonly Supabase.Client _client;
    private readonly string _bucket;

    public SupabaseStorageService(Supabase.Client client, IConfiguration config)
    {
        _client = client;
        _bucket = config["Supabase:BucketName"] ?? "dig-files";
    }

    public async Task<string> SaveProfilePictureAsync(Guid userId, IFormFile file)
    {
        ValidateImage(file);
        var ext  = Path.GetExtension(file.FileName).ToLowerInvariant();
        var path = $"users/{userId}/profile{ext}";
        return await UploadAsync(file, path);
    }

    public async Task<string> SaveOriginalCsvAsync(Guid userId, IFormFile file)
    {
        ValidateCsv(file);
        return await UploadAsync(file, $"users/{userId}/original.csv");
    }

    // Used by AnalysisService — saves bytes directly (original or cleaned)
    public async Task<string> SaveCleanedCsvAsync(Guid userId, byte[] csvBytes, string fileName = "cleaned.csv")
        => await UploadBytesAsync(csvBytes, $"users/{userId}/{fileName}", "text/csv");

    public async Task<string> SavePdfReportAsync(Guid userId, byte[] pdfBytes)
        => await UploadBytesAsync(pdfBytes, $"users/{userId}/report.pdf", "application/pdf");

    public async Task<string> SaveChartAsync(Guid userId, int index, byte[] pngBytes)
        => await UploadBytesAsync(pngBytes, $"users/{userId}/chart_{index}.png", "image/png");

    public async Task DeleteUserFilesAsync(Guid userId)
    {
        try
        {
            var paths = new List<string>
            {
                $"users/{userId}/original.csv",
                $"users/{userId}/cleaned.csv",
                $"users/{userId}/report.pdf",
                $"users/{userId}/chart_0.png",
                $"users/{userId}/chart_1.png",
                $"users/{userId}/chart_2.png",
                $"users/{userId}/chart_3.png",
                $"users/{userId}/chart_4.png",
            };
            await _client.Storage.From(_bucket).Remove(paths);
        }
        catch { /* ignore — files may not exist */ }
    }

    public async Task<string> GetSignedUrlAsync(string storagePath, int expiresInSeconds = 3600)
        => await _client.Storage.From(_bucket).CreateSignedUrl(storagePath, expiresInSeconds);

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
        return storagePath;
    }

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