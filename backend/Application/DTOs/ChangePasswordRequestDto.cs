namespace backend.Application.DTOs.User;

public class ChangePasswordRequestDto
{
    public string CurrentPassword { get; set; } = "";
    public string NewPassword     { get; set; } = "";
}