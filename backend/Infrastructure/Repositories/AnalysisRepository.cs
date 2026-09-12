using backend.Application.Interfaces;
using backend.Domain.Entities;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using static Supabase.Postgrest.Constants;

namespace backend.Infrastructure.Repositories;

[Table("analyses")]
public class AnalysisRow : BaseModel
{
    [PrimaryKey("id", false)]       public string    Id              { get; set; } = "";
    [Column("user_id")]             public string    UserId          { get; set; } = "";
    [Column("file_name")]           public string    FileName        { get; set; } = "";
    [Column("file_size_bytes")]     public long      FileSizeBytes   { get; set; }
    [Column("row_count")]           public int?      RowCount        { get; set; }
    [Column("column_count")]        public int?      ColumnCount     { get; set; }
    [Column("original_csv_path")]   public string?   OriginalCsvPath { get; set; }
    [Column("cleaned_csv_path")]    public string?   CleanedCsvPath  { get; set; }
    [Column("pdf_report_path")]     public string?   PdfReportPath   { get; set; }
    [Column("word_report_path")]    public string?   WordReportPath  { get; set; }
    [Column("pptx_report_path")]    public string?   PptxReportPath  { get; set; }
    [Column("chart_urls")]          public string?   ChartUrls       { get; set; }
    [Column("status")]              public string    Status          { get; set; } = "pending";
    [Column("customization")]       public string?   Customization   { get; set; }
    [Column("created_at")]          public DateTime  CreatedAt       { get; set; }
    [Column("completed_at")]        public DateTime? CompletedAt     { get; set; }
    [Column("session_id")]          public string?   SessionId       { get; set; }
    [Column("cost_usd")]            public decimal?  CostUsd         { get; set; }
    [Column("tokens_in")]           public long?     TokensIn        { get; set; }
    [Column("tokens_out")]          public long?     TokensOut       { get; set; }
    [Column("usage_json")]          public string?   UsageJson       { get; set; }
}

public class AnalysisRepository : IAnalysisRepository
{
    private readonly Supabase.Client _db;
    public AnalysisRepository(Supabase.Client db) => _db = db;

    public async Task<List<Analysis>> GetHistoryAsync(Guid userId, int limit = 15)
    {
        var result = await _db.From<AnalysisRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Filter("status",  Operator.Equals, "done")
            .Order("created_at", Ordering.Descending)
            .Limit(limit)
            .Get();
        return result.Models.Select(ToDomain).ToList();
    }

