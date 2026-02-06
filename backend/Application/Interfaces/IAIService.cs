using backend.Application.DTOs.AI;

namespace backend.Application.Interfaces;

public interface IAiService
{
    Task<AnalyzeResponseDto> AnalyzeAsync(AnalyzeRequestDto request);
}