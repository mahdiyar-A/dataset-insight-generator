namespace backend.Application.Interfaces;

public interface IStorageService
{
    Task<string> SaveProfilePictureAsync(Guid userId, IFormFile file);
    Task<string> SaveOriginalCsvAsync(Guid userId, IFormFile file);
    Task<string> SaveCleanedCsvAsync(Guid userId, byte[] csvBytes, string fileName = "cleaned.csv");
    Task<string> SavePdfReportAsync(Guid userId, byte[] pdfBytes);
    Task<string> SaveChartAsync(Guid userId, int index, byte[] pngBytes);
    Task DeleteUserFilesAsync(Guid userId);
    Task<string> GetSignedUrlAsync(string storagePath, int expiresInSeconds = 3600);
}