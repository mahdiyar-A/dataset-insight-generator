using backend.Domain.Entities;

namespace backend.Application.Interfaces;

public interface IAnalysisRepository
{
    // Get the N most recent analyses for a user (ordered newest first)
    Task<List<Analysis>> GetHistoryAsync(Guid userId, int limit = 15);

    // Get a single analysis by ID (validates it belongs to the user)
    Task<Analysis?> GetByIdAsync(Guid analysisId, Guid userId);

    // Get the most recent in-progress analysis (pending/processing)
    Task<Analysis?> GetActiveAsync(Guid userId);

    // Create or replace a processing placeholder
    Task<Analysis> UpsertAsync(Analysis analysis);

    // Update status (and optional paths) after pipeline completes
    Task UpdateStatusAsync(Guid analysisId, string status,
        string? cleanedCsvPath  = null,
        string? pdfPath         = null,
        string? wordPath        = null,
        string? pptxPath        = null);

    Task UpdateChartUrlsAsync(Guid analysisId, string chartUrlsJson);
    Task UpdateOriginalCsvPathAsync(Guid analysisId, string path);

    // Delete a specific analysis by ID (user must own it)
    Task DeleteAsync(Guid analysisId, Guid userId);

    // Count how many completed analyses a user has
    Task<int> CountDoneAsync(Guid userId);

    /// <summary>
    /// Completed analyses beyond the user's plan limit, oldest first.
    ///
    /// The limit was previously applied only when reading history, so a free
    /// user saw five entries while every run they had ever made stayed in the
    /// database with its files in storage. Nothing ever removed them.
    /// </summary>
    Task<List<Analysis>> GetOverflowAsync(Guid userId, int keep);
}
