using System.Net;
using System.Net.Sockets;
using System.Text;

namespace backend.Tests.Helpers;

/// <summary>
/// A stand-in for Supabase's HTTP API, reached through the real client library.
///
/// The rest of the suite fakes the repositories, so nothing there can notice
/// what the client library actually puts on the wire. That is where the live
/// database and the code have disagreed: a null sent into a required column,
/// a content type the bucket refuses. These tests run the real repositories
/// and the real storage service against this listener and look at the requests.
/// </summary>
public sealed class FakeSupabase : IDisposable
{
    public sealed record Seen(
        string Method, string Path, string Query,
        Dictionary<string, string> Headers, byte[] Bytes)
    {
        public string Text => Encoding.UTF8.GetString(Bytes);
    }

    private readonly HttpListener _listener = new();
    private readonly List<Seen> _requests = new();

    /// <summary>What to answer with. Defaults to an empty table, which is a valid PostgREST reply.</summary>
    public Func<Seen, (int Status, string Body)> Reply { get; set; } = _ => (200, "[]");

    public IReadOnlyList<Seen> Requests
    {
        get { lock (_requests) return _requests.ToList(); }
    }

    public string Url { get; }
    public Supabase.Client Client { get; }

    public FakeSupabase()
    {
        var port = FreePort();
        Url = $"http://localhost:{port}";
        _listener.Prefixes.Add(Url + "/");
        _listener.Start();
        _ = Task.Run(ServeAsync);

        Client = new Supabase.Client(Url, "test-secret-key",
            new Supabase.SupabaseOptions { AutoRefreshToken = false, AutoConnectRealtime = false });
    }

    private static int FreePort()
    {
        var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        var port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        return port;
    }

    private async Task ServeAsync()
    {
        while (_listener.IsListening)
        {
            HttpListenerContext context;
            try { context = await _listener.GetContextAsync(); }
            catch (Exception) { return; }  // disposed

            using var body = new MemoryStream();
            await context.Request.InputStream.CopyToAsync(body);

            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var name in context.Request.Headers.AllKeys)
                if (name != null) headers[name] = context.Request.Headers[name] ?? "";

            var seen = new Seen(
                context.Request.HttpMethod,
                context.Request.Url!.AbsolutePath,
                context.Request.Url!.Query,
                headers,
                body.ToArray());
            lock (_requests) _requests.Add(seen);

            var (status, text) = Reply(seen);
            var bytes = Encoding.UTF8.GetBytes(text);
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json";
            await context.Response.OutputStream.WriteAsync(bytes);
            context.Response.Close();
        }
    }

    public void Dispose()
    {
        try { _listener.Stop(); _listener.Close(); }
        catch (ObjectDisposedException) { }
    }
}
