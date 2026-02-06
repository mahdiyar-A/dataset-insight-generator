namespace backend.Application.DTOs.AI;

public class AnalyzeRequestDto
{
    public Guid SessionId { get; set; }
    public Guid? DatasetId { get; set; }
    public IFormFile? UploadedFile { get; set; }
}