using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Infrastructure.Http;
using backend.Infrastructure.Repositories;
using backend.Infrastructure.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using System.Text;

Console.WriteLine("[DIG] Starting...");

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://localhost:5150");
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// Supabase
var supabaseUrl    = builder.Configuration["Supabase:Url"]!;
var supabaseSecret = builder.Configuration["Supabase:SecretKey"]!;

builder.Services.AddSingleton(provider =>
{
    var client = new Supabase.Client(supabaseUrl, supabaseSecret, new Supabase.SupabaseOptions
    {
        AutoRefreshToken    = false,
        AutoConnectRealtime = false
    });
    client.InitializeAsync().GetAwaiter().GetResult();
    Console.WriteLine("[DIG] Supabase connected");
    return client;
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name         = "Authorization",
        Type         = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme       = "Bearer",
        In           = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description  = "Enter your JWT token"
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

// Repositories
builder.Services.AddScoped<IUserRepository,    UserRepository>();
builder.Services.AddScoped<IDatasetRepository, DatasetRepository>();

// Storage
builder.Services.AddScoped<IStorageService, SupabaseStorageService>();

// App Services
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddScoped<IUserProfileService, UserProfileService>(); // was missing!
builder.Services.AddHttpClient<IPythonAiClient, PythonAiClient>();

// JWT
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? "DigEEEMMM74443-pppqhgwiuervhbwoibgqpi4utqb222225y43tij";
    
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = builder.Configuration["Jwt:Issuer"]  ?? "dig",
            ValidAudience            = builder.Configuration["Jwt:Audience"] ?? "dig",
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    });

builder.Services.AddCors(options =>
    options.AddPolicy("dev", p =>
        p.WithOrigins("http://localhost:3000")
         .AllowAnyHeader()
         .AllowAnyMethod()));

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
    RequestPath  = "/storage"
});

app.UseRouting();
app.UseCors("dev");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok", db = "supabase" }));

Console.WriteLine("[DIG] Listening on http://localhost:5150");
Console.WriteLine("[DIG] Swagger at  http://localhost:5150/swagger");

try { app.Run(); }
catch (Exception ex)
{
    Console.WriteLine("[DIG] FATAL: " + ex.Message);
    Console.WriteLine(ex.StackTrace);
    Console.ReadKey();
}