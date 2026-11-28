using backend.Application.Interfaces;
using backend.Domain.Entities;
using Microsoft.AspNetCore.Http;

namespace backend.Tests.Helpers;

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fakes for all infrastructure interfaces.
// These replace Supabase / Stripe / SMTP in every test so tests run offline,
// fast, and deterministically without touching external systems.
// ─────────────────────────────────────────────────────────────────────────────

/// <summary>
/// In-memory IAnalysisRepository — stores analyses in a plain List.
/// Thread-safe via lock so concurrent-access tests don't corrupt state.
/// </summary>
public class FakeAnalysisRepository : IAnalysisRepository
{
    private readonly List<Analysis> _store = new();
    private readonly object _lock = new();

    public List<Analysis> Store => _store;

    public Task<List<Analysis>> GetHistoryAsync(Guid userId, int limit = 15)
    {
        lock (_lock)
        {
            var result = _store
                .Where(a => a.UserId == userId && a.Status is "done" or "failed")
                .OrderByDescending(a => a.CreatedAt)
                .Take(limit)
                .ToList();
            return Task.FromResult(result);
        }
    }

    public Task<Analysis?> GetByIdAsync(Guid analysisId, Guid userId)
    {
        lock (_lock)
        {
            var a = _store.FirstOrDefault(x => x.Id == analysisId && x.UserId == userId);
            return Task.FromResult(a);
        }
    }

    public Task<Analysis?> GetActiveAsync(Guid userId)
    {
        lock (_lock)
        {
            var a = _store.FirstOrDefault(x => x.UserId == userId && x.Status is "pending" or "processing");
            return Task.FromResult(a);
        }
    }

    public Task<Analysis> UpsertAsync(Analysis analysis)
    {
        lock (_lock)
        {
            var existing = _store.FirstOrDefault(x => x.Id == analysis.Id);
            if (existing != null) _store.Remove(existing);
            _store.Add(analysis);
            return Task.FromResult(analysis);
        }
    }

    public Task UpdateStatusAsync(Guid analysisId, string status,
        string? cleanedCsvPath = null, string? pdfPath = null,
        string? wordPath = null, string? pptxPath = null)
    {
        lock (_lock)
        {
            var a = _store.FirstOrDefault(x => x.Id == analysisId);
            if (a == null) return Task.CompletedTask;
            a.SetStatus(status);
            if (cleanedCsvPath != null) a.SetCleanedCsvPath(cleanedCsvPath);
            if (pdfPath         != null) a.SetPdfPath(pdfPath);
            if (wordPath        != null) a.SetWordPath(wordPath);
            if (pptxPath        != null) a.SetPptxPath(pptxPath);
        }
        return Task.CompletedTask;
    }

    public virtual Task<int> FailUnfinishedAsync(DateTime startedBefore)
    {
        lock (_lock)
        {
            var stuck = _store.Where(a => a.Status == "processing" && a.CreatedAt < startedBefore).ToList();
            stuck.ForEach(a => a.SetStatus("failed"));
            return Task.FromResult(stuck.Count);
        }
    }

    public Task UpdateChartUrlsAsync(Guid analysisId, string chartUrlsJson)
    {
        lock (_lock)
        {
            var a = _store.FirstOrDefault(x => x.Id == analysisId);
            a?.SetChartUrls(chartUrlsJson);
        }
        return Task.CompletedTask;
    }

    public Task UpdateOriginalCsvPathAsync(Guid analysisId, string path)
    {
        lock (_lock)
        {
            var a = _store.FirstOrDefault(x => x.Id == analysisId);
            a?.SetOriginalCsvPath(path);
        }
        return Task.CompletedTask;
    }

    public Task UpdateUsageAsync(Guid analysisId,
        decimal costUsd, long tokensIn, long tokensOut, string? usageJson)
    {
        lock (_lock)
        {
            var a = _store.FirstOrDefault(x => x.Id == analysisId);
            a?.SetUsage(costUsd, tokensIn, tokensOut, usageJson);
        }
        return Task.CompletedTask;
    }

