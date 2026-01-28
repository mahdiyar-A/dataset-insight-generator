namespace backend.Domain.Entities;

public class Project
{
    public Guid Id { get; private set; }

    // Ownership (User who owns this project)
    public Guid OwnerId { get; private set; }

    // Public info
    public string Name { get; private set; } = null!;
    public string? Description { get; private set; }

    // State
    public bool IsArchived { get; private set; } = false;
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; private set; }

    private Project() { } // EF Core

    public Project(Guid ownerId, string name, string? description = null)
    {
        Id = Guid.NewGuid();
        OwnerId = ownerId;
        Name = name;
        Description = description;
    }

    public void Rename(string newName)
    {
        if (string.IsNullOrWhiteSpace(newName))
            throw new ArgumentException("Project name cannot be empty.", nameof(newName));

        Name = newName.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateDescription(string? description)
    {
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void Archive()
    {
        IsArchived = true;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Restore()
    {
        IsArchived = false;
        UpdatedAt = DateTime.UtcNow;
    }
}
