using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Infrastructure.Email;
using backend.Infrastructure.Http;
using backend.Infrastructure.Repositories;
using backend.Infrastructure.Storage;
using backend.Middleware;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;

// ── Startup banner ─────────────────────────────────────────────────────────────
Console.WriteLine("╔══════════════════════════════════════════════╗");
Console.WriteLine("║   DIG — Dataset Insight Generator Backend   ║");
Console.WriteLine("║   ASP.NET Core 8                            ║");
Console.WriteLine("╚══════════════════════════════════════════════╝");
Console.WriteLine($"[DIG] Environment : {Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production"}");
Console.WriteLine($"[DIG] Process PID : {Environment.ProcessId}");
Console.WriteLine($"[DIG] Port        : {Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "from launchSettings"}");

var builder = WebApplication.CreateBuilder(args);

// Port is NOT hardcoded here — controlled per environment:
//   Local (dotnet run / VS) → launchSettings.json → 5150
//   Docker                  → ASPNETCORE_URLS env var in docker-compose → 8080
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// ── Controllers + API explorer ────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// Swagger is configured to accept Bearer tokens so you can test auth-protected
// endpoints directly from the Swagger UI without needing a separate tool
builder.Services.AddSwaggerGen(c =>
{
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name        = "Authorization",
        Type        = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme      = "Bearer",
        In          = Microsoft.OpenApi.Models.ParameterLocation.Header,
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
                    Id   = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// ── Supabase client ───────────────────────────────────────────────────────────
// Supabase is used as both the auth provider (JWKS) and the database (PostgREST).
// The secret key is read from .env / environment variables — never hardcoded here.
var supabaseUrl    = builder.Configuration["Supabase:Url"];
var supabaseSecret = builder.Configuration["Supabase:SecretKey"];

if (string.IsNullOrWhiteSpace(supabaseUrl))
    throw new InvalidOperationException("Missing configuration: Supabase:Url");

if (string.IsNullOrWhiteSpace(supabaseSecret))
    throw new InvalidOperationException("Missing configuration: Supabase:SecretKey");

var keyFormat =
    supabaseSecret.StartsWith("sb_secret_") ? "sb_secret (new format)" :
    supabaseSecret.StartsWith("eyJ")         ? "JWT (legacy format)"   :
    "unknown format";

Console.WriteLine($"[Supabase] URL       : {supabaseUrl}");
Console.WriteLine($"[Supabase] Key format: {keyFormat}");
// Do NOT log the key or even a prefix of it

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
                AutoRefreshToken    = false,
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

// ── Repositories & services ───────────────────────────────────────────────────
// Each service is registered with its interface so controllers only depend on
// the abstraction, not the concrete implementation (easier to swap or test)
builder.Services.AddScoped<IUserRepository,      UserRepository>();
builder.Services.AddScoped<IDatasetRepository,   DatasetRepository>();
builder.Services.AddScoped<IStorageService,      SupabaseStorageService>();
builder.Services.AddScoped<IEmailService,        SmtpEmailService>();
builder.Services.AddScoped<IUserProfileService,  UserProfileService>();
builder.Services.AddHttpClient<IPythonAiClient,  PythonAiClient>();
builder.Services.AddScoped<AnalysisService>();
builder.Services.AddScoped<IAiService,           AiService>();

// ── JWT auth via Supabase JWKS ────────────────────────────────────────────────
// Supabase issues JWTs signed with RS256. We fetch their public keys from the
// JWKS endpoint and cache them locally for 60 minutes, refreshing automatically.
// The cache is protected by a SemaphoreSlim so concurrent requests don't all
// race to fetch JWKS at the same time when the cache expires.
var supabaseIssuer = $"{supabaseUrl.TrimEnd('/')}/auth/v1";
var jwksUri        = $"{supabaseIssuer}/.well-known/jwks.json";

Console.WriteLine($"[DIG] JWT issuer : {supabaseIssuer}");
Console.WriteLine($"[DIG] JWKS URI   : {jwksUri}");

// Thread-safe JWKS cache — shared across all requests
static readonly SemaphoreSlim _jwksSem    = new(1, 1);
static JsonWebKeySet?         _cachedJwks = null;
static DateTime               _jwksFetchedAt = DateTime.MinValue;

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Only allow tokens over plain HTTP in Development.
        // In Production (Docker / AWS) all traffic should go through HTTPS.
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = supabaseIssuer,
            ValidAudience            = "authenticated",

            // IssuerSigningKeyResolver is called on every token validation.
            // We cache the JWKS for 60 minutes and use a semaphore to ensure
            // only ONE thread fetches from Supabase at a time (double-checked lock).
            IssuerSigningKeyResolver = (token, securityToken, kid, parameters) =>
            {
                // Fast path — cache is fresh, no lock needed
                if (_cachedJwks != null && (DateTime.UtcNow - _jwksFetchedAt).TotalMinutes < 60)
                    return _cachedJwks.GetSigningKeys();

                // Slow path — need to refresh, take the semaphore
                _jwksSem.Wait();
                try
                {
                    // Double-check after acquiring the lock — another thread may have
                    // already refreshed while we were waiting
                    if (_cachedJwks != null && (DateTime.UtcNow - _jwksFetchedAt).TotalMinutes < 60)
                        return _cachedJwks.GetSigningKeys();

                    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
                    var json       = http.GetStringAsync(jwksUri).GetAwaiter().GetResult();
                    _cachedJwks    = new JsonWebKeySet(json);
                    _jwksFetchedAt = DateTime.UtcNow;
                    Console.WriteLine("[JWT] JWKS refreshed successfully");
                    return _cachedJwks.GetSigningKeys();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[JWT] JWKS fetch failed: {ex.Message}");
                    // If we have a stale cache, use it as fallback rather than
                    // rejecting all tokens during a Supabase outage
                    return _cachedJwks?.GetSigningKeys() ?? Enumerable.Empty<SecurityKey>();
                }
                finally
                {
                    _jwksSem.Release();
                }
            }
        };

        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = ctx =>
            {
                // Log auth failures server-side but never send exception details to clients
                if (ctx.Exception is SecurityTokenMalformedException)
                    Console.WriteLine("[JWT] Auth failed: malformed token");
                else
                    Console.WriteLine($"[JWT] Auth failed: {ctx.Exception.GetType().Name}: " +
                        ctx.Exception.Message[..Math.Min(ctx.Exception.Message.Length, 150)]);

                return Task.CompletedTask;
            },
            OnTokenValidated = ctx =>
            {
                Console.WriteLine("[JWT] Token validated successfully");
                return Task.CompletedTask;
            }
        };
    });

