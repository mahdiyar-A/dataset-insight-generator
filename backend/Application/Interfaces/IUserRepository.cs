using System;
using System.Threading.Tasks;
using backend.Domain.Entities;

namespace backend.Application.Interfaces;

/// <summary>
/// Repository interface abstracting persistence operations for <see cref="User"/>.
/// Implementations (EF Core, Dapper, etc.) provide the concrete DB access.
/// The service layer depends on this interface to remain testable.
/// </summary>
public interface IUserRepository
{
	/// <summary>Return an active user by id or null if not found.</summary>
	Task<User?> GetByIdAsync(Guid id);

	/// <summary>Return any user with the given email (used for uniqueness checks).</summary>
	Task<User?> GetByEmailAsync(string email);

	/// <summary>Persist changes to an existing user. Implementations should SaveChanges.</summary>
	Task UpdateAsync(User user);

	/// <summary>Delete a user record. Depending on policy this can be a hard delete.</summary>
	Task DeleteAsync(Guid id);
}
