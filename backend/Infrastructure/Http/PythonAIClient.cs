using System.Net.Http.Headers;
using backend.Application.DTOs.AI;
using backend.Application.Interfaces;

namespace backend.Infrastructure.Http;

public class PythonAiClient : IPythonAiClient
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;

    public PythonAiClient(HttpClient http, IConfiguration config)
    {
        _http = http;
        _config = config;
        
        var timeoutSeconds = _config.GetValue<int?>("AIService:TimeoutSeconds") ?? 30;
        _http.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
    }

    /// <summary>
    /// Sends a dataset reference or uploaded file to the python AI service
    /// and returns the raw JSON response from the service.
    /// </summary>
    /// <param name="request"></param>
    /// <returns>Contains DatasetID, UploadedFile, and SessionID for session-based tracking</returns>
    /// <exception cref="ArgumentException"></exception>
    /// <exception cref="InvalidOperationException"></exception>
    /// <exception cref="Exception"></exception>
    public async Task<string> CallPythonAiAsync(AnalyzeRequestDto request)
    {
        //Input validation for both dataset and the uploadedFile
        if (request.DatasetId == null && request.UploadedFile == null) throw new ArgumentException("Either Dataset or UploadedFile must be provided for use.");

        //Getting retries from appsettings.json
        var retries = _config.GetValue<int?>("AIService:RetryCount") ?? 3;
        //Gets baseUrl from our appsettings.json configuration and checks for validity
        var baseUrl = _config["AIService:BaseUrl"] ?? throw new InvalidOperationException("AIService BaseUrl is not configured");

        for (int attempts = 1; attempts <= retries; attempts++)
        {
            try
            {
                //Lets you send files and form fields together
                using var content = new MultipartFormDataContent();
                
                content.Add(new StringContent(request.SessionId.ToString()), "sessionId");
                
                //Attach uploaded file if provided
                if (request.UploadedFile != null)
                {
                    //Reads file stream, prepares MIME type for the python server, and attaches the file 
                    var streamContent = new StreamContent(request.UploadedFile.OpenReadStream());
                    streamContent.Headers.ContentType = new MediaTypeHeaderValue(request.UploadedFile.ContentType);
                    content.Add(streamContent, "file", request.UploadedFile.FileName);
                }
                
                //Attaches datasetId as a form field to content if provided
                if (request.DatasetId != null) content.Add(new StringContent(request.DatasetId.ToString() ?? string.Empty), "datasetId");

                //Sends the request to the Python AI service asynchronously
                var response = await _http.PostAsync($"{baseUrl}/analyze", content);
                
                //Checks if the python server responded with anything
                //and if it hasn't it throws HttpRequestException
                response.EnsureSuccessStatusCode();
                
                //Returns the raw AI JSON
                return await response.Content.ReadAsStringAsync();
            }
            catch (HttpRequestException ex) when (attempts < retries)
            {
                Console.WriteLine($"Attempt {attempts} failed: {ex.Message}. Retrying...");
                await Task.Delay(1000);
            }
        }
        //If no output has been returned and the Python
        //AI service was called too many times an error will be thrown.
        throw new HttpRequestException("Failed to call Python AI service after multiple attempts.");
    }
}