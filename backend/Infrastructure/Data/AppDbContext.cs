using Microsoft.EntityFrameworkCore;
using backend.Domain.Entities;

namespace backend.Infrastructure.Data;

/// <summary>
/// Minimal EF Core DbContext used by repository implementations.
/// In a real application this class would be extended with configurations
/// and migrations. Here it provides a <see cref="DbSet{User}"/> for users.
/// </summary>
public class AppDbContext : DbContext
{
    /// <summary>Constructor used by DI; options are configured in Program.cs.</summary>
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    /// <summary>EF Core set representing users table.</summary>
    public DbSet<User> Users { get; set; } = null!;
}
