using System.Text.Json;
using backend.Application.Interfaces;
using backend.Domain.Entities;

namespace backend.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
    private readonly string _filePath;
    private readonly SemaphoreSlim _lock = new(1, 1);

    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true
    };

    public UserRepository(IWebHostEnvironment env)
    {
        var directory = Path.Combine(env.ContentRootPath, "App_Data");
        Directory.CreateDirectory(directory);

        _filePath = Path.Combine(directory, "users.json");
    }

    public async Task<User?> GetByEmailAsync(string email)
    {
        var users = await ReadAllAsync();
        return users.FirstOrDefault(u =>
            u.Email.Trim().ToLower() == email.Trim().ToLower());
    }

    public async Task<User?> GetByIdAsync(Guid id)
    {
        var users = await ReadAllAsync();
        return users.FirstOrDefault(u => u.Id == id);
    }

    public async Task AddAsync(User user)
    {
        await _lock.WaitAsync();
        try
        {
            var users = await ReadAllUnsafeAsync();

            if (users.Any(u =>
                u.Email.Trim().ToLower() == user.Email.Trim().ToLower()))
                throw new InvalidOperationException("EMAIL_EXISTS");

            users.Add(user);
            await WriteAllUnsafeAsync(users);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task UpdateAsync(User user)
    {
        await _lock.WaitAsync();
        try
        {
            var users = await ReadAllUnsafeAsync();

            var index = users.FindIndex(u => u.Id == user.Id);
            if (index >= 0)
            {
                users[index] = user;
                await WriteAllUnsafeAsync(users);
            }
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<List<User>> ReadAllAsync()
    {
        await _lock.WaitAsync();
        try
        {
            return await ReadAllUnsafeAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<List<User>> ReadAllUnsafeAsync()
    {
        if (!File.Exists(_filePath))
            return new List<User>();

        var json = await File.ReadAllTextAsync(_filePath);

        if (string.IsNullOrWhiteSpace(json))
            return new List<User>();

        return JsonSerializer.Deserialize<List<User>>(json, Options)
               ?? new List<User>();
    }

    private Task WriteAllUnsafeAsync(List<User> users)
    {
        var json = JsonSerializer.Serialize(users, Options);
        return File.WriteAllTextAsync(_filePath, json);
    }
}