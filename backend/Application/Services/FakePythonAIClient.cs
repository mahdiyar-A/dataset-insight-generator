using backend.Application.DTOs.AI;
using backend.Application.Interfaces;

namespace backend.Application.Services;

public class FakePythonAiClient : IPythonAiClient
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;

    public FakePythonAiClient(HttpClient http, IConfiguration config) { _http = http; _config = config; }

    public Task<string> CallPythonAiAsync(AnalyzeRequestDto request)
    {
        // Return a simple fake JSON payload
        return Task.FromResult("{\"Analysis\": \"Fake analysis stuff yuh\"}");
    }
}