    public Task<List<Analysis>> GetAllSinceAsync(DateTime sinceUtc)
    {
        lock (_lock)
        {
            var result = _store
                .Where(a => a.CreatedAt >= sinceUtc)
                .OrderByDescending(a => a.CreatedAt)
                .ToList();
            return Task.FromResult(result);
        }
    }

    public Task DeleteAsync(Guid analysisId, Guid userId)
    {
        lock (_lock)
        {
            _store.RemoveAll(x => x.Id == analysisId && x.UserId == userId);
        }
        return Task.CompletedTask;
    }

    public Task<int> CountDoneAsync(Guid userId)
    {
        lock (_lock)
        {
            var count = _store.Count(x => x.UserId == userId && x.Status == "done");
            return Task.FromResult(count);
        }
    }

    public Task<List<Analysis>> GetOverflowAsync(Guid userId, int keep)
    {
        lock (_lock)
        {
            if (keep < 0) keep = 0;

            // Ordering deliberately mirrors GetHistoryAsync. If the two ever
            // diverged, pruning would delete rows the user can still see.
            var overflow = _store
                .Where(a => a.UserId == userId && a.Status == "done")
                .OrderByDescending(a => a.CreatedAt)
                .Skip(keep)
                .ToList();

            return Task.FromResult(overflow);
        }
    }
}

/// <summary>
/// In-memory IDatasetRepository — kept for the legacy DatasetsController.
/// </summary>
public class FakeDatasetRepository : IDatasetRepository
{
    /// <summary>Backing store — exposed so tests can seed and inspect state directly.</summary>
    public List<Dataset> Store { get; } = new();

    private List<Dataset> _store => Store;

    public Task<Dataset?> GetByUserIdAsync(Guid userId) =>
        Task.FromResult(_store.FirstOrDefault(d => d.UserId == userId));

    public Task UpsertAsync(Dataset dataset)
    {
        _store.RemoveAll(d => d.UserId == dataset.UserId);
        _store.Add(dataset);
        return Task.CompletedTask;
    }

    public Task DeleteByUserIdAsync(Guid userId) { _store.RemoveAll(d => d.UserId == userId); return Task.CompletedTask; }

    public Task UpdateStatusAsync(Guid userId, string status, string? cleanedCsvUrl = null, string? pdfReportUrl = null)
    {
        var d = _store.FirstOrDefault(x => x.UserId == userId);
        if (d != null) d.SetStatus(status);
        return Task.CompletedTask;
    }

    public Task UpdateChartUrlsAsync(Guid userId, string chartUrlsJson)
    {
        var d = _store.FirstOrDefault(x => x.UserId == userId);
        d?.SetChartUrls(chartUrlsJson);
        return Task.CompletedTask;
    }

    public Task UpdateOriginalCsvPathAsync(Guid userId, string originalCsvPath) => Task.CompletedTask;
}

/// <summary>
/// In-memory IUserRepository — provides controllable user plan data for quota tests.
/// </summary>
public class FakeUserRepository : IUserRepository
{
    public User? DefaultUser { get; set; }

    private User MakeDefault(Guid id) => User.Restore(
        id, "testuser", "test@example.com", "supabase-auth",
        null, null, true, true,
        DateTime.UtcNow.AddDays(-1), null,
        plan: DefaultUser?.Plan ?? "free",
        reportsUsed: DefaultUser?.ReportsUsed ?? 0,
        reportsResetAt: DefaultUser?.ReportsResetAt ?? DateTime.UtcNow.AddDays(-1));

    /// <summary>User names by id, for tests where who saved matters.</summary>
    public Dictionary<Guid, string> Names { get; } = new();

    public Task<User?> GetByIdAsync(Guid id) =>
        Task.FromResult<User?>(Names.TryGetValue(id, out var name)
            ? User.Restore(id, name, $"{name}@example.com", "supabase-auth", null, null, true, true,
                           DateTime.UtcNow.AddDays(-1), null)
            : DefaultUser ?? MakeDefault(id));

    /// <summary>
    /// Who an address belongs to, for tests where that matters. Unset, every
    /// address belongs to DefaultUser, as before.
    /// </summary>
    public Func<string, User?>? ByEmail { get; set; }

    public Task<User?> GetByEmailAsync(string email) =>
        Task.FromResult(ByEmail != null ? ByEmail(email) : DefaultUser);

