using Microsoft.AspNetCore.Http;

namespace backend.Application.Interfaces;

public interface IStorageService
{
    Task<string> SaveProfilePictureAsync(Guid userId, IFormFile file);
    Task<string> SaveOriginalCsvAsync(Guid userId, IFormFile file);
    Task<string> SaveCleanedCsvAsync(Guid userId, byte[] csvBytes);
    Task<string> SavePdfReportAsync(Guid userId, byte[] pdfBytes);
    Task DeleteUserFilesAsync(Guid userId);
    Task<string> GetSignedUrlAsync(string storagePath, int expiresInSeconds = 3600);
}