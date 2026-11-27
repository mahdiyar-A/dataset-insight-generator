using backend.Application.Interfaces;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

[Table("site_visits")]
public class VisitRow : BaseModel
{
    [PrimaryKey("day", false)] public DateTime Day      { get; set; }
    [Column("path")]           public string   Path     { get; set; } = "";
    [Column("source")]         public string   Source   { get; set; } = "";
    [Column("views")]          public int      Views    { get; set; }
    [Column("visitors")]       public int      Visitors { get; set; }
}

public class VisitRepository : IVisitRepository
{
    private readonly Supabase.Client _db;

    public VisitRepository(Supabase.Client db) => _db = db;

    public async Task RecordAsync(DateOnly day, string path, string source, bool newToPage, bool newToSite) =>
        await _db.Rpc("record_visit", new Dictionary<string, object>
        {
            ["p_day"]              = day.ToString("yyyy-MM-dd"),
            ["p_path"]             = path,
            ["p_source"]           = source,
            ["p_new_visitor"]      = newToPage,
            ["p_new_site_visitor"] = newToSite,
        });

    public async Task<List<VisitTotal>> GetSinceAsync(DateOnly since)
    {
        var rows = await _db.From<VisitRow>()
            .Filter("day", Operator.GreaterThanOrEqual, since.ToString("yyyy-MM-dd"))
            .Get();
        return rows.Models
            .Select(r => new VisitTotal(DateOnly.FromDateTime(r.Day), r.Path, r.Source, r.Views, r.Visitors))
            .ToList();
    }
}
