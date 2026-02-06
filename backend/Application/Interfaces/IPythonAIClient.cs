using backend.Application.DTOs.AI;

namespace backend.Application.Interfaces;

public interface IPythonAiClient
{
    public Task<string> CallPythonAiAsync(AnalyzeRequestDto request);
}