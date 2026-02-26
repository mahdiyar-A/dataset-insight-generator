namespace backend.Application.DTOs.User;

/// <summary>
/// Response returned after a successful profile picture upload.
/// The API stores files on disk and returns the relative path the client
/// can use to retrieve/display the uploaded image.
/// </summary>
public class UploadProfilePictureResponseDto
{
    /// <summary>Relative web path to the saved profile picture (e.g. "/storage/...").</summary>
    public string ProfilePicturePath { get; set; } = default!;
}
