using backend.Application.DTOs.AI;
using backend.Application.Interfaces;

namespace backend.Application.Services;

public class AiService : IAiService
{
    private readonly IPythonAiClient _pythonAiClient;

    public AiService(IPythonAiClient pythonAiClient)
    {
        _pythonAiClient = pythonAiClient;
    }
    
    public async Task<AnalyzeResponseDto> AnalyzeAsync(AnalyzeRequestDto request)
    {
        //Validation of inputs.
        if (request.DatasetId == null && request.UploadedFile == null) throw new ArgumentException("DatasetId or UploadedFile must be provided.");
        if (request.SessionId == Guid.Empty) throw new ArgumentException("SessionId is required.");
        
        try
        {
            //Getting raw unfiltered JSON file from the python client
            var rawJson = await _pythonAiClient.CallPythonAiAsync(request);

            //returns an AnalyzeResponseDto for easy processing.
            return new AnalyzeResponseDto
            {
                SessionId = request.SessionId,
                RawJson = rawJson,
            };
        }
        catch (HttpRequestException)
        {
            throw new ApplicationException("AI service is unavailable. Please try again later.");
        }
        catch (TaskCanceledException)
        {
            throw new TimeoutException("AI request timed out.");
        }
    }
}
