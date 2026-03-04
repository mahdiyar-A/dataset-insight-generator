using backend.Application.Interfaces;
using backend.Domain.Entities;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

[Table("datasets")]
public class DatasetRow : BaseModel
{
    [PrimaryKey("id", false)]       public string   Id             { get; set; } = "";
    [Column("user_id")]             public string   UserId         { get; set; } = "";
    [Column("original_csv_url")]    public string?  OriginalCsvUrl { get; set; }
    [Column("cleaned_csv_url")]     public string?  CleanedCsvUrl  { get; set; }
    [Column("pdf_report_url")]      public string?  PdfReportUrl   { get; set; }
    [Column("status")]              public string   Status         { get; set; } = "pending";
    [Column("uploaded_at")]         public DateTime  UploadedAt    { get; set; }
    [Column("completed_at")]        public DateTime? CompletedAt   { get; set; }
}

public class DatasetRepository : IDatasetRepository
{
    private readonly Supabase.Client _db;
    public DatasetRepository(Supabase.Client db) => _db = db;

    public async Task<Dataset?> GetByUserIdAsync(Guid userId)
    {
        var result = await _db.From<DatasetRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Single();
        return result == null ? null : ToDomain(result);
    }

    public async Task UpsertAsync(Dataset dataset)
    {
        await _db.From<DatasetRow>().Upsert(ToRow(dataset));
    }

    public async Task UpdateStatusAsync(Guid userId, string status,
        string? cleanedCsvUrl = null, string? pdfReportUrl = null)
    {
        var existing = await _db.From<DatasetRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Single();

        if (existing == null) return;

        existing.Status      = status;
        existing.CompletedAt = status is "done" or "failed" ? DateTime.UtcNow : null;
        if (cleanedCsvUrl != null) existing.CleanedCsvUrl = cleanedCsvUrl;
        if (pdfReportUrl  != null) existing.PdfReportUrl  = pdfReportUrl;

        await _db.From<DatasetRow>().Upsert(existing);
    }

    public async Task DeleteByUserIdAsync(Guid userId)
    {
        await _db.From<DatasetRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Delete();
    }

    private static Dataset ToDomain(DatasetRow r)
    {
        var d = new Dataset(Guid.Parse(r.UserId), r.OriginalCsvUrl ?? "", 0, r.OriginalCsvUrl ?? "");
        if (r.CleanedCsvUrl != null) d.AttachCleanedCsv(r.CleanedCsvUrl);
        return d;
    }

    private static DatasetRow ToRow(Dataset d) => new()
    {
        Id             = d.Id.ToString(),
        UserId         = d.UserId.ToString(),
        OriginalCsvUrl = d.OriginalCsvPath,
        CleanedCsvUrl  = d.CleanedCsvPath,
        Status         = "pending",
        UploadedAt     = d.UploadedAt
    };
}