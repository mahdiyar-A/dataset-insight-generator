using backend.Domain.Entities;

namespace backend.Application.Services;

/// <summary>Which stored file a download type means, and the name to save it under.</summary>
public static class AnalysisFiles
{
    public static (string? Path, string FileName) Find(Analysis analysis, string type) => type switch
    {
        "original" => (analysis.OriginalCsvPath, analysis.FileName),
        "cleaned"  => (analysis.CleanedCsvPath,  FileFormats.CleanedFileName(analysis.FileName)),
        "report"   => (analysis.PdfReportPath,   analysis.ReportFileName),
        "word"     => (analysis.WordReportPath,  analysis.ReportFileName.Replace(".pdf", ".docx")),
        "pptx"     => (analysis.PptxReportPath,  analysis.ReportFileName.Replace(".pdf", ".pptx")),
        _          => (null, ""),
    };
}
