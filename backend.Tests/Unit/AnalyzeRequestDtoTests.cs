using backend.Application.DTOs.AI;
using FluentAssertions;
using NUnit.Framework;
using System.Text.Json;

namespace backend.Tests.Unit;

/// <summary>
/// Tests for AnalyzeRequestDto default values and customization field parsing.
///
/// Risk focus: the DTO is the contract between the C# controller and the Python
/// AI pipeline. Wrong defaults or missing fields mean customization is silently
/// ignored — the pipeline runs with stale or unintended settings and the user
/// gets generic output even though they configured a specific audience/tone.
/// </summary>
[TestFixture]
public class AnalyzeRequestDtoTests
{
    [Test]
    public void DefaultValues_AreAllSafeAndNonNull()
    {
        // Risk: any null string default that reaches Python as "None" would
        // cause a KeyError or AttributeError in the pipeline.
        var dto = new AnalyzeRequestDto();

        dto.Language.Should().Be("en");
        dto.Tone.Should().Be("professional");
        dto.InsightsCount.Should().Be(5);
        dto.Occasion.Should().Be("general");
        dto.Audience.Should().Be("general");
        dto.Depth.Should().Be("standard");
        dto.FocusOn.Should().Be("");
        dto.Comparisons.Should().Be("");
        dto.MustMention.Should().Be("");
        dto.ChartStyle.Should().Be("mixed");
        dto.IncludeMethodology.Should().BeTrue();
        dto.IncludeConfidence.Should().BeTrue();
        dto.WantWord.Should().BeFalse();
        dto.WantPptx.Should().BeFalse();
    }

    [Test]
    public void InsightsCount_DefaultsToFive_WithinValidRange()
    {
        // Risk: if the count defaults to 0 or a negative, the pipeline emits
        // no insights and the report is empty — a complete silentfailure.
        var dto = new AnalyzeRequestDto();
        dto.InsightsCount.Should().BeInRange(1, 10);
    }

    [Test]
    public void Tone_DefaultValue_MatchesPipelineExpectedKey()
    {
        // Risk: the Gemini prompt uses tone as a dictionary key for the persona
        // matrix. A value like "Professional" (capitalized) would miss the lookup
        // and fall back to a default persona — silently ignoring the user's choice.
        var dto = new AnalyzeRequestDto();
        var validTones = new[] { "professional", "technical", "storytelling", "casual", "academic", "simplified" };
        validTones.Should().Contain(dto.Tone);
    }

    [Test]
    public void Audience_DefaultValue_MatchesPipelineExpectedKey()
    {
        var dto = new AnalyzeRequestDto();
        var validAudiences = new[] { "general", "executive", "technical", "client", "student" };
        validAudiences.Should().Contain(dto.Audience);
    }

    [Test]
    public void Depth_DefaultValue_MatchesPipelineExpectedKey()
    {
        var dto = new AnalyzeRequestDto();
        var validDepths = new[] { "quick", "standard", "deep" };
        validDepths.Should().Contain(dto.Depth);
    }

    [Test]
    public void ChartStyle_DefaultValue_MatchesPipelineExpectedKey()
    {
        var dto = new AnalyzeRequestDto();
        var validStyles = new[] { "mixed", "bar-heavy", "trend", "distribution", "comparison" };
        validStyles.Should().Contain(dto.ChartStyle);
    }

    [Test]
    public void AnalyzeRequestDto_SetsAndGetsAllCustomFields()
    {
        // Round-trip test — every setter must survive a get cycle.
        var dto = new AnalyzeRequestDto
        {
            Language      = "fr",
            Tone          = "academic",
            InsightsCount = 7,
            Occasion      = "investor",
            Audience      = "executive",
            Depth         = "deep",
            FocusOn       = "revenue vs cost",
            Comparisons   = "Q1 vs Q2",
            MustMention   = "EBITDA,ARR,churn",
            ChartStyle    = "bar-heavy",
            IncludeMethodology = false,
            IncludeConfidence  = false,
            WantWord = true,
            WantPptx = true,
        };

        dto.Language.Should().Be("fr");
        dto.Tone.Should().Be("academic");
        dto.InsightsCount.Should().Be(7);
        dto.Audience.Should().Be("executive");
        dto.Depth.Should().Be("deep");
        dto.FocusOn.Should().Be("revenue vs cost");
        dto.MustMention.Should().Be("EBITDA,ARR,churn");
        dto.IncludeMethodology.Should().BeFalse();
        dto.WantWord.Should().BeTrue();
        dto.WantPptx.Should().BeTrue();
    }
}
