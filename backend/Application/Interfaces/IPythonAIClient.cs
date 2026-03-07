using backend.Application.DTOs.AI;

namespace backend.Application.Interfaces;

public interface IPythonAiClient
{
    Task<string> CallPythonAiAsync(AnalyzeRequestDto request);
    Task<string> CheckQualityAsync(byte[] csvBytes, string fileName, Guid sessionId);
}