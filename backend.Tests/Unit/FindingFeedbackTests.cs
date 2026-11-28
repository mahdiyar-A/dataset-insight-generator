using backend.Application.Interfaces;
using backend.Application.Services;
using backend.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NUnit.Framework;

namespace backend.Tests.Unit;

/// <summary>
/// What a saved report tells DIG about which findings people keep: counts per
/// kind of finding, and nothing about the person or the words.
/// </summary>
[TestFixture]
public class FindingFeedbackTests
{
    private const string Written = """
    {"insights":[{"id":"i1","kind":"trend","title":"Sales rise","body":"Up 12%."},
                 {"id":"i2","kind":"correlation","title":"Price and units","body":"They move together."},
                 {"id":"i3","kind":"correlation","title":"Spend and visits","body":"Linked."},
                 {"id":"i4","title":"No kind","body":"From before kinds were kept."}],
     "facts":{"domain":{"domain":"Sales"}}}
    """;

    [Test]
    public void A_written_report_counts_one_shown_per_insight_by_kind()
    {
        var c = FindingFeedback.Written(Written);

        c.Domain.Should().Be("sales");
        c.ByKind.Should().BeEquivalentTo(new Dictionary<string, (int, int, int)>
        {
            ["trend"] = (1, 0, 0),
            ["correlation"] = (2, 0, 0),
        });
    }

    [Test]
    public void A_save_counts_what_it_deleted_and_what_it_rewrote()
    {
        var after = """
        {"insights":[{"id":"i1","kind":"trend","title":"Sales rise","body":"Up 12%."},
                     {"id":"i3","kind":"correlation","title":"Spend and site visits","body":"Linked."},
                     {"id":"n1","kind":"segment","title":"Added by the chat","body":"New."}],
         "facts":{"domain":{"domain":"sales"}}}
        """;

        var c = FindingFeedback.Edited(Written, after);

        c.ByKind.Should().BeEquivalentTo(new Dictionary<string, (int, int, int)>
        {
            ["correlation"] = (0, 1, 1),   // i2 deleted, i3 retitled
        }, "an insight kept as it was and one added count nothing");
    }

    [Test]
    public void A_report_with_no_domain_is_general()
    {
        FindingFeedback.Written("""{"insights":[]}""").Domain.Should().Be("general");
    }

    [Test]
    public void Nothing_odd_in_a_document_can_fail_a_save()
    {
        var log = new FakeActivityLog();

        var store = () => FindingFeedback.Store(log, () => FindingFeedback.Edited("{not json", "{}"),
                                                NullLogger.Instance);
        store.Should().NotThrow();
        FindingFeedback.Store(null, () => FindingFeedback.Written(Written), NullLogger.Instance);
        log.Findings.Should().BeEmpty();
    }

    [Test]
    public void The_counts_reach_the_ai_service_as_plain_numbers()
    {
        var json = FindingFeedback.ToJson(new[] { new FindingFeedbackRow("sales", "trend", 5, 1, 2) });

        json.Should().Be("""[{"domain":"sales","kind":"trend","shown":5,"removed":1,"rewritten":2}]""");
    }
}
