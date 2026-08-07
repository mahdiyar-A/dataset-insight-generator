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
}

/// <summary>
/// In-memory IDatasetRepository — kept for the legacy DatasetsController.
/// </summary>
public class FakeDatasetRepository : IDatasetRepository
{
    private readonly List<Dataset> _store = new();

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

    public Task<User?> GetByIdAsync(Guid id) =>
        Task.FromResult<User?>(DefaultUser ?? MakeDefault(id));

    public Task<User?> GetByEmailAsync(string email) =>
        Task.FromResult<User?>(DefaultUser);

    public Task<User?> GetByStripeCustomerIdAsync(string stripeCustomerId) =>
        Task.FromResult<User?>(null);

    public Task<List<User>> GetAllAsync() =>
        Task.FromResult(DefaultUser != null ? new List<User> { DefaultUser } : new List<User>());

    public Task AddAsync(User user) => Task.CompletedTask;
    public Task UpdateAsync(User user) { DefaultUser = user; return Task.CompletedTask; }
    public Task DeleteAsync(Guid id) { DefaultUser = null; return Task.CompletedTask; }

    public Task SetPlanAsync(Guid userId, string plan, DateTime? planExpiresAt, string? stripeSubscriptionId) =>
        Task.CompletedTask;
    public Task SetStripeCustomerIdAsync(Guid userId, string customerId) => Task.CompletedTask;
    public Task IncrementReportUsageAsync(Guid userId) => Task.CompletedTask;
    public Task ResetReportQuotaAsync(Guid userId) => Task.CompletedTask;
    public Task UpdateLastActiveAsync(Guid userId) => Task.CompletedTask;
}

/// <summary>
/// No-op IStorageService — returns predictable paths, never touches Supabase.
/// </summary>
public class FakeStorageService : IStorageService
{
    public Task<string> SaveProfilePictureAsync(Guid userId, IFormFile file) =>
        Task.FromResult($"users/{userId}/profile.jpg");

    public Task<string> SaveOriginalCsvAsync(Guid userId, IFormFile file) =>
        Task.FromResult($"users/{userId}/original.csv");

    public Task<string> SaveCleanedCsvAsync(Guid userId, byte[] csvBytes, string fileName = "cleaned.csv") =>
        Task.FromResult($"users/{userId}/{fileName}");

    public Task<string> SavePdfReportAsync(Guid userId, byte[] pdfBytes) =>
        Task.FromResult($"users/{userId}/report.pdf");

    public Task<string> SaveWordReportAsync(Guid userId, Guid analysisId, byte[] docxBytes) =>
        Task.FromResult($"users/{userId}/analyses/{analysisId}/report.docx");

    public Task<string> SavePptxReportAsync(Guid userId, Guid analysisId, byte[] pptxBytes) =>
        Task.FromResult($"users/{userId}/analyses/{analysisId}/report.pptx");

    public Task<string> SaveChartAsync(Guid userId, int index, byte[] pngBytes) =>
        Task.FromResult($"users/{userId}/chart_{index}.png");

    public Task DeleteAnalysisFilesAsync(Guid userId, Guid analysisId) => Task.CompletedTask;
    public Task DeleteUserFilesAsync(Guid userId) => Task.CompletedTask;

    public Task<string> GetSignedUrlAsync(string storagePath, int expiresInSeconds = 3600) =>
        Task.FromResult($"https://fake-storage.example.com/{storagePath}?expires={expiresInSeconds}");
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

    public Task<string> CheckQualityAsync(byte[] csvBytes, string fileName, Guid sessionId)
    {
        var json = $"{{\"condition\":\"{CheckCondition}\",\"error\":null}}";
        return Task.FromResult(json);
    }

    public Task<string> CallPythonAiAsync(backend.Application.DTOs.AI.AnalyzeRequestDto request)
    {
        if (SimulateTimeout)
            throw new TaskCanceledException("Simulated timeout");

        // Return a minimal valid pipeline response
        var json = """
        {
          "status": "done",
          "pdf_report_base64": "AAAA",
          "cleaned_csv_base64": null,
          "word_report_base64": null,
          "pptx_report_base64": null,
          "charts": [],
          "confidence_score": 8,
          "error": null
        }
        """;
        return Task.FromResult(json);
    }
}
