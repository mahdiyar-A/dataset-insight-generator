namespace backend.Application.Interfaces;

public interface IStorageService
{
    Task<string> SaveProfilePictureAsync(Guid userId, IFormFile file);
    Task<string> SaveOriginalCsvAsync(Guid userId, IFormFile file);
    Task<string> SaveCleanedCsvAsync(Guid userId, byte[] csvBytes, string fileName = "cleaned.csv");
    Task<string> SavePdfReportAsync(Guid userId, byte[] pdfBytes);
    Task<string> SaveWordReportAsync(Guid userId, Guid analysisId, byte[] docxBytes);
    Task<string> SavePptxReportAsync(Guid userId, Guid analysisId, byte[] pptxBytes);
    Task<string> SaveChartAsync(Guid userId, int index, byte[] pngBytes);

    // Delete all files for a specific analysis (keyed by analysisId sub-folder)
    Task DeleteAnalysisFilesAsync(Guid userId, Guid analysisId);

    // Legacy: delete all files for a user (used by old delete-account flow)
    Task DeleteUserFilesAsync(Guid userId);

    Task<string> GetSignedUrlAsync(string storagePath, int expiresInSeconds = 3600);
}
