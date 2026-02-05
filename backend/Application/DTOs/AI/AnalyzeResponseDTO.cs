namespace backend.Application.DTOs.AI;

public class AnalyzeResponseDto
{
    public Guid SessionId { get; set; }
    public string RawJson { get; set; } = string.Empty;
}