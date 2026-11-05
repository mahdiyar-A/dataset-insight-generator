using System.Text;
using backend.Application.Services;
using FluentAssertions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// Where an upload waits for its analysis.
///
/// The bug behind this class: uploads were written as {userId}.xlsx while the
/// chat and the pipeline only looked for {userId}.csv, so every Excel upload
/// ended in "No dataset found".
/// </summary>
[TestFixture]
public class UploadStoreTests
{
    private string      _root  = null!;
    private UploadStore _store = null!;
    private Guid        _owner;

    [SetUp]
    public void SetUp()
    {
        _root  = Path.Combine(Path.GetTempPath(), "dig_store_tests", Guid.NewGuid().ToString());
        _store = new UploadStore(_root);
        _owner = Guid.NewGuid();
    }

    [TearDown]
    public void TearDown()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    private Task<string> Save(string name, string content = "a,b\n1,2\n", Guid? owner = null) =>
        _store.SaveAsync(owner ?? _owner, name, new MemoryStream(Encoding.UTF8.GetBytes(content)));

    [TestCase("sales.csv")]
    [TestCase("sales.xlsx")]
    [TestCase("sales.parquet")]
    [TestCase("records.json")]
    public async Task Find_ReturnsTheUpload_WhateverItsExtension(string name)
    {
        var path = await Save(name);

        _store.Find(_owner).Should().Be(path);
        File.ReadAllText(path).Should().Be("a,b\n1,2\n");
    }

    [Test]
    public void Find_WithNoUpload_ReturnsNull() => _store.Find(_owner).Should().BeNull();

    [Test]
    public async Task NewUpload_ReplacesOneOfAnotherType()
    {
        // Risk: an old .csv left beside a new .xlsx would be analysed instead of it.
        var first  = await Save("old.csv");
        var second = await Save("new.xlsx");

        File.Exists(first).Should().BeFalse();
        _store.Find(_owner).Should().Be(second);
    }

    [Test]
    public async Task OwnersDoNotSeeEachOthersUploads()
    {
        var other = Guid.NewGuid();
        await Save("mine.csv");

        _store.Find(other).Should().BeNull();
        _store.Delete(other);
        _store.Find(_owner).Should().NotBeNull();
    }

    [Test]
    public void UnsupportedType_IsNotStored()
    {
        var act = () => Save("virus.exe");

        act.Should().ThrowAsync<ArgumentException>();
        Directory.EnumerateFiles(_root).Should().BeEmpty();
    }

    [Test]
    public async Task Meta_RoundTrips_AndIsNeverMistakenForAJsonUpload()
    {
        // Risk: ".json" is a data format we accept, so a sidecar stored beside
        // the upload could be found as the upload itself.
        await Save("data.csv");
        _store.SaveMeta(_owner, new UploadMeta("data.csv", "text", "CSV / text", 12, 2, new[] { "a", "b" }));

        var meta = _store.ReadMeta(_owner);
        meta!.Rows.Should().Be(12);
        meta.Headers.Should().Equal("a", "b");

        _store.Find(_owner).Should().EndWith(".csv");
        _store.Delete(_owner);
        _store.Find(_owner).Should().BeNull("the sidecar is not an upload");
    }

    [Test]
    public async Task Delete_RemovesTheUploadAndWhatWasReadFromIt()
    {
        await Save("data.csv");
        _store.SaveMeta(_owner, new UploadMeta("data.csv", null, null, 1, 1, Array.Empty<string>()));

        _store.Delete(_owner);

        _store.Find(_owner).Should().BeNull();
        _store.ReadMeta(_owner).Should().BeNull();
    }

    [Test]
    public void DamagedMeta_ReadsAsNothing()
    {
        _store.SaveMeta(_owner, new UploadMeta("data.csv", null, null, 1, 1, Array.Empty<string>()));
        File.WriteAllText(Path.Combine(_root, "meta", $"{_owner}.json"), "{ not json");

        _store.ReadMeta(_owner).Should().BeNull();
    }
}
