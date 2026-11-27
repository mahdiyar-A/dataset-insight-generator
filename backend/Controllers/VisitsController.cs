using backend.Application.Interfaces;
using backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Text.Json;

namespace backend.Controllers;

/// <summary>
/// "Page seen" notes from the site, for the owner's visit counts. No cookie is
/// read or set, and nothing about the visitor is stored: see VisitCounter.
///
/// The site sends the note with navigator.sendBeacon as plain text, which needs
/// no preflight, so the body is read as text and parsed here.
/// </summary>
[ApiController]
[Route("api/visits")]
[AllowAnonymous]
public class VisitsController : ControllerBase
{
    private static readonly string[] OwnHosts =
        { "datainsightgen.com", "datainsightgen.ca", "datainsightgen.online", "vercel.app" };

    private readonly VisitCounter _counter;
    private readonly IVisitRepository _visits;
    private readonly ILogger<VisitsController> _logger;

    public VisitsController(VisitCounter counter, IVisitRepository visits, ILogger<VisitsController> logger)
    {
        _counter = counter;
        _visits  = visits;
        _logger  = logger;
    }

    [HttpPost]
    [EnableRateLimiting("visit")]
    public async Task<IActionResult> Seen()
    {
        // Do Not Track and Global Privacy Control are honoured: not counted.
        if (Request.Headers["DNT"] == "1" || Request.Headers["Sec-GPC"] == "1")
            return NoContent();

        var userAgent = Request.Headers.UserAgent.ToString();
        if (VisitCounter.IsBot(userAgent)) return NoContent();

        string? rawPath = null, referrer = null;
        try
        {
            using var reader = new StreamReader(Request.Body);
            var text = await reader.ReadToEndAsync();
            if (text.Length > 2000) return NoContent();
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.TryGetProperty("p", out var p) && p.ValueKind == JsonValueKind.String)
                rawPath = p.GetString();
            if (doc.RootElement.TryGetProperty("r", out var r) && r.ValueKind == JsonValueKind.String)
                referrer = r.GetString();
        }
        catch (JsonException) { return NoContent(); }

        var path = VisitCounter.PagePath(rawPath);
        if (path == null) return NoContent();

        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
        var (day, newToPage, newToSite) = _counter.Note(ip, userAgent, path);
        try
        {
            await _visits.RecordAsync(day, path, VisitCounter.Source(referrer, OwnHosts), newToPage, newToSite);
        }
        catch (Exception ex)   // a count is never worth an error on someone's page
        {
            _logger.LogWarning("[Visits] Not recorded ({Type}: {Msg})", ex.GetType().Name, ex.Message);
        }
        return NoContent();
    }
}