    public Task<User?> GetByStripeCustomerIdAsync(string stripeCustomerId) =>
        Task.FromResult(DefaultUser?.StripeCustomerId == stripeCustomerId ? DefaultUser : null);

    public Task<List<User>> GetAllAsync() =>
        Task.FromResult(DefaultUser != null ? new List<User> { DefaultUser } : new List<User>());

    public Task AddAsync(User user) => Task.CompletedTask;
    public Task UpdateAsync(User user) { DefaultUser = user; return Task.CompletedTask; }
    public Task DeleteAsync(Guid id) { DefaultUser = null; return Task.CompletedTask; }

    public List<(string Plan, DateTime? ExpiresAt, string? SubscriptionId)> PlanChanges { get; } = new();

    public Task SetPlanAsync(Guid userId, string plan, DateTime? planExpiresAt, string? stripeSubscriptionId)
    {
        PlanChanges.Add((plan, planExpiresAt, stripeSubscriptionId));
        return Task.CompletedTask;
    }
    public Task SetStripeCustomerIdAsync(Guid userId, string customerId) => Task.CompletedTask;
    // Recorded rather than ignored. A no-op here is how the free plan's quota
    // went unenforced unnoticed: nothing ever called the real one either.
    public int IncrementCalls { get; private set; }
    public int ResetCalls     { get; private set; }
    public Task IncrementReportUsageAsync(Guid userId) { IncrementCalls++; return Task.CompletedTask; }
    public Task ResetReportQuotaAsync(Guid userId)     { ResetCalls++;     return Task.CompletedTask; }
    public Task UpdateLastActiveAsync(Guid userId) => Task.CompletedTask;
}

/// <summary>
/// No-op IStorageService — returns predictable paths, never touches Supabase.
/// </summary>
public class FakeStorageService : IStorageService
{
    private static string Dir(Guid userId, Guid analysisId) =>
        $"users/{userId}/analyses/{analysisId}";

    /// <summary>
    /// Every path written, in order. Lets a test assert that two analyses wrote
    /// to different locations — the exact property that was broken when the PDF,
    /// CSVs and charts all shared users/{userId}/report.pdf and friends.
    /// </summary>
    public List<string> WrittenPaths { get; } = new();

    private Task<string> Record(string path)
    {
        WrittenPaths.Add(path);
        Files[path] = Array.Empty<byte>();
        return Task.FromResult(path);
    }

    public Task<string> SaveProfilePictureAsync(Guid userId, IFormFile file) =>
        Record($"users/{userId}/profile.jpg");

    public Task<string> SaveOriginalCsvAsync(Guid userId, Guid analysisId, IFormFile file) =>
        Record($"{Dir(userId, analysisId)}/original.csv");

    public async Task<string> SaveOriginalFileAsync(Guid userId, Guid analysisId, byte[] bytes, string fileName)
    {
        // Same rule as the real service: the stored name keeps the upload's
        // extension. Bytes are kept so a question can read the file back.
        var ext  = backend.Application.Services.FileFormats.ExtensionOf(fileName) ?? ".csv";
        var path = await Record($"{Dir(userId, analysisId)}/original{ext}");
        Files[path] = bytes;
        return path;
    }

    private static string ChatContextPath(Guid userId, Guid analysisId) =>
        $"{Dir(userId, analysisId)}/chat_context.json";

    public async Task SaveChatContextAsync(Guid userId, Guid analysisId, string json)
    {
        var path = await Record(ChatContextPath(userId, analysisId));
        Files[path] = System.Text.Encoding.UTF8.GetBytes(json);
    }

    public Task<string?> ReadChatContextAsync(Guid userId, Guid analysisId) =>
        Task.FromResult(Files.TryGetValue(ChatContextPath(userId, analysisId), out var bytes)
            ? System.Text.Encoding.UTF8.GetString(bytes)
            : null);

    public async Task<string> SaveCleanedCsvAsync(Guid userId, Guid analysisId, byte[] csvBytes)
    {
        var path = await Record($"{Dir(userId, analysisId)}/cleaned.csv");
        Files[path] = csvBytes;
        return path;
    }

