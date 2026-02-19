using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using backend.Application.Interfaces;

namespace backend.Infrastructure.Storage;

/// <summary>
/// Simple local filesystem storage implementation.
/// - Stores files under {project-root}/storage/users/{userId}/profile/
/// - Performs basic validation on extension and size
/// - Returns a relative web path (e.g. /storage/users/{userId}/profile/profile.jpg)
///
/// Note: This implementation is suitable for local development and testing.
/// For production consider using cloud storage (S3, Azure Blob) and a CDN.
/// </summary>
public class LocalFileStorage : IStorageService
{
	private readonly string _root;

	/// <summary>
	/// Initialize storage root. Directory is created if missing.
	/// </summary>
	public LocalFileStorage()
	{
		// store under a folder named "storage" in project root
		_root = Path.Combine(Directory.GetCurrentDirectory(), "storage");
		Directory.CreateDirectory(_root);
	}

	/// <summary>
	/// Save a profile picture to disk. Validates extension and max size.
	/// Returns a relative path that can be stored in the User entity.
	/// Throws InvalidOperationException for validation failures.
	/// </summary>
	public async Task<string> SaveProfilePictureAsync(Guid userId, IFormFile file)
	{
		if (file == null) throw new ArgumentNullException(nameof(file));

		// Allowed extensions for profile pictures
		var allowed = new[] { ".jpg", ".jpeg", ".png", ".webp" };

		// Normalize extension and validate
		var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
		if (!allowed.Contains(ext)) throw new InvalidOperationException("Invalid file type");

		// Enforce a maximum file size (here: 2 MB)
		const long maxBytes = 2 * 1024 * 1024; // 2 MB
		if (file.Length > maxBytes) throw new InvalidOperationException("File too large");

		// Build folder path and ensure it exists
		var folder = Path.Combine(_root, "users", userId.ToString(), "profile");
		Directory.CreateDirectory(folder);

		// Use a deterministic filename so uploads replace the previous image
		var filename = "profile" + ext;
		var path = Path.Combine(folder, filename);

		// Save file to disk
		using (var stream = System.IO.File.Create(path))
		{
			await file.CopyToAsync(stream);
		}

		// Return the relative web path; the app should serve the "storage" folder under /storage
		var rel = $"/storage/users/{userId}/profile/{filename}";
		return rel;
	}
}
