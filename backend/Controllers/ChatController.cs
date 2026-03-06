using backend.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Text.Json.Serialization;

namespace backend.Controllers;

/// <summary>
/// Chat endpoint that bridges frontend Yes/No interaction with the AI analysis pipeline.
///
/// Conditions returned to frontend:
///   "not_clean"     → dataset has quality issues, ask user to clean
///   "low_accuracy"  → dataset may produce low-accuracy insights
///   "not_workable"  → dataset cannot be processed at all
///   "all_good"      → dataset is clean and ready
///
/// Message flow:
///   frontend → POST { message: "start_analysis" }  → backend scans dataset → returns condition
///   frontend → POST { message: "yes" | "no" }       → backend continues or skips step
///   backend  → { reply, condition, done, failed, requiresResponse }
/// </summary>
[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly IDatasetRepository _datasets;

    // In production: inject IChatSessionRepository to persist history
    // For now: stateless — each "start_analysis" re-evaluates the dataset

    public ChatController(IDatasetRepository datasets)
    {
        _datasets = datasets;
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                 ?? User.FindFirstValue("sub");
        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var id))
            throw new UnauthorizedAccessException("Missing user id claim");
        return id;
    }

    // ── GET /api/chat/history ─────────────────────────────────────────────
    // Returns empty for now (stateless); wire to DB when chat persistence is added
    [HttpGet("history")]
    public IActionResult GetHistory()
    {
        // TODO: return persisted chat messages from DB
        return Ok(Array.Empty<object>());
    }

    // ── POST /api/chat/message ────────────────────────────────────────────
    [HttpPost("message")]
    public async Task<IActionResult> SendMessage([FromBody] ChatMessageRequest req)
    {
        if (string.IsNullOrEmpty(req.Message))
            return BadRequest(new { error = "EMPTY_MESSAGE" });

        var userId  = GetUserId();
        var dataset = await _datasets.GetByUserIdAsync(userId);

        if (dataset == null)
            return Ok(new ChatMessageResponse
            {
                Reply             = "No dataset found. Please upload a CSV first.",
                Condition         = null,
                RequiresResponse  = false,
                Done              = false,
                Failed            = true,
            });

        var message = req.Message.Trim().ToLowerInvariant();

        // ── start_analysis: evaluate dataset quality ──────────────────────
        if (message == "start_analysis")
        {
            // TODO: replace stub with real AI quality check
            // For now: derive condition from dataset metadata as a placeholder
            var condition = EvaluateDatasetCondition(dataset);

            return Ok(condition switch
            {
                "not_workable" => new ChatMessageResponse
                {
                    Reply            = "Your dataset cannot be processed. It may be too sparse, use an unsupported structure, or contain no usable columns. Please upload a different file.",
                    Condition        = "not_workable",
                    RequiresResponse = false,
                    Done             = false,
                    Failed           = true,
                },
                "not_clean" => new ChatMessageResponse
                {
                    Reply            = "Your dataset has quality issues — missing values, duplicates, or formatting inconsistencies were detected. Would you like me to clean it automatically before generating your report?",
                    Condition        = "not_clean",
                    RequiresResponse = true,
                    Done             = false,
                    Failed           = false,
                },
                "low_accuracy" => new ChatMessageResponse
                {
                    Reply            = "Your dataset may produce lower-accuracy insights due to limited data points or high variance across columns. Would you like to proceed anyway and generate the report?",
                    Condition        = "low_accuracy",
                    RequiresResponse = true,
                    Done             = false,
                    Failed           = false,
                },
                _ => new ChatMessageResponse // "all_good"
                {
                    Reply            = "Your dataset looks great — no significant issues found. Starting full analysis now. Your report will be ready shortly.",
                    Condition        = "all_good",
                    RequiresResponse = false,
                    Done             = false,
                    Failed           = false,
                },
            });
        }

        // ── yes: user approved the current step, continue ─────────────────
        if (message == "yes")
        {
            // Mark as processing — AI pipeline picks it up from here
            await _datasets.UpdateStatusAsync(userId, "processing");

            return Ok(new ChatMessageResponse
            {
                Reply            = "Got it. Running the full analysis pipeline now. This may take a minute — your report and cleaned dataset will appear when done.",
                Condition        = null,
                RequiresResponse = false,
                Done             = false,
                Failed           = false,
            });
        }

        // ── no: user declined a step ──────────────────────────────────────
        if (message == "no")
        {
            // Still run analysis, just without that step
            await _datasets.UpdateStatusAsync(userId, "processing");

            return Ok(new ChatMessageResponse
            {
                Reply            = "Understood — skipping that step and continuing with the rest of the analysis.",
                Condition        = null,
                RequiresResponse = false,
                Done             = false,
                Failed           = false,
            });
        }

        // ── unknown message ───────────────────────────────────────────────
        return Ok(new ChatMessageResponse
        {
            Reply            = "I didn't understand that. Please use 'Start Analysis' or reply Yes/No to a prompt.",
            Condition        = null,
            RequiresResponse = false,
            Done             = false,
            Failed           = false,
        });
    }

    // ── Stub quality evaluation — replace with real AI call ──────────────
    // In production: call Python AI service to scan the CSV and return a condition
    private static string EvaluateDatasetCondition(Domain.Entities.Dataset dataset)
    {
        // If row count is very low → not workable
        if (dataset.RowCount.HasValue && dataset.RowCount.Value < 5)
            return "not_workable";

        // If column count is very low → low accuracy
        if (dataset.ColumnCount.HasValue && dataset.ColumnCount.Value < 2)
            return "low_accuracy";

        // If row count is low but not critically so → low accuracy
        if (dataset.RowCount.HasValue && dataset.RowCount.Value < 30)
            return "low_accuracy";

        // Otherwise → assume not_clean (most real datasets have issues)
        // Real AI will return the actual condition
        return "not_clean";
    }
}

public class ChatMessageRequest
{
    [JsonPropertyName("message")]
    public string Message { get; set; } = "";
}

public class ChatMessageResponse
{
    [JsonPropertyName("reply")]             public string  Reply            { get; set; } = "";
    [JsonPropertyName("condition")]         public string? Condition        { get; set; }
    [JsonPropertyName("requiresResponse")]  public bool    RequiresResponse { get; set; }
    [JsonPropertyName("done")]              public bool    Done             { get; set; }
    [JsonPropertyName("failed")]            public bool    Failed           { get; set; }
}