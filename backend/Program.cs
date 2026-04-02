using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Infrastructure.Email;
using backend.Infrastructure.Http;
using backend.Infrastructure.Repositories;
using backend.Infrastructure.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;

Console.WriteLine("╔══════════════════════════════════════════════╗");
Console.WriteLine("║   DIG — Dataset Insight Generator Backend   ║");
Console.WriteLine("║   ASP.NET Core 8  ·  Port 5150              ║");
Console.WriteLine("╚══════════════════════════════════════════════╝");
Console.WriteLine($"[DIG] Environment : {Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production"}");
Console.WriteLine($"[DIG] Process PID : {Environment.ProcessId}");

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://localhost:5150");
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "Bearer",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "Paste your Supabase access_token here"
    });

    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// ── Supabase config ───────────────────────────────────────────────────────────
var supabaseUrl = builder.Configuration["Supabase:Url"];
var supabaseSecret = builder.Configuration["Supabase:SecretKey"];

if (string.IsNullOrWhiteSpace(supabaseUrl))
    throw new InvalidOperationException("Missing configuration: Supabase:Url");

if (string.IsNullOrWhiteSpace(supabaseSecret))
    throw new InvalidOperationException("Missing configuration: Supabase:SecretKey");

var keyFormat =
    supabaseSecret.StartsWith("sb_secret_") ? "sb_secret (new format)" :
    supabaseSecret.StartsWith("eyJ") ? "JWT (legacy format)" :
    "unknown format";

Console.WriteLine($"[Supabase] URL       : {supabaseUrl}");
Console.WriteLine($"[Supabase] Key format: {keyFormat}");
// Do NOT log the key or even a prefix of it.

builder.Services.AddSingleton(provider =>
{
    Console.WriteLine("[Supabase] Initializing client...");

    try
    {
        var client = new Supabase.Client(
            supabaseUrl,
            supabaseSecret,
            new Supabase.SupabaseOptions
            {
                AutoRefreshToken = false,
                AutoConnectRealtime = false
            }
        );

        client.InitializeAsync().GetAwaiter().GetResult();

        Console.WriteLine("[Supabase] ✓ Client initialized successfully");
        return client;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Supabase] ✗ Init failed: {ex.Message}");
        throw;
    }
});

// ── Repositories & services ──────────────────────────────────────────────────
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IDatasetRepository, DatasetRepository>();
builder.Services.AddScoped<IStorageService, SupabaseStorageService>();
builder.Services.AddScoped<IEmailService, SmtpEmailService>();
builder.Services.AddScoped<IUserProfileService, UserProfileService>();
builder.Services.AddHttpClient<IPythonAiClient, PythonAiClient>();
builder.Services.AddScoped<AnalysisService>();
builder.Services.AddScoped<IAiService, AiService>();

// ── JWT / Supabase JWKS ──────────────────────────────────────────────────────
var supabaseIssuer = $"{supabaseUrl.TrimEnd('/')}/auth/v1";
var jwksUri = $"{supabaseIssuer}/.well-known/jwks.json";

Console.WriteLine($"[DIG] JWT issuer : {supabaseIssuer}");
Console.WriteLine($"[DIG] JWKS URI   : {jwksUri}");

JsonWebKeySet? cachedJwks = null;
DateTime jwksFetchedAt = DateTime.MinValue;

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = supabaseIssuer,
            ValidAudience = "authenticated",

            IssuerSigningKeyResolver = (token, securityToken, kid, parameters) =>
            {
                if (cachedJwks == null || (DateTime.UtcNow - jwksFetchedAt).TotalMinutes > 60)
                {
                    try
                    {
                        using var http = new HttpClient();
                        http.Timeout = TimeSpan.FromSeconds(10);

                        var json = http.GetStringAsync(jwksUri).GetAwaiter().GetResult();
                        cachedJwks = new JsonWebKeySet(json);
                        jwksFetchedAt = DateTime.UtcNow;

                        Console.WriteLine("[JWT] JWKS refreshed successfully");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[JWT] JWKS fetch failed: {ex.Message}");
                        return cachedJwks?.GetSigningKeys() ?? Enumerable.Empty<SecurityKey>();
                    }
                }

                return cachedJwks?.GetSigningKeys() ?? Enumerable.Empty<SecurityKey>();
            }
        };

        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = ctx =>
            {
                if (ctx.Exception is SecurityTokenMalformedException)
                {
                    Console.WriteLine("[JWT] Auth failed: malformed token");
                }
                else
                {
                    Console.WriteLine($"[JWT] Auth failed: {ctx.Exception.GetType().Name}: {ctx.Exception.Message[..Math.Min(ctx.Exception.Message.Length, 150)]}");
                }

                return Task.CompletedTask;
            },
            OnTokenValidated = ctx =>
            {
                Console.WriteLine("[JWT] Token validated successfully");
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddCors(options =>
{
    options.AddPolicy("dev", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddAuthorization();

var app = builder.Build();
Console.WriteLine("[DIG] App built. Starting middleware...");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

var storagePath = Path.Combine(Directory.GetCurrentDirectory(), "storage");
Directory.CreateDirectory(storagePath);

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(storagePath),
    RequestPath = "/storage"
});

app.UseRouting();
app.UseCors("dev");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok", db = "supabase" }));

Console.WriteLine("══════════════════════════════════════════════════");
Console.WriteLine("[DIG] ✓ Listening on  http://localhost:5150");
Console.WriteLine("[DIG] ✓ Swagger at    http://localhost:5150/swagger");
Console.WriteLine("[DIG] ✓ Health check  http://localhost:5150/health");
Console.WriteLine("══════════════════════════════════════════════════");

try
{
    app.Run();
}
catch (Exception ex)
{
    Console.WriteLine("[DIG] FATAL: " + ex.Message);
    Console.WriteLine(ex.StackTrace);
    throw;
}