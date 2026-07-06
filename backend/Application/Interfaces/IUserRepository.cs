using backend.Domain.Entities;

namespace backend.Application.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id);
    Task<User?> GetByEmailAsync(string email);
    Task<User?> GetByStripeCustomerIdAsync(string stripeCustomerId);
    Task<List<User>> GetAllAsync();

    Task AddAsync(User user);
    Task UpdateAsync(User user);
    Task DeleteAsync(Guid id);

    // Plan + billing
    Task SetPlanAsync(Guid userId, string plan,
        DateTime? planExpiresAt, string? stripeSubscriptionId);
    Task SetStripeCustomerIdAsync(Guid userId, string customerId);

    // Report usage quota (free plan: 2 per 48h)
    Task IncrementReportUsageAsync(Guid userId);
    Task ResetReportQuotaAsync(Guid userId);

    // Session activity tracking
    Task UpdateLastActiveAsync(Guid userId);
}
