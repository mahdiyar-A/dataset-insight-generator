using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace backend.Application.Interfaces;

/// <summary>
/// Abstract file storage operations used by higher-level services.
/// Implementations may store files locally, in cloud blob storage, etc.
/// The service returns a relative path or URL that can be stored on the user entity.
/// </summary>
public interface IStorageService
{
    /// <summary>
    /// Save a profile picture for the given user and return a web-accessible path.
    /// The implementation should validate file type and size.
    /// </summary>
    Task<string> SaveProfilePictureAsync(Guid userId, IFormFile file);
}