// ── CORS ──────────────────────────────────────────────────────────────────────
// Origins are read from ALLOWED_ORIGINS env var (comma-separated).
// Keep everything on ONE line in .env — multi-line values are not parsed correctly
// by most dotenv implementations and silently drop the extra domains.
var allowedOrigins = (Environment.GetEnvironmentVariable("ALLOWED_ORIGINS")
    ?? "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

Console.WriteLine($"[DIG] CORS origins : {string.Join(" | ", allowedOrigins)}");

builder.Services.AddCors(options =>
{
    options.AddPolicy("dig-cors", policy =>
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()
    );
});

builder.Services.AddAuthorization();

// ── Build the app ─────────────────────────────────────────────────────────────
var app = builder.Build();
Console.WriteLine("[DIG] App built. Starting middleware pipeline...");

// Global exception handler — must be first so it catches errors from all other middleware
app.UseMiddleware<ExceptionMiddleware>();

// Swagger only in Development — never expose API docs publicly in production
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Serve files from the local /storage folder.
// NOTE: this folder is only used as a fallback in Development.
// In Production all files go to Supabase Storage and are served via signed URLs.
// If you're deploying and this folder is empty you can safely remove this block.
var storagePath = Path.Combine(Directory.GetCurrentDirectory(), "storage");
Directory.CreateDirectory(storagePath);

if (app.Environment.IsDevelopment())
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(storagePath),
        RequestPath  = "/storage"
    });
}

// Middleware order matters in ASP.NET Core:
// Routing → CORS → Auth → Authorization → Controllers
app.UseRouting();
app.UseCors("dig-cors");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Simple health check — used by Docker and load balancers to confirm the backend is alive
app.MapGet("/health", () => Results.Ok(new { status = "ok", db = "supabase" }));

var urls       = Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://localhost:5150";
var displayUrl = urls.Replace("0.0.0.0", "localhost");
Console.WriteLine("══════════════════════════════════════════════════");
Console.WriteLine($"[DIG] ✓ Listening on  {displayUrl}");
Console.WriteLine($"[DIG] ✓ Swagger at    {displayUrl}/swagger");
Console.WriteLine($"[DIG] ✓ Health check  {displayUrl}/health");
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
