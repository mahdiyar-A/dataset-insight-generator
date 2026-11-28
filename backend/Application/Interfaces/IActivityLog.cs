namespace backend.Application.Interfaces;

/// <summary>One day's count of one kind of event (UsageKinds).</summary>
public record UsageCount(DateOnly Day, string Kind, int Count);

/// <summary>
/// For one kind of data and one kind of finding: how many insights reports
/// were written with, and how many people deleted or rewrote. Counts only.
/// </summary>
public record FindingFeedbackRow(string Domain, string Kind, int Shown, int Removed, int Rewritten);

/// <summary>One thing an admin did on the admin page. Emails are stored masked.</summary>
public record AdminActionRecord(DateTime At, Guid? AdminId, string AdminEmail, string Action,
                                Guid? TargetId, string TargetEmail, string Detail);

/// <summary>The events counted on the admin page, by the names stored in usage_daily.</summary>
public static class UsageKinds
{
    public const string Question          = "question";
    public const string QuestionRefused   = "question_refused";
    public const string ReportEdit        = "report_edit";
    public const string ReportRestore     = "report_restore";
    public const string SuggestionOffered = "suggestion_offered";
    public const string SuggestionApplied = "suggestion_applied";
    public const string RunRefused        = "run_refused";
    public const string UploadRefused     = "upload_refused";
    public const string FiguresUnmatched  = "figures_unmatched";
}

/// <summary>
/// Counts and records the admin page reads (supabase/migrations/007). Writing
/// never throws and never delays the person: a count that cannot be stored is
/// lost, the request goes on. Reading throws when the tables are missing, so
/// the admin page can say the migration has not been run.
/// </summary>
public interface IActivityLog
{
    /// <summary>Add <paramref name="by"/> to today's count of <paramref name="kind"/>.</summary>
    void Count(string kind, int by = 1);

    /// <summary>Add to the counts for one kind of finding in one kind of data.</summary>
    void CountFindings(string domain, string kind, int shown, int removed, int rewritten);

    /// <summary>Store one admin action. Awaited, so the action is on record before the answer goes back.</summary>
    Task RecordAdminActionAsync(AdminActionRecord action);

    Task<List<UsageCount>> GetUsageSinceAsync(DateOnly since);
    Task<List<FindingFeedbackRow>> GetFindingFeedbackAsync();
    Task<List<AdminActionRecord>> GetAdminActionsAsync(int limit);
}
