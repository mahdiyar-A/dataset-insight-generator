using backend.Application.DTOs.AI;
using backend.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/ai")]
public class AiController : ControllerBase
{
    
    private readonly IAiService _aiService;
    private readonly ILogger<AiController> _logger;
    
    public AiController(IAiService aiService, ILogger<AiController> logger)
    {
        _aiService = aiService;
        _logger = logger;
    }

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
            return BadRequest(new { error = ex.Message });
        }
        catch (TimeoutException ex)
        {
            return StatusCode(StatusCodes.Status408RequestTimeout, new { error = ex.Message});
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogError(ex, "AI service is unavailable.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "AI service is unavailable. Please try again later."});
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error occured");
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "An unexpected error occured."});
        }
    }
}