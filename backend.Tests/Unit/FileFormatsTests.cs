using System.Text.RegularExpressions;
using backend.Application.Services;
using FluentAssertions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// Which uploads the server agrees to store.
///
/// Risk: the list exists three times (here, the AI service's reader and the
/// upload form). If they drift, the form offers a file the server refuses, or
/// the server stores one the reader cannot open.
/// </summary>
[TestFixture]
public class FileFormatsTests
{
    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !Directory.Exists(Path.Combine(dir.FullName, "ai_service")))
            dir = dir.Parent;
        return dir?.FullName ?? throw new DirectoryNotFoundException("Repository root not found.");
    }

    [Test]
    public void Extensions_MatchTheAiServiceReader()
    {
        var source = File.ReadAllText(Path.Combine(RepoRoot(), "ai_service", "ai_engine", "ingest", "loader.py"));
        var block  = Regex.Match(source, @"SUPPORTED_EXTENSIONS = \((.*?)\n\)", RegexOptions.Singleline).Groups[1].Value;
        var python = Regex.Matches(block, "\"(\\.[a-z0-9]+)\"").Select(m => m.Groups[1].Value).ToList();

        python.Should().NotBeEmpty();
        python.Should().BeEquivalentTo(FileFormats.Extensions);
    }

    [TestCase("sales.csv", ".csv")]
    [TestCase("SALES.XLSX", ".xlsx")]
    [TestCase("archive.csv.gz", ".gz")]
    [TestCase("survey.sav", ".sav")]
    [TestCase("  padded.parquet  ", ".parquet")]
    public void Accepted_ReturnsTheLowerCaseExtension(string name, string expected) =>
        FileFormats.ExtensionOf(name).Should().Be(expected);

    [TestCase("report.pdf")]
    [TestCase("setup.exe")]
    [TestCase("notes.docx")]
    [TestCase("no-extension")]
    [TestCase("")]
    [TestCase(null)]
    public void Refused_ReturnsNull(string? name)
    {
        FileFormats.ExtensionOf(name).Should().BeNull();
        FileFormats.IsAccepted(name).Should().BeFalse();
    }

    [Test]
    public void OnlyDelimitedTextCountsAsPlainText()
    {
        FileFormats.IsPlainText("a.csv").Should().BeTrue();
        FileFormats.IsPlainText("a.tsv").Should().BeTrue();
        FileFormats.IsPlainText("a.xlsx").Should().BeFalse();
        FileFormats.IsPlainText("a.parquet").Should().BeFalse();
    }

    // Risk: cleaning always produces a CSV, so "cleaned_sales.xlsx" would be a
    // text file that Excel refuses to open.
    [TestCase("sales.csv", "cleaned_sales.csv")]
    [TestCase("sales.xlsx", "cleaned_sales.csv")]
    [TestCase("orders.csv.gz", "cleaned_orders.csv")]
    [TestCase("q1.results.parquet", "cleaned_q1.results.csv")]
    [TestCase("", "cleaned_data.csv")]
    public void CleanedFileName_IsAlwaysCsv(string original, string expected) =>
        FileFormats.CleanedFileName(original).Should().Be(expected);
}
