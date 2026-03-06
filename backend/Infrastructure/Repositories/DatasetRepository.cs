using backend.Application.Interfaces;
using backend.Domain.Entities;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

[Table("datasets")]
public class DatasetRow : BaseModel
{
    [PrimaryKey("id", false)]       public string    Id              { get; set; } = "";
    [Column("user_id")]             public string    UserId          { get; set; } = "";
    [Column("file_name")]           public string?   FileName        { get; set; }
    [Column("file_size_bytes")]     public long      FileSizeBytes   { get; set; }
    [Column("row_count")]           public int?      RowCount        { get; set; }
    [Column("column_count")]        public int?      ColumnCount     { get; set; }
    [Column("original_csv_url")]    public string?   OriginalCsvUrl  { get; set; }
    [Column("cleaned_csv_url")]     public string?   CleanedCsvUrl   { get; set; }
    [Column("pdf_report_url")]      public string?   PdfReportUrl    { get; set; }
    [Column("status")]              public string    Status          { get; set; } = "pending";
    [Column("chart_urls")]          public string?   ChartUrls       { get; set; }
    [Column("uploaded_at")]         public DateTime  UploadedAt      { get; set; }
    [Column("completed_at")]        public DateTime? CompletedAt     { get; set; }
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
        await _db.From<DatasetRow>()
            .Filter("user_id", Operator.Equals, dataset.UserId.ToString())
            .Delete();
        await _db.From<DatasetRow>().Insert(ToRow(dataset));
    }

    public async Task UpdateStatusAsync(Guid userId, string status,
        string? cleanedCsvUrl = null, string? pdfReportUrl = null)
    {
        var update = _db.From<DatasetRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Set(r => r.Status, status);

        if (status is "done" or "failed")
            update = update.Set(r => r.CompletedAt!, DateTime.UtcNow);

        if (cleanedCsvUrl != null)
            update = update.Set(r => r.CleanedCsvUrl!, cleanedCsvUrl);

        if (pdfReportUrl != null)
            update = update.Set(r => r.PdfReportUrl!, pdfReportUrl);

        await update.Update();
    }

    public async Task UpdateChartUrlsAsync(Guid userId, string chartUrlsJson)
    {
        await _db.From<DatasetRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Set(r => r.ChartUrls!, chartUrlsJson)
            .Update();
    }

    public async Task UpdateOriginalCsvPathAsync(Guid userId, string originalCsvPath)
    {
        await _db.From<DatasetRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Set(r => r.OriginalCsvUrl!, originalCsvPath)
            .Update();
    }

    public async Task DeleteByUserIdAsync(Guid userId)
    {
        await _db.From<DatasetRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Delete();
    }

    private static Dataset ToDomain(DatasetRow r)
    {
        var d = new Dataset(
            Guid.Parse(r.UserId),
            r.FileName ?? "unknown.csv",
            r.FileSizeBytes,
            r.OriginalCsvUrl ?? ""
        );
        if (r.RowCount.HasValue && r.ColumnCount.HasValue)
            d.SetShape(r.RowCount.Value, r.ColumnCount.Value);
        if (r.CleanedCsvUrl != null) d.AttachCleanedCsv(r.CleanedCsvUrl);
        if (r.PdfReportUrl  != null) d.SetPdfReport(r.PdfReportUrl);
        if (r.ChartUrls     != null) d.SetChartUrls(r.ChartUrls);
        d.SetStatus(r.Status ?? "pending");
        return d;
    }

    private static DatasetRow ToRow(Dataset d) => new()
    {
        Id             = d.Id.ToString(),
        UserId         = d.UserId.ToString(),
        FileName       = d.FileName,
        FileSizeBytes  = d.FileSizeBytes,
        RowCount       = d.RowCount,
        ColumnCount    = d.ColumnCount,
        OriginalCsvUrl = d.OriginalCsvPath,
        CleanedCsvUrl  = d.CleanedCsvPath,
        PdfReportUrl   = d.PdfReportPath,
        ChartUrls      = d.ChartUrls,
        Status         = d.Status,
        UploadedAt     = d.UploadedAt,
    };
}