    /// <summary>Set to make the next report file saves throw, as an unreachable bucket would.</summary>
    public bool FailReportSaves { get; set; }

    private async Task<string> SaveReport(string path, byte[] bytes)
    {
        if (FailReportSaves) throw new InvalidOperationException("Exception: bucket unreachable");
        Saved[path] = bytes;
        await Record(path);
        Files[path] = bytes;
        return path;
    }

    public Task<string> SavePdfReportAsync(Guid userId, Guid analysisId, byte[] pdfBytes) =>
        SaveReport($"{Dir(userId, analysisId)}/report.pdf", pdfBytes);

    public Task<string> SaveWordReportAsync(Guid userId, Guid analysisId, byte[] docxBytes) =>
        SaveReport($"{Dir(userId, analysisId)}/report.docx", docxBytes);

    public Task<string> SavePptxReportAsync(Guid userId, Guid analysisId, byte[] pptxBytes) =>
        SaveReport($"{Dir(userId, analysisId)}/report.pptx", pptxBytes);

    public async Task<string> SaveChartAsync(Guid userId, Guid analysisId, int index, byte[] pngBytes)
    {
        if (FailChartSaves) throw new InvalidOperationException("Exception: bucket unreachable");
        var path = await Record($"{Dir(userId, analysisId)}/chart_{index}.png");
        Files[path] = pngBytes;
        return path;
    }

    public Task<byte[]?> ReadChartAsync(Guid userId, Guid analysisId, int index) =>
        Task.FromResult(Files.TryGetValue($"{Dir(userId, analysisId)}/chart_{index}.png", out var bytes)
                        && bytes.Length > 0 ? bytes : null);

    /// <summary>Set to make chart saves throw, as an unreachable bucket would.</summary>
    public bool FailChartSaves { get; set; }

    public Task<string?> GetChartUrlAsync(Guid userId, Guid analysisId, int index, int expiresInSeconds = 3600) =>
        Task.FromResult<string?>(index is >= 0 and < backend.Application.Services.ReportService.MaxChartFiles
            ? $"https://fake-storage.example.com/{Dir(userId, analysisId)}/chart_{index}.png?expires={expiresInSeconds}"
            : null);

    /// <summary>The bytes last saved as each report file, by path. Record keeps only the path.</summary>
    public Dictionary<string, byte[]> Saved { get; } = new();

    /// <summary>Analysis ids passed to DeleteAnalysisFilesAsync, in order.</summary>
    public List<Guid> DeletedAnalyses { get; } = new();

    public Task DeleteAnalysisFilesAsync(Guid userId, Guid analysisId)
    {
        DeletedAnalyses.Add(analysisId);

        // Remove only this analysis's directory. Modelling it as a prefix match
        // is what lets a test catch the old behaviour, where deleting one
        // analysis removed files belonging to every other one.
        var prefix = Dir(userId, analysisId) + "/";
        foreach (var key in Files.Keys.Where(k => k.StartsWith(prefix)).ToList())
            Files.Remove(key);

        return Task.CompletedTask;
    }

    public List<string> DeletedFiles { get; } = new();

    public Task DeleteFileAsync(string storagePath)
    {
        DeletedFiles.Add(storagePath);
        return Task.CompletedTask;
    }

    /// <summary>Makes DeleteUserFilesAsync fail, as an unreachable bucket would.</summary>
    public bool FailUserFileDeletion { get; set; }

    public Task DeleteUserFilesAsync(Guid userId)
    {
        if (FailUserFileDeletion) throw new InvalidOperationException("Exception: bucket unreachable");
        var prefix = $"users/{userId}/";
        foreach (var key in Files.Keys.Where(k => k.StartsWith(prefix)).ToList())
            Files.Remove(key);
        return Task.CompletedTask;
    }

    public Task<string> GetSignedUrlAsync(string storagePath, int expiresInSeconds = 3600) =>
        Task.FromResult($"https://fake-storage.example.com/{storagePath}?expires={expiresInSeconds}");

    /// <summary>
    /// Paths that should resolve to bytes. Anything not listed downloads as null,
    /// mirroring Supabase returning 404 for a missing object.
    ///
    /// Risk: a fake that always returns bytes hides the "DB says the report exists
    /// but storage lost it" case, which is exactly when an email endpoint would
    /// send an empty attachment.
    /// </summary>
    public Dictionary<string, byte[]> Files { get; } = new();

