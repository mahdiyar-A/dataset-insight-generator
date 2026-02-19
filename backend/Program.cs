var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// NOTE: In this scaffold we register a minimal DbContext. In a runnable app you must
// configure the provider (UseSqlServer/UseSqlite) and a connection string in appsettings.
// Here we add the context so repository DI works; actual options should be configured later.
builder.Services.AddDbContext<backend.Infrastructure.Data.AppDbContext>(options => { /* configure provider in real app */ });

// Register application services and repository implementations used by controllers.
// Keeping these registrations simple helps the rest of the code compile; real wiring
// should be adjusted to use concrete types and proper lifetimes for your app.
builder.Services.AddScoped<backend.Application.Interfaces.IUserProfileService, backend.Application.Services.UserProfileService>();
builder.Services.AddScoped<backend.Application.Interfaces.IUserRepository, backend.Infrastructure.Repositories.UserRepository>();
builder.Services.AddSingleton<backend.Application.Interfaces.IStorageService, backend.Infrastructure.Storage.LocalFileStorage>();

var app = builder.Build();

// Configure the HTTP request pipeline. Swagger is enabled in Development.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Serve profile pictures from the local "storage" folder at request path /storage.
// This lets the frontend fetch images from the path returned by the storage service.
var storagePath = Path.Combine(Directory.GetCurrentDirectory(), "storage");
if (!Directory.Exists(storagePath)) Directory.CreateDirectory(storagePath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(storagePath),
    RequestPath = "/storage"
});

// Redirect HTTP to HTTPS in environments where TLS is configured.
app.UseHttpsRedirection();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast =  Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast")
.WithOpenApi();

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
