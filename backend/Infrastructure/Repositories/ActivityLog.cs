using backend.Application.Interfaces;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

[Table("usage_daily")]
public class UsageRow : BaseModel
{
    [PrimaryKey("day", false)] public DateTime Day   { get; set; }
    [Column("kind")]           public string   Kind  { get; set; } = "";
    [Column("count")]          public int      Count { get; set; }
}

[Table("finding_feedback")]
public class FindingFeedbackDbRow : BaseModel
{
    [PrimaryKey("domain", false)] public string Domain    { get; set; } = "";
    [Column("kind")]              public string Kind      { get; set; } = "";
    [Column("shown")]             public int    Shown     { get; set; }
    [Column("removed")]           public int    Removed   { get; set; }
    [Column("rewritten")]         public int    Rewritten { get; set; }
}

[Table("admin_actions")]
public class AdminActionRow : BaseModel
{
    [PrimaryKey("id", false)]    public long     Id          { get; set; }
    [Column("at")]               public DateTime At          { get; set; }
    [Column("admin_id")]         public Guid?    AdminId     { get; set; }
    [Column("admin_email")]      public string   AdminEmail  { get; set; } = "";
    [Column("action")]           public string   Action      { get; set; } = "";
    [Column("target_id")]        public Guid?    TargetId    { get; set; }
    [Column("target_email")]     public string   TargetEmail { get; set; } = "";
    [Column("detail")]           public string   Detail      { get; set; } = "";
}

/// <summary>
/// Usage counts, finding feedback and the admin record in Supabase. Counts are
/// written in the background: the person's request never waits for them.
/// </summary>
public class ActivityLog : IActivityLog
{
    private readonly Supabase.Client       _db;
    private readonly ILogger<ActivityLog>  _logger;
    // One warning per process when the tables are missing, not one per click.
    private static int _warned;

    public ActivityLog(Supabase.Client db, ILogger<ActivityLog> logger)
    {
        _db     = db;
        _logger = logger;
    }

    private void InBackground(string what, Func<Task> write) =>
        _ = Task.Run(async () =>
        {
            try { await write(); }
            catch (Exception ex)
            {
                if (Interlocked.Exchange(ref _warned, 1) == 0)
                    _logger.LogWarning("[Activity] Could not store {What} ({Type}: {Msg}). Has migration 007 been run?",
                        what, ex.GetType().Name, ex.Message);
            }
        });

    public void Count(string kind, int by = 1)
    {
        if (string.IsNullOrWhiteSpace(kind) || by <= 0) return;
        InBackground("a usage count", () => _db.Rpc("bump_usage", new Dictionary<string, object>
        {
            ["p_day"]  = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            ["p_kind"] = kind,
            ["p_by"]   = by,
        }));
    }

    public void CountFindings(string domain, string kind, int shown, int removed, int rewritten)
    {
        if (string.IsNullOrWhiteSpace(kind) || shown + removed + rewritten <= 0) return;
        InBackground("finding feedback", () => _db.Rpc("bump_finding_feedback", new Dictionary<string, object>
        {
            ["p_domain"]    = string.IsNullOrWhiteSpace(domain) ? "general" : domain.Trim().ToLowerInvariant(),
            ["p_kind"]      = kind,
            ["p_shown"]     = shown,
            ["p_removed"]   = removed,
            ["p_rewritten"] = rewritten,
        }));
    }

    public async Task RecordAdminActionAsync(AdminActionRecord action)
    {
        try
        {
            await _db.From<AdminActionRow>().Insert(new AdminActionRow
            {
                At          = action.At,
                AdminId     = action.AdminId,
                AdminEmail  = action.AdminEmail,
                Action      = action.Action,
                TargetId    = action.TargetId,
                TargetEmail = action.TargetEmail,
                Detail      = action.Detail,
            });
        }
        catch (Exception ex)
        {
            // The action itself has happened; the server log still has it.
            _logger.LogWarning("[Activity] Admin action not recorded ({Type}: {Msg})", ex.GetType().Name, ex.Message);
        }
    }

    public async Task<List<UsageCount>> GetUsageSinceAsync(DateOnly since)
    {
        var rows = await _db.From<UsageRow>()
            .Filter("day", Operator.GreaterThanOrEqual, since.ToString("yyyy-MM-dd"))
            .Get();
        return rows.Models.Select(r => new UsageCount(DateOnly.FromDateTime(r.Day), r.Kind, r.Count)).ToList();
    }

    public async Task<List<FindingFeedbackRow>> GetFindingFeedbackAsync()
    {
        var rows = await _db.From<FindingFeedbackDbRow>().Get();
        return rows.Models.Select(r => new FindingFeedbackRow(r.Domain, r.Kind, r.Shown, r.Removed, r.Rewritten)).ToList();
    }

    /// <summary>How long the record of admin actions is kept, as the Privacy Policy says.</summary>
    public static readonly TimeSpan KeepAdminActions = TimeSpan.FromDays(730);

    public async Task<List<AdminActionRecord>> GetAdminActionsAsync(int limit)
    {
        // Older entries go when the record is read: it is read far more often
        // than once in two years, and no other job is needed for it.
        try
        {
            await _db.From<AdminActionRow>()
                .Filter("at", Operator.LessThan, (DateTime.UtcNow - KeepAdminActions).ToString("o"))
                .Delete();
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[Activity] Old admin actions not removed ({Type}: {Msg})", ex.GetType().Name, ex.Message);
        }

        var rows = await _db.From<AdminActionRow>()
            .Order("at", Ordering.Descending)
            .Limit(Math.Clamp(limit, 1, 500))
            .Get();
        return rows.Models.Select(r => new AdminActionRecord(
            r.At, r.AdminId, r.AdminEmail, r.Action, r.TargetId, r.TargetEmail, r.Detail)).ToList();
    }
}
