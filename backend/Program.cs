using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Hubs;
using backend.Infrastructure.Email;
using backend.Infrastructure.Http;
using backend.Infrastructure.Repositories;
using backend.Infrastructure.Storage;
using backend.Infrastructure.Stripe;
using backend.Middleware;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;

// ── Startup banner ─────────────────────────────────────────────────────────────
Console.WriteLine("╔══════════════════════════════════════════════╗");
Console.WriteLine("║   DIG — Dataset Insight Generator Backend   ║");
Console.WriteLine("║   ASP.NET Core 8 · v2.0 (workspace-collab) ║");
Console.WriteLine("╚══════════════════════════════════════════════╝");
Console.WriteLine($"[DIG] Environment : {Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production"}");
Console.WriteLine($"[DIG] PID         : {Environment.ProcessId}");

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// ── Controllers + Swagger ─────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization", Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "Bearer", In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "Paste your Supabase access_token here"
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {{
        new Microsoft.OpenApi.Models.OpenApiSecurityScheme
        {
            Reference = new Microsoft.OpenApi.Models.OpenApiReference
            { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" }
        },
        Array.Empty<string>()
    }});
});

// ── SignalR — real-time collaboration ─────────────────────────────────────────
// The CollaborationHub uses this for cursor presence and annotation broadcasting.
builder.Services.AddSignalR(opts =>
{
    opts.EnableDetailedErrors = builder.Environment.IsDevelopment();
    opts.KeepAliveInterval    = TimeSpan.FromSeconds(15);
    opts.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
});

// ── Supabase ──────────────────────────────────────────────────────────────────
var supabaseUrl    = builder.Configuration["Supabase:Url"]
    ?? throw new InvalidOperationException("Missing Supabase:Url");
var supabaseSecret = builder.Configuration["Supabase:SecretKey"]
    ?? throw new InvalidOperationException("Missing Supabase:SecretKey");

Console.WriteLine($"[Supabase] URL: {supabaseUrl}");

builder.Services.AddSingleton(_ =>
{
    var client = new Supabase.Client(supabaseUrl, supabaseSecret,
        new Supabase.SupabaseOptions { AutoRefreshToken = false, AutoConnectRealtime = false });
    client.InitializeAsync().GetAwaiter().GetResult();
    Console.WriteLine("[Supabase] ✓ Initialized");
    return client;
});

// ── Repositories & services ───────────────────────────────────────────────────
builder.Services.AddScoped<IUserRepository,      UserRepository>();
builder.Services.AddScoped<IDatasetRepository,   DatasetRepository>();   // kept for backward compat
builder.Services.AddScoped<IAnalysisRepository,  AnalysisRepository>();  // new history-based
builder.Services.AddScoped<ITeamRepository,      TeamRepository>();
builder.Services.AddScoped<IWorkspaceRepository, WorkspaceRepository>();
builder.Services.AddScoped<IStorageService,      SupabaseStorageService>();
builder.Services.AddScoped<IEmailService,        SmtpEmailService>();
builder.Services.AddScoped<IUserProfileService,  UserProfileService>();
builder.Services.AddScoped<IStripeService,       StripeService>();
builder.Services.AddHttpClient<IPythonAiClient,  PythonAiClient>();
builder.Services.AddScoped<AnalysisService>();
builder.Services.AddScoped<IAiService,           AiService>();

// ── JWT via Supabase JWKS ─────────────────────────────────────────────────────
var supabaseIssuer = $"{supabaseUrl.TrimEnd('/')}/auth/v1";
var jwksUri        = $"{supabaseIssuer}/.well-known/jwks.json";
Console.WriteLine($"[JWT] Issuer: {supabaseIssuer}");

static readonly SemaphoreSlim _jwksSem    = new(1, 1);
static JsonWebKeySet?         _cachedJwks = null;
static DateTime               _jwksFetchedAt = DateTime.MinValue;

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,  ValidateAudience         = true,
            ValidateLifetime         = true,  ValidateIssuerSigningKey = true,
            ValidIssuer              = supabaseIssuer,
            ValidAudience            = "authenticated",
            IssuerSigningKeyResolver = (_, __, ___, ____) =>
            {
                if (_cachedJwks != null && (DateTime.UtcNow - _jwksFetchedAt).TotalMinutes < 60)
                    return _cachedJwks.GetSigningKeys();
                _jwksSem.Wait();
                try
                {
                    if (_cachedJwks != null && (DateTime.UtcNow - _jwksFetchedAt).TotalMinutes < 60)
                        return _cachedJwks.GetSigningKeys();
                    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
                    _cachedJwks    = new JsonWebKeySet(http.GetStringAsync(jwksUri).GetAwaiter().GetResult());
                    _jwksFetchedAt = DateTime.UtcNow;
                    Console.WriteLine("[JWT] JWKS refreshed");
                    return _cachedJwks.GetSigningKeys();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[JWT] JWKS fetch failed: {ex.Message}");
                    return _cachedJwks?.GetSigningKeys() ?? Enumerable.Empty<SecurityKey>();
                }
                finally { _jwksSem.Release(); }
            }
        };

        // SignalR uses query-string token for WebSocket connections
        // (WebSocket protocol doesn't support custom headers)
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                var path  = ctx.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(token) && path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            },
            OnAuthenticationFailed = ctx =>
            {
                Console.WriteLine($"[JWT] Auth failed: {ctx.Exception.GetType().Name}");
                return Task.CompletedTask;
            },
        };
    });

// ── CORS ──────────────────────────────────────────────────────────────────────
// AllowCredentials is required for SignalR + cookies. Keep everything on ONE line in .env.
var allowedOrigins = (Environment.GetEnvironmentVariable("ALLOWED_ORIGINS")
    ?? "http://localhost:3000,http://localhost:3001")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

Console.WriteLine($"[CORS] Origins: {string.Join(" | ", allowedOrigins)}");

builder.Services.AddCors(o => o.AddPolicy("dig-cors", p =>
    p.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

builder.Services.AddAuthorization();

// ── Build ─────────────────────────────────────────────────────────────────────
var app = builder.Build();

// Global exception handler first — wraps everything
app.UseMiddleware<ExceptionMiddleware>();

// Session activity tracker — touches last_active_at on every authenticated request
app.UseMiddleware<SessionActivityMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Local static file serving only in Development
if (app.Environment.IsDevelopment())
{
    var storagePath = Path.Combine(Directory.GetCurrentDirectory(), "storage");
    Directory.CreateDirectory(storagePath);
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(storagePath),
        RequestPath  = "/storage"
    });
}

app.UseRouting();
app.UseCors("dig-cors");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// ── SignalR hub endpoint ──────────────────────────────────────────────────────
// Frontend connects to: /hubs/collab?workspaceId={id}&access_token={token}
app.MapHub<CollaborationHub>("/hubs/collab");

app.MapGet("/health", () => Results.Ok(new { status = "ok", version = "2.0.0" }));

var urls = (Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://localhost:5150")
    .Replace("0.0.0.0", "localhost");
Console.WriteLine($"[DIG] ✓ Listening: {urls}");
Console.WriteLine($"[DIG] ✓ Swagger:   {urls}/swagger");
Console.WriteLine($"[DIG] ✓ SignalR:   {urls}/hubs/collab");

try { app.Run(); }
catch (Exception ex) { Console.WriteLine("[DIG] FATAL: " + ex); throw; }
