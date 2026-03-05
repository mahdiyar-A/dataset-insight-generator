using backend.Domain.Entities;

namespace backend.Application.Interfaces;

public interface IDatasetRepository
{
    Task<Dataset?> GetByUserIdAsync(Guid userId);
    Task UpsertAsync(Dataset dataset);  // insert or replace — one per user
    Task DeleteByUserIdAsync(Guid userId);
    Task UpdateStatusAsync(Guid userId, string status,
        string? cleanedCsvUrl = null, string? pdfReportUrl = null);
}