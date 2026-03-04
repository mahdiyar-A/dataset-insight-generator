using backend.Domain.Entities;

namespace backend.Application.Interfaces;

public interface IDatasetRepository
{
    Task<Dataset?> GetByUserIdAsync(Guid userId);
    Task UpsertAsync(Dataset dataset);
    Task UpdateStatusAsync(Guid userId, string status,
        string? cleanedCsvUrl = null, string? pdfReportUrl = null);
    Task DeleteByUserIdAsync(Guid userId);
}