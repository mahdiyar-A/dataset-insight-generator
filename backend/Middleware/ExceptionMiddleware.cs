using System.Net;
using System.Text.Json;

namespace backend.Middleware;

/// <summary>
/// Global exception handler — catches anything that slips past controller try/catch blocks.
/// Without this, unhandled exceptions return a raw 500 that may expose stack traces
/// (especially in Development mode where ASP.NET includes the full exception detail).
///
/// Registered in Program.cs as the very first middleware so it wraps everything.
/// </summary>
public class ExceptionMiddleware
{
    private readonly RequestDelegate              _next;
    private readonly ILogger<ExceptionMiddleware> _logger;
    private readonly IHostEnvironment             _env;

    public ExceptionMiddleware(RequestDelegate next,
                               ILogger<ExceptionMiddleware> logger,
                               IHostEnvironment env)
    {
        _next   = next;
        _logger = logger;
        _env    = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            // Pass through to the next piece of middleware / controller
            await _next(context);
        }
        catch (Exception ex)
        {
            // Log the full exception server-side so you can diagnose it
            _logger.LogError(ex, "[Exception] Unhandled error on {Method} {Path}",
                context.Request.Method, context.Request.Path);

            // Write a clean JSON error response — never expose stack traces to clients
            context.Response.StatusCode  = (int)HttpStatusCode.InternalServerError;
            context.Response.ContentType = "application/json";

            // In Development include the message to help debugging;
            // in Production always return a generic message
            var message = _env.IsDevelopment()
                ? $"Unhandled exception: {ex.Message}"
                : "An unexpected error occurred. Please try again.";

            var body = JsonSerializer.Serialize(new { error = message });
            await context.Response.WriteAsync(body);
        }
    }
}
