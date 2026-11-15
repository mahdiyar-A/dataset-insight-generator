using backend.Domain.Entities;

namespace backend.Application.Interfaces;

/// <summary>
/// The saved versions of each analysis's report. See migration 005.
/// </summary>
public interface IReportVersionRepository
{
    /// <summary>The newest version, with its document; null when the report was never saved as one.</summary>
    Task<ReportVersion?> GetLatestAsync(Guid analysisId);

    /// <summary>One version with its document, or null.</summary>
    Task<ReportVersion?> GetAsync(Guid analysisId, int version);

    /// <summary>Every version kept, newest first, without the documents.</summary>
    Task<List<ReportVersion>> ListAsync(Guid analysisId);

    /// <summary>
    /// Saves a new version. False when that number is already taken: someone
    /// saved first, from the same starting point.
    /// </summary>
    Task<bool> TryInsertAsync(ReportVersion version);

    /// <summary>Marks the stored files as built from this version.</summary>
    Task MarkFilesBuiltAsync(Guid analysisId, int version);

    /// <summary>
    /// Deletes versions older than the newest `keep`, never version 1: the
    /// report as DIG wrote it stays for as long as the analysis does.
    /// </summary>
    Task TrimAsync(Guid analysisId, int newest, int keep);
}
