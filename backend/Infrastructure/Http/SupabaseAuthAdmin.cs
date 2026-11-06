using System.Net;
using System.Net.Http.Headers;
using backend.Application.Interfaces;

namespace backend.Infrastructure.Http;

/// <summary>
/// Supabase Auth's admin API, called directly with the secret key in both the
/// apikey and Authorization headers.
/// </summary>
public class SupabaseAuthAdmin : IAuthAdmin
{
    private readonly HttpClient _http;
    private readonly string     _url;
    private readonly string     _secretKey;

    public SupabaseAuthAdmin(HttpClient http, IConfiguration config)
    {
        _http      = http;
        _url       = (config["Supabase:Url"] ?? "").TrimEnd('/');
        _secretKey = config["Supabase:SecretKey"] ?? "";
    }

    public async Task DeleteUserAsync(Guid userId)
    {
        using var request = new HttpRequestMessage(HttpMethod.Delete, $"{_url}/auth/v1/admin/users/{userId}");
        request.Headers.Add("apikey", _secretKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _secretKey);

        using var response = await _http.SendAsync(request);
        if (response.StatusCode == HttpStatusCode.NotFound) return;  // already gone
        response.EnsureSuccessStatusCode();
    }
}