    /// <summary>Set to true to make every DownloadAsync return null.</summary>
    public bool SimulateMissingFiles { get; set; } = false;

    public Task<byte[]?> DownloadAsync(string storagePath)
    {
        if (SimulateMissingFiles) return Task.FromResult<byte[]?>(null);
        return Task.FromResult(Files.TryGetValue(storagePath, out var bytes) ? bytes : null);
    }
}

/// <summary>
/// Controllable IPythonAiClient — returns configurable responses without
/// making any network calls. Tests can set Condition to simulate each pipeline outcome.
/// </summary>
public class FakePythonAiClient : IPythonAiClient
{
    /// <summary>Set to control what /check returns: all_good | not_clean | low_accuracy | not_workable</summary>
    public string CheckCondition { get; set; } = "all_good";

    /// <summary>Set to true to simulate a timeout on /analyze</summary>
    public bool SimulateTimeout { get; set; } = false;

    /// <summary>
    /// Every request handed to /analyze, in order.
    ///
    /// Risk: without capturing the outgoing request, a test can only assert that
    /// the pipeline *ran* — not what it was told to do. The data-cleaning bug
    /// lived exactly in that blind spot: AnalysisService accepted
    /// userWantsCleaning and silently dropped it before building this DTO, so
    /// Python never cleaned anything while the chatbot told the user it had.
    /// </summary>
    public List<backend.Application.DTOs.AI.AnalyzeRequestDto> ReceivedRequests { get; } = new();

    /// <summary>The most recent /analyze request, or null if none was made.</summary>
    public backend.Application.DTOs.AI.AnalyzeRequestDto? LastRequest =>
        ReceivedRequests.Count > 0 ? ReceivedRequests[^1] : null;

    /// <summary>Base64 CSV returned as the cleaned output. Null = no cleaning performed.</summary>
    public string? CleanedCsvBase64 { get; set; }

    /// <summary>How many charts the fake pipeline returns. Default 0.</summary>
    public int ChartCount { get; set; } = 0;

    /// <summary>
    /// Raw JSON for the response's "usage" object, or null to omit it — an
    /// older AI service image that predates telemetry omits the field, and the
    /// backend must tolerate both.
    /// </summary>
    public string? UsageJson { get; set; }

    /// <summary>Raw JSON for the response's "chat_context", or null to omit it (an older image).</summary>
    public string? ChatContextJson { get; set; }

    /// <summary>Set to what /check says is wrong with the file, for a not_workable condition.</summary>
    public string? CheckError { get; set; }

    /// <summary>File names handed to /check, in order.</summary>
    public List<string> CheckedFileNames { get; } = new();

    /// <summary>What /inspect answers. The default reads the file as a small table.</summary>
    public string InspectJson { get; set; } = """
    {
      "ok": true, "format": "parquet", "formatLabel": "Parquet", "rows": 1200, "columns": 3,
      "headers": ["date", "region", "revenue"],
      "preview": [["2024-01-01", "North", "10.5"]],
      "columnKinds": [{"name": "date", "kind": "date"}, {"name": "region", "kind": "text"}, {"name": "revenue", "kind": "number"}],
      "detail": "", "notes": ["Read 1,200 rows."]
    }
    """;

    /// <summary>Set to true to make /inspect, /brief and /ask throw, as when the AI service is down.</summary>
    public bool SimulateDown { get; set; } = false;

    /// <summary>File names handed to /inspect, in order.</summary>
    public List<string> InspectedFileNames { get; } = new();

    public string BriefJson { get; set; } = """
    {"settings": {"tone": "casual", "insightsCount": 3}, "summary": "Short and casual.", "notPossible": [], "source": "model"}
    """;

    public record BriefCall(string Text, IReadOnlyList<string> Columns, string UiLanguage);

    public List<BriefCall> BriefCalls { get; } = new();

    public string AskJson { get; set; } = """
    {"answer": "South leads with 42%.", "refused": false, "queries": [], "unverifiedNumbers": [],
     "model": "Stub", "grounding": "analysis", "usage": {"total_cost_usd": 0}}
    """;

