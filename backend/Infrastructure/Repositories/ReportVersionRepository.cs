using backend.Application.Interfaces;
using backend.Domain.Entities;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Supabase.Postgrest;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Exceptions;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

[Table("report_versions")]
public class ReportVersionRow : BaseModel
{
    // The id is the database's: a version is found by analysis and number.
    [PrimaryKey("id", false)]       public string?  Id           { get; set; }
    [Column("analysis_id")]         public string   AnalysisId   { get; set; } = "";
    [Column("version")]             public int      Version      { get; set; }
    [Column("document")]
    [JsonConverter(typeof(JsonbObjectConverter))]  public string?  Document     { get; set; }
    [Column("edited_by")]           public string?  EditedBy     { get; set; }
    [Column("kind")]                public string   Kind         { get; set; } = ReportVersion.Edited;
    [Column("restored_from")]       public int?     RestoredFrom { get; set; }
    [Column("files_built")]         public bool     FilesBuilt   { get; set; }
    [Column("created_at")]          public DateTime CreatedAt    { get; set; }
}

/// <summary>
/// Writes a JSON text into a jsonb column as the JSON it holds, not as a
/// string. JsonbTextConverter writes a string, which is how chart_urls is
/// stored; a report is an object, and kept as one it can be read in SQL.
/// Reading accepts both.
/// </summary>
public sealed class JsonbObjectConverter : JsonConverter<string?>
{
    private static readonly JsonbTextConverter Reader = new();

    public override string? ReadJson(JsonReader reader, Type objectType, string? existingValue,
                                     bool hasExistingValue, Newtonsoft.Json.JsonSerializer serializer) =>
        Reader.ReadJson(reader, objectType, existingValue, hasExistingValue, serializer);

    public override void WriteJson(JsonWriter writer, string? value, Newtonsoft.Json.JsonSerializer serializer)
    {
        if (value == null) { writer.WriteNull(); return; }
        // Parsed rather than written raw: text that is not JSON fails here, in
        // this process, not as a database error after half a save.
        JToken.Parse(value).WriteTo(writer);
    }
}

public class ReportVersionRepository : IReportVersionRepository
{
    private readonly Supabase.Client _db;
    public ReportVersionRepository(Supabase.Client db) => _db = db;

    // Everything but the document: a list of versions is a list of who and when.
    private const string Summary = "id,analysis_id,version,edited_by,kind,restored_from,files_built,created_at";

    public async Task<ReportVersion?> GetLatestAsync(Guid analysisId)
    {
        var result = await _db.From<ReportVersionRow>()
            .Filter("analysis_id", Operator.Equals, analysisId.ToString())
            .Order("version", Ordering.Descending)
            .Limit(1)
            .Get();
        var row = result.Models.FirstOrDefault();
        return row == null ? null : ToDomain(row);
    }

    public async Task<ReportVersion?> GetAsync(Guid analysisId, int version)
    {
        var result = await _db.From<ReportVersionRow>()
            .Filter("analysis_id", Operator.Equals, analysisId.ToString())
            .Filter("version",     Operator.Equals, version)
            .Limit(1)
            .Get();
        var row = result.Models.FirstOrDefault();
        return row == null ? null : ToDomain(row);
    }

    public async Task<List<ReportVersion>> ListAsync(Guid analysisId)
    {
        var result = await _db.From<ReportVersionRow>()
            .Select(Summary)
            .Filter("analysis_id", Operator.Equals, analysisId.ToString())
            .Order("version", Ordering.Descending)
            .Get();
        return result.Models.Select(ToDomain).ToList();
    }

    public async Task<bool> TryInsertAsync(ReportVersion version)
    {
        try
        {
            await _db.From<ReportVersionRow>().Insert(ToRow(version),
                new QueryOptions { Returning = QueryOptions.ReturnType.Minimal });
            return true;
        }
        catch (PostgrestException ex) when (ex.StatusCode == 409 || (ex.Content ?? "").Contains("23505"))
        {
            // UNIQUE (analysis_id, version): that number was saved first by
            // someone else who started from the same version.
            return false;
        }
    }

    public async Task MarkFilesBuiltAsync(Guid analysisId, int version) =>
        await _db.From<ReportVersionRow>()
            .Filter("analysis_id", Operator.Equals, analysisId.ToString())
            .Filter("version",     Operator.Equals, version)
            .Set(r => r.FilesBuilt, true)
            .Update(new QueryOptions { Returning = QueryOptions.ReturnType.Minimal });

    public async Task TrimAsync(Guid analysisId, int newest, int keep)
    {
        var oldestKept = newest - keep + 1;
        if (oldestKept <= 2) return;   // nothing between version 1 and the ones kept
        await _db.From<ReportVersionRow>()
            .Filter("analysis_id", Operator.Equals,      analysisId.ToString())
            .Filter("version",     Operator.GreaterThan, 1)
            .Filter("version",     Operator.LessThan,    oldestKept)
            .Delete();
    }

    private static ReportVersion ToDomain(ReportVersionRow r) => new(
        analysisId:   Guid.Parse(r.AnalysisId),
        version:      r.Version,
        document:     r.Document ?? "{}",
        editedBy:     r.EditedBy != null ? Guid.Parse(r.EditedBy) : null,
        kind:         r.Kind,
        restoredFrom: r.RestoredFrom,
        filesBuilt:   r.FilesBuilt,
        createdAt:    r.CreatedAt);

    private static ReportVersionRow ToRow(ReportVersion v) => new()
    {
        Id           = Guid.NewGuid().ToString(),
        AnalysisId   = v.AnalysisId.ToString(),
        Version      = v.Version,
        Document     = v.Document,
        EditedBy     = v.EditedBy?.ToString(),
        Kind         = v.Kind,
        RestoredFrom = v.RestoredFrom,
        FilesBuilt   = v.FilesBuilt,
        CreatedAt    = v.CreatedAt,
    };
}
