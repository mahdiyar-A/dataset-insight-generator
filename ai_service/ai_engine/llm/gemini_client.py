import json
import re
import urllib.request
import urllib.error
from ai_engine.models.models import StatsSummary, LLMReport, ChartInstruction


GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

CHART_COLORS = ["#3b82f6", "#a855f7", "#10b981", "#f97316", "#ec4899"]
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

    return f"""You are a senior data analyst and report writer producing a formal, executive-level data analysis report for a professional audience.

Analyze the following dataset statistics and produce a comprehensive structured report.

{cleaning_note}
Confidence note: {confidence_note}

DATASET STATISTICS:
{stats_block}

YOUR TASK — respond ONLY with valid JSON in this exact structure, nothing else:

{{
  "report_title": "A professional, descriptive title for this report based on what the data appears to represent.",

  "introduction": "3-4 sentences. Professionally introduce the report — describe what dataset was analyzed, its scope (rows, columns, data types), the purpose of this analysis, and what the reader can expect to find in the report. Formal tone, as if written by a consulting firm.",

  "executive_summary": "3-4 sentences. High-level overview of the most important findings. What story does this data tell? What are the headline takeaways a decision-maker needs to know immediately?",

  "insights": [
    {{
      "rank": 1,
      "title": "Short, specific insight title",
      "body": "4-6 sentences. Formal analytical tone. Cite specific numbers, percentages, and column names from the data. Focus on non-obvious, hard-to-capture patterns — not generic observations. Explain business, operational, or domain-relevant significance. Connect the finding to potential real-world implications.",
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
      "description": "What this chart reveals and why it matters to the analysis",
      "insight_index": 1,
      "color": "#3b82f6"
    }}
  ],

  "conclusion": "3-4 sentences. Professionally conclude the report — summarize the key findings, highlight any limitations or caveats in the data, and provide forward-looking recommendations or next steps based on the analysis. End with a statement about the overall analytical confidence.",

  "confidence_note": "Honest, specific assessment of how much to trust these insights given the data quality, sample size, and completeness."
}}

RULES:
- Produce exactly 5 insights, ranked by significance (most impactful first)
- Produce between 3 and 5 charts maximum. Choose charts wisely — only create a chart if it genuinely adds visual value. NOT every insight needs its own chart. Prefer charts that show trends, distributions, or comparisons that are immediately readable.
- chart_type must be one of: bar, line, scatter, histogram, heatmap, box — pick the type that best fits the data pattern
- x_column and y_column must be EXACT column names from the data (case-sensitive). For histograms and box plots, y_column can be null.
- All text must be formal, professional, and specific — no generic filler statements
- Do NOT include markdown, code blocks, or any text outside the JSON
"""


def call_gemini(stats: StatsSummary, confidence_note: str, was_cleaned: bool, api_key: str) -> LLMReport:
    prompt = _build_prompt(stats, confidence_note, was_cleaned)

    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature":     0.3,
            "maxOutputTokens": 8192,
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

    try:
        text = raw["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response format: {raw}")

    text = re.sub(r"```(?:json)?", "", text).strip()
    text = text.strip("`").strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
        else:
            raise RuntimeError(f"Could not parse Gemini response as JSON: {e}\nRaw: {text[:500]}")

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
            color=CHART_COLORS[i % len(CHART_COLORS)],  # force cycling — Gemini always returns the example blue
        ))

    return LLMReport(
        reportTitle=parsed.get("report_title", ""),
        introduction=parsed.get("introduction", ""),
        executiveSummary=parsed.get("executive_summary", ""),
        insights=parsed.get("insights", []),
        chartInstructions=chart_instructions,
        confidenceNote=parsed.get("confidence_note", ""),
        conclusion=parsed.get("conclusion", ""),
        rawResponse=text,
    )