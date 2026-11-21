namespace backend.Application.Interfaces;

/// <summary>
/// Tells everyone who has a report open that it was saved, so their page
/// catches up without a reload. Carries no words: each page fetches the new
/// version itself, and that fetch checks who may read it.
/// </summary>
public interface IReportLive
{
    Task SavedAsync(Guid analysisId, int version, Guid savedBy, string? savedByName);
}
