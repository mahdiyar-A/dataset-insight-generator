using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace backend.Infrastructure.Repositories;

/// <summary>
/// Reads a jsonb column into a string property, whatever the column holds.
///
/// The code keeps these columns as text, so what it writes comes back as a JSON
/// string. But jsonb can hold anything: datasets.chart_urls defaults to an
/// array, and a value set by hand or by a migration may be an object. Without
/// this, one such row makes the JSON reader throw, and the user's whole history
/// fails to load rather than that one entry.
/// </summary>
public sealed class JsonbTextConverter : JsonConverter<string?>
{
    public override string? ReadJson(
        JsonReader reader, Type objectType, string? existingValue, bool hasExistingValue, JsonSerializer serializer)
    {
        var token = JToken.Load(reader);
        return token.Type switch
        {
            JTokenType.Null   => null,
            JTokenType.String => token.Value<string>(),
            _                 => token.ToString(Formatting.None),
        };
    }

    public override void WriteJson(JsonWriter writer, string? value, JsonSerializer serializer) =>
        writer.WriteValue(value);
}