    public async Task<Analysis?> GetByIdAsync(Guid analysisId, Guid userId)
    {
        var row = await _db.From<AnalysisRow>()
            .Filter("id",      Operator.Equals, analysisId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Single();
        return row == null ? null : ToDomain(row);
    }

    public async Task<Analysis?> GetActiveAsync(Guid userId)
    {
        var result = await _db.From<AnalysisRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Order("created_at", Ordering.Descending)
            .Limit(5)
            .Get();
        var row = result.Models.FirstOrDefault(r => r.Status is "pending" or "processing");
        return row == null ? null : ToDomain(row);
    }

    public async Task<Analysis> UpsertAsync(Analysis analysis)
    {
        await _db.From<AnalysisRow>().Upsert(ToRow(analysis));
        return analysis;
    }

    public async Task UpdateStatusAsync(Guid analysisId, string status,
        string? cleanedCsvPath = null, string? pdfPath    = null,
        string? wordPath       = null, string? pptxPath   = null)
    {
        var q = _db.From<AnalysisRow>()
            .Filter("id", Operator.Equals, analysisId.ToString())
            .Set(r => r.Status, status);

        if (status is "done" or "failed")
            q = q.Set(r => r.CompletedAt!, DateTime.UtcNow);
        if (cleanedCsvPath != null) q = q.Set(r => r.CleanedCsvPath!, cleanedCsvPath);
        if (pdfPath        != null) q = q.Set(r => r.PdfReportPath!,  pdfPath);
        if (wordPath       != null) q = q.Set(r => r.WordReportPath!, wordPath);
        if (pptxPath       != null) q = q.Set(r => r.PptxReportPath!, pptxPath);

        await q.Update();
    }

    public async Task UpdateUsageAsync(Guid analysisId,
        decimal costUsd, long tokensIn, long tokensOut, string? usageJson)
    {
        var q = _db.From<AnalysisRow>()
            .Filter("id", Operator.Equals, analysisId.ToString())
            .Set(r => r.CostUsd!,   costUsd)
            .Set(r => r.TokensIn!,  tokensIn)
            .Set(r => r.TokensOut!, tokensOut);
        if (usageJson != null) q = q.Set(r => r.UsageJson!, usageJson);
        await q.Update();
    }

    public async Task<List<Analysis>> GetAllSinceAsync(DateTime sinceUtc)
    {
        var result = await _db.From<AnalysisRow>()
            .Filter("created_at", Operator.GreaterThanOrEqual, sinceUtc.ToString("o"))
            .Order("created_at", Ordering.Descending)
            .Get();
        return result.Models.Select(ToDomain).ToList();
    }

    public async Task UpdateChartUrlsAsync(Guid analysisId, string json) =>
        await _db.From<AnalysisRow>()
            .Filter("id", Operator.Equals, analysisId.ToString())
            .Set(r => r.ChartUrls!, json).Update();

    public async Task UpdateOriginalCsvPathAsync(Guid analysisId, string path) =>
        await _db.From<AnalysisRow>()
            .Filter("id", Operator.Equals, analysisId.ToString())
            .Set(r => r.OriginalCsvPath!, path).Update();

    public async Task DeleteAsync(Guid analysisId, Guid userId) =>
        await _db.From<AnalysisRow>()
            .Filter("id",      Operator.Equals, analysisId.ToString())
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Delete();

    public async Task<int> CountDoneAsync(Guid userId)
    {
        var result = await _db.From<AnalysisRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Filter("status",  Operator.Equals, "done")
            .Get();
        return result.Models.Count;
    }

    public async Task<List<Analysis>> GetOverflowAsync(Guid userId, int keep)
    {
        if (keep < 0) keep = 0;

        // Newest first, then skip what the plan entitles the user to keep.
        // The ordering must match GetHistoryAsync — otherwise the rows deleted
        // here would be exactly the ones the user can still see.
        var result = await _db.From<AnalysisRow>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Filter("status",  Operator.Equals, "done")
            .Order("created_at", Ordering.Descending)
            .Get();

        return result.Models.Skip(keep).Select(ToDomain).ToList();
    }

    private static Analysis ToDomain(AnalysisRow r) =>
        Analysis.Restore(
            id:            Guid.Parse(r.Id),
            userId:        Guid.Parse(r.UserId),
            fileName:      r.FileName,
            fileSizeBytes: r.FileSizeBytes,
            status:        r.Status,
            createdAt:     r.CreatedAt,
            rowCount:      r.RowCount,
            columnCount:   r.ColumnCount,
            originalCsv:   r.OriginalCsvPath,
            cleanedCsv:    r.CleanedCsvPath,
            pdfPath:       r.PdfReportPath,
            wordPath:      r.WordReportPath,
            pptxPath:      r.PptxReportPath,
            chartUrls:     r.ChartUrls,
            customization: r.Customization,
            completedAt:   r.CompletedAt,
            sessionId:     r.SessionId != null ? Guid.Parse(r.SessionId) : null,
            costUsd:       r.CostUsd,
            tokensIn:      r.TokensIn,
            tokensOut:     r.TokensOut,
            usageJson:     r.UsageJson
        );

    private static AnalysisRow ToRow(Analysis a) => new()
    {
        Id              = a.Id.ToString(),
        UserId          = a.UserId.ToString(),
        FileName        = a.FileName,
        FileSizeBytes   = a.FileSizeBytes,
        RowCount        = a.RowCount,
        ColumnCount     = a.ColumnCount,
        OriginalCsvPath = a.OriginalCsvPath,
        CleanedCsvPath  = a.CleanedCsvPath,
        PdfReportPath   = a.PdfReportPath,
        WordReportPath  = a.WordReportPath,
        PptxReportPath  = a.PptxReportPath,
        ChartUrls       = a.ChartUrls,
        Status          = a.Status,
        Customization   = a.Customization,
        CreatedAt       = a.CreatedAt,
        CompletedAt     = a.CompletedAt,
        SessionId       = a.SessionId?.ToString(),
        CostUsd         = a.CostUsd,
        TokensIn        = a.TokensIn,
        TokensOut       = a.TokensOut,
        UsageJson       = a.UsageJson,
    };
}
