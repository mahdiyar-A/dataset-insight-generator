using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using backend.Application.Interfaces;
using backend.Domain.Entities;
using backend.Infrastructure.Data;

namespace backend.Infrastructure.Repositories;

/// <summary>
/// EF Core implementation of <see cref="IUserRepository"/>.
/// Keeps persistence concerns isolated from business logic and services.
/// </summary>
public class UserRepository : IUserRepository
{
	private readonly AppDbContext _db;

	/// <summary>DbContext is injected by DI.</summary>
	public UserRepository(AppDbContext db)
	{
		_db = db;
	}

	/// <summary>
	/// Retrieve an active user by id. The IsActive check implements soft-delete semantics.
	/// Returns null when no matching active user exists.
	/// </summary>
	public async Task<User?> GetByIdAsync(Guid id)
	{
		return await _db.Users.FirstOrDefaultAsync(u => u.Id == id && u.IsActive);
	}

	/// <summary>
	/// Retrieve a user by email. This method is used to check uniqueness when updating
	/// an email address. Comparison is done in a case-insensitive manner.
	/// </summary>
	public async Task<User?> GetByEmailAsync(string email)
	{
		if (string.IsNullOrWhiteSpace(email)) return null;
		var norm = email.Trim().ToLowerInvariant();
		return await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == norm);
	}

	/// <summary>Update and persist the given user entity.
	/// The method calls SaveChanges asynchronously.
	/// </summary>
	public async Task UpdateAsync(User user)
	{
		_db.Users.Update(user);
		await _db.SaveChangesAsync();
	}

	/// <summary>Delete user record. In codebase we prefer soft-delete via UpdateAsync, but
	/// this method performs a hard delete if required by caller.
	/// </summary>
	public async Task DeleteAsync(Guid id)
	{
		var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id);
		if (user != null)
		{
			_db.Users.Remove(user);
			await _db.SaveChangesAsync();
		}
	}
}
