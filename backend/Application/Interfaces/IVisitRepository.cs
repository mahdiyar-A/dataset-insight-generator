namespace backend.Application.Interfaces;

/// <summary>One day's count for one page and one source. Path "*" is the whole site.</summary>
public record VisitTotal(DateOnly Day, string Path, string Source, int Views, int Visitors);

/// <summary>
/// Daily page-visit totals (supabase/migrations/006_site_visits.sql). Holds
/// counts only: who visited is never stored. See VisitCounter.
/// </summary>
public interface IVisitRepository
{
    Task RecordAsync(DateOnly day, string path, string source, bool newToPage, bool newToSite);
    Task<List<VisitTotal>> GetSinceAsync(DateOnly since);
}
