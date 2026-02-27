using backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace backend.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;
    private readonly JwtTokenService _jwt;

    public AuthController(AuthService auth, JwtTokenService jwt)
    {
        _auth = auth;
        _jwt = jwt;
    }

    public record RegisterDto(string FirstName, string LastName, string Email, string Password);
    public record LoginDto(string Email, string Password);

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        var (user, code, message) = await _auth.RegisterAsync(
            dto.FirstName, dto.LastName, dto.Email, dto.Password);

        if (user == null)
        {
            if (code == "EMAIL_EXISTS")
                return Conflict(new { code, message });

            return BadRequest(new { code, message });
        }

        return Ok(new
        {
            user = new { id = user.Id, email = user.Email, userName = user.UserName }
        });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        var (user, code, message) = await _auth.LoginAsync(dto.Email, dto.Password);

        if (user == null)
            return Unauthorized(new { code, message });

        var token = _jwt.Create(user);

        return Ok(new
        {
            token,
            user = new { id = user.Id, email = user.Email, userName = user.UserName }
        });
    }

    // Checkpoint B: verify token works
    // Frontend calls this after login using: Authorization: Bearer <token>
    [Authorize]
    [HttpGet("me")]
    public IActionResult Me()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var email = User.FindFirstValue(ClaimTypes.Email);
        var username = User.FindFirstValue("username");

        return Ok(new { userId, email, username });
    }
}