namespace backend.Application.Interfaces;

/// <summary>
/// File storage for user uploads and generated analysis outputs.
///
/// Path layout
/// -----------
///   users/{userId}/profile.{ext}                       — account-level, one per user
///   users/{userId}/analyses/{analysisId}/original.csv
///   users/{userId}/analyses/{analysisId}/cleaned.csv
///   users/{userId}/analyses/{analysisId}/report.pdf
///   users/{userId}/analyses/{analysisId}/report.docx
///   users/{userId}/analyses/{analysisId}/report.pptx
///   users/{userId}/analyses/{analysisId}/chart_{n}.png
///
/// Every analysis output is keyed by analysisId. It previously was not: the PDF,
/// both CSVs and the charts all wrote to users/{userId}/report.pdf and friends,
/// with upsert enabled. Each new analysis therefore overwrote the previous one's
/// files. History listed five entries with correct names and dates, but every
/// one of them resolved to the most recent analysis's output — and deleting any
/// single analysis deleted the shared files for all of them.
///
/// Callers must never construct these paths themselves. Read the path stored on
/// the analysis row, which is whatever the Save* method returned at the time,
/// so records written under the old flat layout keep resolving.
/// </summary>
public interface IStorageService
{
    Task<string> SaveProfilePictureAsync(Guid userId, IFormFile file);

    Task<string> SaveOriginalCsvAsync(Guid userId, Guid analysisId, IFormFile file);
    Task<string> SaveOriginalCsvAsync(Guid userId, Guid analysisId, byte[] csvBytes);
    Task<string> SaveCleanedCsvAsync(Guid userId, Guid analysisId, byte[] csvBytes);
    Task<string> SavePdfReportAsync(Guid userId, Guid analysisId, byte[] pdfBytes);
    Task<string> SaveWordReportAsync(Guid userId, Guid analysisId, byte[] docxBytes);
    Task<string> SavePptxReportAsync(Guid userId, Guid analysisId, byte[] pptxBytes);
    Task<string> SaveChartAsync(Guid userId, Guid analysisId, int index, byte[] pngBytes);

    /// <summary>
    /// Delete every file belonging to one analysis, leaving other analyses alone.
    /// </summary>
    Task DeleteAnalysisFilesAsync(Guid userId, Guid analysisId);

    /// <summary>Delete everything for a user. Used by the delete-account flow.</summary>
    Task DeleteUserFilesAsync(Guid userId);

    Task<string> GetSignedUrlAsync(string storagePath, int expiresInSeconds = 3600);

    /// <summary>
    /// Fetch the raw bytes of a stored object. Used when the server itself needs
    /// the file content rather than handing the user a signed URL — e.g. attaching
    /// a generated PDF report to an outgoing email.
    /// </summary>
    /// <returns>The file bytes, or null if the object does not exist.</returns>
    Task<byte[]?> DownloadAsync(string storagePath);
}
