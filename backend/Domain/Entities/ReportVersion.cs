namespace backend.Domain.Entities;

/// <summary>
/// One saved version of an analysis's report, as a document the files are
/// built from. Version 1 is what DIG wrote; every save after it is a new
/// version, and going back to an older one saves it again as the newest.
///
/// The document's shape belongs to the AI service (report_document.py). This
/// side stores it and hands it back without reading inside it.
/// </summary>
public class ReportVersion
{
    public const string Written  = "written";
    public const string Edited   = "edited";
    public const string Restored = "restored";

    public Guid     AnalysisId   { get; private set; }
    public int      Version      { get; private set; }
    public string   Document     { get; private set; } = "{}";
    public Guid?    EditedBy     { get; private set; }
    public string   Kind         { get; private set; } = Edited;
    public int?     RestoredFrom { get; private set; }
    public bool     FilesBuilt   { get; private set; }
    public DateTime CreatedAt    { get; private set; }

    public ReportVersion(Guid analysisId, int version, string document, Guid? editedBy, string kind,
                         int? restoredFrom = null, bool filesBuilt = false, DateTime? createdAt = null)
    {
        if (version < 1) throw new ArgumentOutOfRangeException(nameof(version));
        AnalysisId   = analysisId;
        Version      = version;
        Document     = document;
        EditedBy     = editedBy;
        Kind         = kind;
        RestoredFrom = restoredFrom;
        FilesBuilt   = filesBuilt;
        CreatedAt    = createdAt ?? DateTime.UtcNow;
    }
}
