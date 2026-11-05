namespace backend.Application.Services;

/// <summary>
/// The data files a user can upload.
///
/// Mirrors SUPPORTED_EXTENSIONS in ai_service/ai_engine/ingest/loader.py and
/// the accept list in frontend/components/UploadCard.jsx; keep all three in
/// step. The extension only decides what the server agrees to store: the AI
/// service reads the content to decide the format, so an Excel file named
/// .csv is still read as Excel.
/// </summary>
public static class FileFormats
{
    public static readonly IReadOnlySet<string> Extensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        ".csv", ".tsv", ".tab", ".txt", ".dat", ".psv",
        ".xlsx", ".xlsm", ".xls", ".ods",
        ".json", ".jsonl", ".ndjson", ".geojson", ".xml",
        ".parquet", ".pq", ".feather", ".arrow", ".ipc", ".orc",
        ".dta", ".sas7bdat", ".xpt", ".sav", ".zsav",
        ".sqlite", ".sqlite3", ".db",
        ".gz", ".bz2", ".xz", ".zip",
    };

    /// <summary>Uploads larger than this are refused before they are stored.</summary>
    public const long MaxUploadBytes = 50L * 1024 * 1024;

    /// <summary>For error messages: what the user can upload, in words.</summary>
    public const string Described =
        "CSV or other delimited text, Excel, OpenDocument, JSON, XML, Parquet, Feather, ORC, " +
        "Stata, SAS, SPSS or SQLite, optionally zipped or gzipped";

    /// <summary>The file name's extension, lower-cased, if it is one we accept; otherwise null.</summary>
    public static string? ExtensionOf(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return null;
        var ext = Path.GetExtension(fileName.Trim()).ToLowerInvariant();
        return Extensions.Contains(ext) ? ext : null;
    }

    public static bool IsAccepted(string? fileName) => ExtensionOf(fileName) != null;

    /// <summary>Plain delimited text, which can be counted without the AI service.</summary>
    public static bool IsPlainText(string? fileName) =>
        ExtensionOf(fileName) is ".csv" or ".tsv" or ".tab" or ".txt" or ".dat" or ".psv";

    /// <summary>
    /// The name the cleaned download should carry. Cleaning always produces a
    /// CSV, so "sales.xlsx" becomes "cleaned_sales.csv", not "cleaned_sales.xlsx".
    /// </summary>
    public static string CleanedFileName(string originalFileName)
    {
        var stem = Path.GetFileNameWithoutExtension(originalFileName ?? "");
        // "orders.csv.gz" → "orders"
        if (Extensions.Contains(Path.GetExtension(stem))) stem = Path.GetFileNameWithoutExtension(stem);
        return $"cleaned_{(string.IsNullOrWhiteSpace(stem) ? "data" : stem)}.csv";
    }
}