    public record AskCall(string Question, string ContextJson, string HistoryJson, string UiLanguage,
                          byte[]? FileBytes, string? FileName, string? DocumentJson = null);

    public List<AskCall> AskCalls { get; } = new();

    /// <summary>What /report/next-steps answers.</summary>
    public string NextStepsJson { get; set; } = """{"steps": []}""";

    public record NextStepsCall(string DocumentJson, string? ChatContextJson);

    public List<NextStepsCall> NextStepsCalls { get; } = new();

    public Task<string> ReportNextStepsAsync(string documentJson, string? chatContextJson)
    {
        NextStepsCalls.Add(new NextStepsCall(documentJson, chatContextJson));
        if (SimulateDown) throw new HttpRequestException("Simulated: AI service unreachable");
        return Task.FromResult(NextStepsJson);
    }

    /// <summary>What /report/draw answers: {"proposal"} or {"error"}.</summary>
    public string DrawJson { get; set; } = """{"error": "No chart was set up for this test."}""";

    public record DrawCall(string DocumentJson, string ChartJson, string Label, byte[] FileBytes, string FileName);

    public List<DrawCall> DrawCalls { get; } = new();

    public Task<string> ReportDrawAsync(string documentJson, string chartJson, string label,
                                        byte[] fileBytes, string fileName)
    {
        DrawCalls.Add(new DrawCall(documentJson, chartJson, label, fileBytes, fileName));
        if (SimulateDown) throw new TimeoutException("Simulated: /report/draw timed out");
        return Task.FromResult(DrawJson);
    }

    public Task<string> InspectAsync(byte[] fileBytes, string fileName)
    {
        InspectedFileNames.Add(fileName);
        if (SimulateDown) throw new HttpRequestException("Simulated: AI service unreachable");
        return Task.FromResult(InspectJson);
    }

    public Task<string> BriefAsync(string text, IReadOnlyList<string> columns, string uiLanguage)
    {
        BriefCalls.Add(new BriefCall(text, columns, uiLanguage));
        if (SimulateDown) throw new TimeoutException("Simulated: /brief timed out");
        return Task.FromResult(BriefJson);
    }

    public Task<string> AskAsync(string question, string contextJson, string historyJson, string uiLanguage,
                                 byte[]? fileBytes, string? fileName, string? documentJson = null)
    {
        AskCalls.Add(new AskCall(question, contextJson, historyJson, uiLanguage, fileBytes, fileName, documentJson));
        if (SimulateDown) throw new TimeoutException("Simulated: /ask timed out");
        return Task.FromResult(AskJson);
    }

    /// <summary>
    /// The "domain" part of /check's answer: what the AI service takes the data
    /// to be. Null leaves it out, as an AI service that predates it does.
    /// </summary>
    public string? DomainBlockJson { get; set; }

    /// <summary>Whether each /check was asked to read the data as well, in order.</summary>
    public List<bool> ChecksWithDomain { get; } = new();

    public Task<string> CheckQualityAsync(byte[] csvBytes, string fileName, Guid sessionId, bool withDomain = false)
    {
        CheckedFileNames.Add(fileName);
        ChecksWithDomain.Add(withDomain);
        var error  = CheckError is null ? "null" : System.Text.Json.JsonSerializer.Serialize(CheckError);
        var domain = withDomain && DomainBlockJson != null ? $",\"domain\":{DomainBlockJson}" : "";
        var json   = $"{{\"condition\":\"{CheckCondition}\",\"error\":{error}{domain}}}";
        return Task.FromResult(json);
    }

