using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Infrastructure.Repositories;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using System.Text;

Console.WriteLine("[DIG] Starting...");

var builder = WebApplication.CreateBuilder(args);

// Force URL binding
builder.WebHost.UseUrls("http://localhost:5150");

// Logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// Controllers
builder.Services.AddControllers();

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// DI (your auth)
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<JwtTokenService>();

// JWT Auth
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var secret = builder.Configuration["Jwt:Secret"] ?? "dig4qihrgiqrhgiqrhguhq4otnrhqoqqcq769g8yg979870i9j";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "dig",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "dig",
            IssuerSigningKey = key
        };
    });

builder.Services.AddCors(options =>
{
    options.AddPolicy("dev", p =>
        p.WithOrigins("http://localhost:3000")
         .AllowAnyHeader()
         .AllowAnyMethod());
});

builder.Services.AddAuthorization();

var app = builder.Build();

Console.WriteLine("[DIG] App built. Starting middleware...");

// Swagger UI
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Static files for storage
var storagePath = Path.Combine(Directory.GetCurrentDirectory(), "storage");
if (!Directory.Exists(storagePath)) Directory.CreateDirectory(storagePath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(storagePath),
    RequestPath = "/storage"
});

// ↓ THIS was missing in your original — routing must come before auth
app.UseRouting();

app.UseCors("dev");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

Console.WriteLine("[DIG] Listening on http://localhost:5150");
Console.WriteLine("[DIG] Swagger at  http://localhost:5150/swagger");

try
{
    app.Run();
}
catch (Exception ex)
{
    Console.WriteLine("[DIG] FATAL: " + ex.Message);
    Console.WriteLine(ex.StackTrace);
    Console.ReadKey();
}