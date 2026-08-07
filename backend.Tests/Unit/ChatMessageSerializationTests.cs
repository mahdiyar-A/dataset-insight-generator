using backend.Controllers;
using FluentAssertions;
using NUnit.Framework;
using System.Text.Json;

namespace backend.Tests.Unit;

/// <summary>
/// Tests for ChatMessageRequest / ChatMessageResponse serialization.
///
/// Risk focus: the chat protocol drives the entire analysis flow. If the frontend
/// sends "start_analysis" and it deserializes to null or empty string, the backend
/// silently returns the fallback "I didn't understand" response and analysis never
/// starts. These tests catch JSON property name mismatches and null-handling gaps
/// before they manifest as user-facing "nothing happened" bugs.
/// </summary>
[TestFixture]
public class ChatMessageSerializationTests
{
    private static readonly JsonSerializerOptions _opts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    // ── ChatMessageRequest deserialization ───────────────────────────────────

    [Test]
    public void ChatMessageRequest_Deserializes_MessageField()
    {
        // Risk: if "message" → Message property binding is broken, every chat
        // message routes to the fallback "I didn't understand" branch.
        var json = """{"message":"start_analysis"}""";
        var req = JsonSerializer.Deserialize<ChatMessageRequest>(json, _opts);
        req.Should().NotBeNull();
        req!.Message.Should().Be("start_analysis");
    }

    [Test]
    public void ChatMessageRequest_Deserializes_AllMetaFields()
    {
        // Risk: if fileName or fileSizeBytes don't bind, AnalysisService receives
        // null/0 and creates a DB row with no file metadata.
        var json = """
        {
          "message": "start_analysis",
          "fileName": "sales_data.csv",
          "fileSizeBytes": 204800,
          "rowCount": 1000,
          "columnCount": 15,
          "pendingCondition": "not_clean",
          "analysisId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
        }
        """;

        var req = JsonSerializer.Deserialize<ChatMessageRequest>(json, _opts);
        req!.FileName.Should().Be("sales_data.csv");
        req.FileSizeBytes.Should().Be(204800);
        req.RowCount.Should().Be(1000);
        req.ColumnCount.Should().Be(15);
        req.PendingCondition.Should().Be("not_clean");
        req.AnalysisId.Should().Be("3fa85f64-5717-4562-b3fc-2c963f66afa6");
    }

    [Test]
    public void ChatMessageRequest_WithNullOptionalFields_DoesNotThrow()
    {
        // Risk: null fileSizeBytes should produce a null long? — not 0 or an exception.
        // The controller falls back to FileInfo.Length if null, which is intentional.
        var json = """{"message":"yes","fileName":null,"fileSizeBytes":null}""";
        var req = JsonSerializer.Deserialize<ChatMessageRequest>(json, _opts);
        req!.FileName.Should().BeNull();
        req.FileSizeBytes.Should().BeNull();
    }

    [Test]
    public void ChatMessageRequest_Customization_AcceptsJsonObject()
    {
        // Risk: customization is a JsonElement? — if it doesn't parse as an object,
        // the pipeline receives null and ignores the user's Pro settings.
        var json = """
        {
          "message": "start_analysis",
          "customization": {"tone": "academic", "audience": "executive", "depth": "deep"}
        }
        """;

        var req = JsonSerializer.Deserialize<ChatMessageRequest>(json, _opts);
        req!.Customization.Should().NotBeNull();
        req.Customization!.Value.ValueKind.Should().Be(JsonValueKind.Object);

        var tone = req.Customization.Value.GetProperty("tone").GetString();
        tone.Should().Be("academic");
    }

    [Test]
    public void ChatMessageRequest_Customization_AcceptsNullWithoutThrowing()
    {
        // Risk: a free user sends no customization — the field is absent from JSON.
        // This must not crash deserialization or the controller.
        var json = """{"message":"start_analysis"}""";
        var req = JsonSerializer.Deserialize<ChatMessageRequest>(json, _opts);
        // Customization is a JsonElement? — absent field leaves it as default (Undefined)
        // which is treated as null in the controller.
        req!.Customization.HasValue.Should().BeFalse();
    }

    // ── ChatMessageResponse serialization ────────────────────────────────────

    [Test]
    public void ChatMessageResponse_Serializes_WithSnakeCaseLikePropertyNames()
    {
        // Risk: if JSON property names don't match [JsonPropertyName] attributes,
        // the frontend receives "Reply" instead of "reply" and shows undefined.
        var resp = new ChatMessageResponse
        {
            Reply            = "Starting analysis now.",
            Condition        = "all_good",
            RequiresResponse = false,
            Done             = false,
            Failed           = false,
        };

        var json = JsonSerializer.Serialize(resp, _opts);

        // Parse back and check camelCase keys are present
        var doc = JsonDocument.Parse(json);
        doc.RootElement.GetProperty("reply").GetString().Should().Be("Starting analysis now.");
        doc.RootElement.GetProperty("condition").GetString().Should().Be("all_good");
        doc.RootElement.GetProperty("requiresResponse").GetBoolean().Should().BeFalse();
        doc.RootElement.GetProperty("done").GetBoolean().Should().BeFalse();
        doc.RootElement.GetProperty("failed").GetBoolean().Should().BeFalse();
    }

    [Test]
    public void ChatMessageResponse_Reply_DefaultsToEmptyString_NotNull()
    {
        // Risk: a null Reply would serialize as null, and the frontend's
        // "addMsg('assistant', reply)" would display "null" literally in the chat.
        var resp = new ChatMessageResponse();
        resp.Reply.Should().NotBeNull();
        resp.Reply.Should().BeEmpty();
    }
}
