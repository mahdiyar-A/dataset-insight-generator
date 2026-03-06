import json
import re
import urllib.request
import urllib.error
from ai_engine.models.models import StatsSummary, LLMReport, ChartInstruction


GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-1.5-flash:generateContent"
)

CHART_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"]
CHART_TYPES  = ["bar", "line", "scatter", "histogram", "heatmap", "box"]


def _build_prompt(stats: StatsSummary, confidence_note: str, was_cleaned: bool) -> str:
    stats_block = json.dumps({
        "rows":               stats.rowCount,
        "columns":            stats.columnCount,
        "column_types":       stats.columnTypes,
        "missing_pct":        stats.missingPercentages,
        "numeric_stats":      stats.numericStats,
        "top_correlations":   stats.topCorrelations,
        "categorical":        stats.categoricalSummaries,
        "outliers":           stats.outlierSummary,
        "detected_issues":    stats.detectedIssues,
    }, indent=2)

    cleaning_note = (
        "NOTE: This dataset was automatically cleaned before analysis — "
        "missing values imputed, duplicates removed, outliers capped."
        if was_cleaned else
        "NOTE: Dataset was used as-is without cleaning."
    )

    return f"""You are a senior data analyst producing a formal, executive-level report.
Analyze the following dataset statistics and produce a structured report.

{cleaning_note}
Confidence note: {confidence_note}

DATASET STATISTICS:
{stats_block}

YOUR TASK — respond ONLY with valid JSON in this exact structure, nothing else:

{{
  "executive_summary": "2-3 sentence overview of what this dataset represents and its key characteristics.",

  "insights": [
    {{
      "rank": 1,
      "title": "Short insight title",
      "body": "3-5 sentences. Formal tone. Cite specific numbers from the data. Focus on non-obvious, hard-to-capture patterns — not generic observations. Business, financial, educational, or domain-relevant significance.",
      "insight_index": 1
    }}
  ],

  "chart_instructions": [
    {{
      "index": 1,
      "chart_type": "bar",
      "title": "Chart title",
      "x_column": "exact column name from data",
      "y_column": "exact column name or null for single-column charts",
      "description": "What this chart reveals and why it matters",
      "insight_index": 1,
      "color": "#3b82f6"
    }}
  ],

  "confidence_note": "Your honest assessment of how much to trust these insights given the data quality. Be specific."
}}

RULES:
- Produce exactly 5 insights, ranked by significance (most impactful first)
- Produce 3-5 charts, each tied to a specific insight via insight_index
- chart_type must be one of: bar, line, scatter, histogram, heatmap, box
- x_column and y_column must be EXACT column names from the data (case-sensitive)
- Insights must be specific and data-driven — no generic statements like "the data shows variation"
- Use formal analytical language — this is an executive report
- Do NOT include markdown, code blocks, or any text outside the JSON
"""


def call_gemini(stats: StatsSummary, confidence_note: str, was_cleaned: bool, api_key: str) -> LLMReport:
    prompt = _build_prompt(stats, confidence_note, was_cleaned)

    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature":     0.3,   # low temp = consistent, formal output
            "maxOutputTokens": 4096,
            "topP":            0.8,
        }
    }).encode("utf-8")

    url = f"{GEMINI_API_URL}?key={api_key}"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise RuntimeError(f"Gemini API error {e.code}: {error_body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Gemini connection failed: {e.reason}")

    # Extract text from Gemini response
    try:
        text = raw["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response format: {raw}")

    # Strip any markdown code fences if Gemini added them
    text = re.sub(r"```(?:json)?", "", text).strip()
    text = text.strip("`").strip()

    # Parse JSON
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        # Try to extract JSON from within the text
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
        else:
            raise RuntimeError(f"Could not parse Gemini response as JSON: {e}\nRaw: {text[:500]}")

    # Build chart instructions
    chart_instructions = []
    for i, c in enumerate(parsed.get("chart_instructions", [])):
        chart_instructions.append(ChartInstruction(
            index=c.get("index", i + 1),
            chartType=c.get("chart_type", "bar"),
            title=c.get("title", f"Chart {i+1}"),
            xColumn=c.get("x_column", ""),
            yColumn=c.get("y_column"),
            description=c.get("description", ""),
            insightIndex=c.get("insight_index", 1),
            color=c.get("color", CHART_COLORS[i % len(CHART_COLORS)]),
        ))

    return LLMReport(
        executiveSummary=parsed.get("executive_summary", ""),
        insights=parsed.get("insights", []),
        chartInstructions=chart_instructions,
        confidenceNote=parsed.get("confidence_note", ""),
        rawResponse=text,
    )