    public Task<string> CallPythonAiAsync(backend.Application.DTOs.AI.AnalyzeRequestDto request)
    {
        ReceivedRequests.Add(request);

        if (SimulateTimeout)
            throw new TaskCanceledException("Simulated timeout");

        var cleanedCsv = CleanedCsvBase64 is null ? "null" : $"\"{CleanedCsvBase64}\"";

        var charts = string.Join(",", Enumerable.Range(0, ChartCount).Select(i =>
            "{\"type\":\"bar\",\"label\":\"Chart " + i +
            "\",\"desc\":\"d\",\"color\":\"#fff\",\"image_base64\":\"AAAA\"}"));

        return Task.FromResult($$"""
        {
          "status": "done",
          "pdf_report_base64": "AAAA",
          "cleaned_csv_base64": {{cleanedCsv}},
          "word_report_base64": null,
          "pptx_report_base64": null,
          "charts": [{{charts}}],
          "confidence_score": 8,
          "usage": {{UsageJson ?? "null"}},
          "chat_context": {{ChatContextJson ?? "null"}},
          "report_writer": {{(ReportWriter is null ? "null" : System.Text.Json.JsonSerializer.Serialize(ReportWriter))}},
          "report_document": {{ReportDocumentJson ?? "null"}},
          "error": null
        }
        """);
    }

    /// <summary>
    /// The response's "report_writer": a model's name, "" when no model wrote
    /// the report (the stats-only fallback), or null for an AI service that
    /// predates the field.
    /// </summary>
    public string? ReportWriter { get; set; }

    /// <summary>What /models/status answers. The default is a day with nothing wrong.</summary>
    public string ModelStatusJson { get; set; } = """
    {"checkedAt": "2026-11-11T09:00:00Z", "models": [], "chains": [], "problems": [], "notes": [],
     "allowance": {"openrouter": {"used": 12, "limit": 50, "remaining": 38}}}
    """;

    public int ModelStatusCalls { get; private set; }

    public Task<bool> HealthAsync()
    {
        if (SimulateDown) throw new HttpRequestException("Simulated: AI service unreachable");
        return Task.FromResult(true);
    }

    public Task<string> ModelStatusAsync()
    {
        ModelStatusCalls++;
        if (SimulateDown) throw new HttpRequestException("Simulated: AI service unreachable");
        return Task.FromResult(ModelStatusJson);
    }

    /// <summary>The response's "report_document", or null to omit it (an AI service from before editing).</summary>
    public string? ReportDocumentJson { get; set; }

    /// <summary>Every /report/rebuild request, in order.</summary>
    public List<backend.Application.DTOs.AI.ReportRebuildRequest> RebuildCalls { get; } = new();

    /// <summary>
    /// What /report/rebuild answers. The default plays the AI service's part:
    /// the document is the edit as sent (or the original when none), with a
    /// PDF always and Word or PowerPoint when asked for.
    /// </summary>
    public Func<backend.Application.DTOs.AI.ReportRebuildRequest, string>? RebuildReply { get; set; }

    public Task<string> RebuildReportAsync(backend.Application.DTOs.AI.ReportRebuildRequest request)
    {
        RebuildCalls.Add(request);
        if (SimulateDown) throw new TimeoutException("Simulated: /report/rebuild timed out");
        if (RebuildReply != null) return Task.FromResult(RebuildReply(request));
        var document = request.EditedJson ?? request.OriginalJson;
        string File(bool wanted, string text) =>
            wanted ? System.Text.Json.JsonSerializer.Serialize(Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(text))) : "null";
        var chat = "{\"version\": 1, \"report\": {\"document\": " + document + "}}";
        return Task.FromResult($$"""
        {"document": {{document}},
         "pdf_report_base64": {{File(true, "PDF:" + document)}},
         "word_report_base64": {{File(request.WantWord, "WORD:" + document)}},
         "pptx_report_base64": {{File(request.WantPptx, "PPTX:" + document)}},
         "warnings": [],
         "chat_context": {{chat}} }
        """);
    }
}

/// <summary>
/// In-memory report versions, with the database's one rule that matters: a
/// version number can be taken once per analysis.
/// </summary>
public class FakeReportVersionRepository : IReportVersionRepository
{
    private readonly List<ReportVersion> _rows = new();
    private readonly object _lock = new();

    public IReadOnlyList<ReportVersion> All { get { lock (_lock) return _rows.ToList(); } }

    /// <summary>Set to make every call throw, as before migration 005 is applied.</summary>
    public bool SimulateMissingTable { get; set; }

    private void Check()
    {
        if (SimulateMissingTable) throw new InvalidOperationException("relation \"report_versions\" does not exist");
    }

