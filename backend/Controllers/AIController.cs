using backend.Application.DTOs.AI;
using backend.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

/// <summary>
/// Direct AI analysis endpoint — primarily used by Swagger for manual testing.
/// The real analysis flow goes through ChatController → AnalysisService.
/// [Authorize] is required so unauthenticated callers cannot burn API credits.
/// </summary>
[ApiController]
[Route("api/ai")]
[Authorize]
public class AiController : ControllerBase
{
    private readonly IAiService             _aiService;
    private readonly ILogger<AiController>  _logger;

    public AiController(IAiService aiService, ILogger<AiController> logger)
    {
        _aiService = aiService;
        _logger    = logger;
    }

    // POST /api/ai/analyze
    // Accepts a multipart form with the CSV file + session flags,
    // forwards to the Python pipeline, and returns the full result.
    [HttpPost("analyze")]
    public async Task<ActionResult<AnalyzeResponseDto>> Analyze([FromForm] AnalyzeRequestDto request)
    {
        try
        {
            var response = await _aiService.AnalyzeAsync(request);
            return Ok(response);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "[AI] Invalid argument");
            return BadRequest(new { error = "Invalid request — check your dataset and try again." });
        }
        catch (TimeoutException ex)
        {
            _logger.LogWarning(ex, "[AI] Pipeline timed out");
            return StatusCode(StatusCodes.Status408RequestTimeout,
                new { error = "Analysis timed out. Try again with a smaller dataset." });
        }
        catch (ApplicationException ex)
        {
            _logger.LogError(ex, "[AI] Service unavailable");
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { error = "AI service is unavailable. Please try again later." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[AI] Unexpected error");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { error = "An unexpected error occurred." });
        }
    }
}