    public Task<ReportVersion?> GetLatestAsync(Guid analysisId)
    {
        Check();
        lock (_lock)
            return Task.FromResult(_rows.Where(r => r.AnalysisId == analysisId)
                                        .OrderByDescending(r => r.Version).FirstOrDefault());
    }

    public Task<ReportVersion?> GetAsync(Guid analysisId, int version)
    {
        Check();
        lock (_lock)
            return Task.FromResult(_rows.FirstOrDefault(r => r.AnalysisId == analysisId && r.Version == version));
    }

    public Task<List<ReportVersion>> ListAsync(Guid analysisId)
    {
        Check();
        lock (_lock)
            return Task.FromResult(_rows.Where(r => r.AnalysisId == analysisId)
                                        .OrderByDescending(r => r.Version).ToList());
    }

    public Task<bool> TryInsertAsync(ReportVersion version)
    {
        Check();
        lock (_lock)
        {
            if (_rows.Any(r => r.AnalysisId == version.AnalysisId && r.Version == version.Version))
                return Task.FromResult(false);
            _rows.Add(version);
            return Task.FromResult(true);
        }
    }

    public Task MarkFilesBuiltAsync(Guid analysisId, int version)
    {
        Check();
        lock (_lock)
        {
            var i = _rows.FindIndex(r => r.AnalysisId == analysisId && r.Version == version);
            if (i >= 0)
            {
                var r = _rows[i];
                _rows[i] = new ReportVersion(r.AnalysisId, r.Version, r.Document, r.EditedBy, r.Kind,
                                             r.RestoredFrom, filesBuilt: true, r.CreatedAt);
            }
        }
        return Task.CompletedTask;
    }

    public Task TrimAsync(Guid analysisId, int newest, int keep)
    {
        Check();
        lock (_lock)
            _rows.RemoveAll(r => r.AnalysisId == analysisId && r.Version > 1 && r.Version < newest - keep + 1);
        return Task.CompletedTask;
    }
}

/// <summary>
/// The admin page's counts and record, kept in memory so tests can read them.
/// Set <see cref="Missing"/> to act like a database without migration 007.
/// </summary>
public class FakeActivityLog : IActivityLog
{
    private readonly object _lock = new();
    public Dictionary<string, int> Counts { get; } = new();
    public List<FindingFeedbackRow> Findings { get; } = new();
    public List<AdminActionRecord> Actions { get; } = new();
    public bool Missing { get; set; }

    public void Count(string kind, int by = 1)
    {
        lock (_lock) Counts[kind] = Counts.GetValueOrDefault(kind) + by;
    }

    public int CountOf(string kind) { lock (_lock) return Counts.GetValueOrDefault(kind); }

    public void CountFindings(string domain, string kind, int shown, int removed, int rewritten)
    {
        lock (_lock)
        {
            var i = Findings.FindIndex(f => f.Domain == domain && f.Kind == kind);
            var was = i >= 0 ? Findings[i] : new FindingFeedbackRow(domain, kind, 0, 0, 0);
            var now = was with { Shown = was.Shown + shown, Removed = was.Removed + removed, Rewritten = was.Rewritten + rewritten };
            if (i >= 0) Findings[i] = now; else Findings.Add(now);
        }
    }

    public Task RecordAdminActionAsync(AdminActionRecord action)
    {
        lock (_lock) Actions.Add(action);
        return Task.CompletedTask;
    }

    public Task<List<UsageCount>> GetUsageSinceAsync(DateOnly since)
    {
        if (Missing) throw new InvalidOperationException("relation \"usage_daily\" does not exist");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        lock (_lock) return Task.FromResult(Counts.Select(c => new UsageCount(today, c.Key, c.Value)).ToList());
    }

    public Task<List<FindingFeedbackRow>> GetFindingFeedbackAsync()
    {
        if (Missing) throw new InvalidOperationException("relation \"finding_feedback\" does not exist");
        lock (_lock) return Task.FromResult(Findings.ToList());
    }

    public Task<List<AdminActionRecord>> GetAdminActionsAsync(int limit)
    {
        if (Missing) throw new InvalidOperationException("relation \"admin_actions\" does not exist");
        lock (_lock) return Task.FromResult(Actions.OrderByDescending(a => a.At).Take(limit).ToList());
    }
}
