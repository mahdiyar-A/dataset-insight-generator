"""
Gemini 2.5 Flash Client  —  Phase 4 + Report Writing

One comprehensive call that:
  1. Receives full enriched stats + Groq domain context + attribute interpretations
  2. Writes boardroom-quality narrative (NEVER column language — always domain attributes)
  3. Generates up to 5 ranked insights with specific, cited evidence
  4. Specifies chart instructions (type / X / Y / placement) — charts NOT generated here
  5. Writes a 2-3 paragraph Data Quality & Methodology section
  6. Assigns its own confidence score 1-10 (later reviewed by Groq judge)
"""

import json
import re
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional

from ai_engine.models.models import StatsSummary, LLMReport, ChartInstruction, DomainResult


GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

CHART_COLORS = ["#3b82f6", "#a855f7", "#10b981", "#f97316", "#ec4899"]
VALID_CHART_TYPES = {"bar", "line", "scatter", "histogram", "heatmap", "box"}


# ─────────────────────────────────────────────────────────────────────────────
# Prompt builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_prompt(
    stats: StatsSummary,
    domain: DomainResult,
    was_cleaned: bool,
    dropped_columns: List[str],
) -> str:

    # ── Language rules context ─────────────────────────────────────────────
    interp_block = "\n".join(
        f'  "{col}": "{interp}"'
        for col, interp in domain.attribute_interpretations.items()
    )

    key_features = domain.column_decisions.get("key", [])
    keep_features = domain.column_decisions.get("keep", [])

    cleaning_note = ""
    if was_cleaned:
        cleaning_note = (
            f"The dataset was cleaned before this analysis. "
            f"Methods applied: {', '.join(domain.cleaning_methods)}. "
            + (f"Columns removed as analytically irrelevant: {', '.join(dropped_columns)}. " if dropped_columns else "")
        )
    else:
        cleaning_note = "The dataset was analyzed as provided without automated cleaning."

    # ── Stats context (rich but structured) ───────────────────────────────
    stats_context = {
        "dataset": {
            "rows":        stats.rowCount,
            "columns":     stats.columnCount,
            "domain":      domain.domain,
        },
        "key_features":    key_features,
        "support_features": keep_features,
        "numeric_statistics": stats.numericStats,
        "missing_pct":     {k: v for k, v in stats.missingPercentages.items() if v > 0},
        "categorical":     stats.categoricalSummaries,
        "pearson_correlations":  stats.topCorrelations,
        "spearman_correlations": stats.spearmanCorrelations,
        "outlier_pct_by_feature": stats.outlierSummary,
        "normality_tests": stats.normalityTests,
        "group_comparisons": stats.groupComparisons,
        "temporal":        stats.temporalInfo,
        "anomaly_scores":  stats.anomalyScores,
        "detected_quality_issues": stats.detectedIssues,
    }

    stats_json   = json.dumps(stats_context,  indent=2)
    focus_block  = "\n".join(f"  - {f}" for f in domain.analysis_focus)
    questions_block = "\n".join(f"  {i+1}. {q}" for i, q in enumerate(domain.key_questions))

    return f"""You are a managing partner at a world-class data analytics consultancy producing a formal report for a client board meeting. Your standard is publication quality — precise, evidence-backed, written in confident executive language.

DOMAIN: {domain.domain.upper()}
CLEANING STATUS: {cleaning_note}

═══════════════════════════════════════════════════
ATTRIBUTE VOCABULARY
═══════════════════════════════════════════════════
The following interpretations describe what each attribute represents in domain context.
Use these terms naturally in your writing — avoid raw technical column references like "the X column" or "variable Y".
Instead, use domain language: "annual reported revenue", "employee tenure", "quarterly throughput", etc.

{interp_block}

Suggested primary analytical features: {key_features}
Suggested contextual/grouping attributes: {keep_features}

These are informed starting points. If your analysis reveals stronger signals elsewhere in the data, use your judgement — you are not bound to these suggestions.

═══════════════════════════════════════════════════
ANALYSIS OBJECTIVES
═══════════════════════════════════════════════════
Focus areas identified for this dataset:
{focus_block}

Questions worth answering:
{questions_block}

═══════════════════════════════════════════════════
ENRICHED STATISTICAL DATA
═══════════════════════════════════════════════════
{stats_json}

═══════════════════════════════════════════════════
WRITING STANDARD
═══════════════════════════════════════════════════
Write as a senior analyst presenting in person to a board. The tone should be authoritative but not mechanical.
Findings should read as genuine analytical conclusions, not templates being filled in.

Good language looks like:
  "Average annual revenue across reporting entities stands at 4,200 NZD thousands — a figure that masks
   significant sectoral disparity, with manufacturing entities recording 34% above the median."

Avoid:
  - "The Revenue column has a mean of 4,200"
  - "Looking at the data, we can see..."
  - Generic openers and placeholder-style sentences

Where specific statistics support a finding, use them. Where the data is directional but not statistically precise,
say so honestly. Numbers are welcome when they add meaning — not required for their own sake.

═══════════════════════════════════════════════════
YOUR OUTPUT — respond ONLY with valid JSON
═══════════════════════════════════════════════════
{{
  "report_title": "<Specific title referencing domain and dataset scope — e.g. 'New Zealand Industrial Financial Performance Analysis 2013-2024'>",

  "introduction": "<2-4 sentences. Introduce what was examined, the analytical approach, and what the reader will find. Reference actual attributes and scope where relevant. Professional, not formulaic.>",

  "executive_summary": "<3-4 sentences. Lead with the most significant finding. Add 1-2 supporting takeaways. Close with the primary implication for decision-makers. Specific where the data supports it.>",

  "insights": [
    {{
      "rank": 1,
      "title": "<The finding as a declarative statement — e.g. 'Manufacturing Sector Commands 34% Premium Over Service Industries'>",
      "body": "<Analytical narrative for this finding. Explain what the pattern is, why it matters in the {domain.domain} context, and what it means for decision-makers. Use domain language, not column references. Bring in supporting numbers where they genuinely strengthen the point. Aim for depth over breadth.>",
      "insight_index": 1
    }},
    {{
      "rank": 2,
      "title": "...",
      "body": "...",
      "insight_index": 2
    }},
    {{
      "rank": 3,
      "title": "...",
      "body": "...",
      "insight_index": 3
    }},
    {{
      "rank": 4,
      "title": "...",
      "body": "...",
      "insight_index": 4
    }},
    {{
      "rank": 5,
      "title": "...",
      "body": "...",
      "insight_index": 5
    }}
  ],

  "chart_instructions": [
    {{
      "index": 1,
      "chart_type": "<see chart types below>",
      "chart_subtype": "<grouped | stacked | multi_line | '' — leave empty for simple charts>",
      "title": "<Descriptive chart title in domain language>",
      "x_column": "<EXACT column name, case-sensitive, or null>",
      "y_column": "<EXACT column name, or null>",
      "y_columns": ["<for multi-series charts: list of EXACT column names, or empty list>"],
      "group_column": "<for grouped/stacked: EXACT column name, or null>",
      "description": "<1-2 sentences on what this chart reveals and which insight it supports>",
      "insight_index": <integer matching the insight rank this chart supports>,
      "color": "<hex from: #3b82f6 #a855f7 #10b981 #f97316 #ec4899>"
    }}
  ],

  "data_quality_section": "<2-3 paragraphs. Characterize the dataset scope and quality. Describe what was found and what was done (or not done) about it. Close with an honest assessment of what this means for analytical confidence. Technical tone, scientific terminology where appropriate. Aim for 150-250 words.>",

  "gemini_confidence_score": <integer 1-10: honest self-assessment of analysis quality given data completeness, statistical significance of findings, and domain fit>,

  "confidence_note": "<1-2 sentences — brief, professional note on analytical reliability for the executive summary page.>",

  "conclusion": "<3-5 sentences. Synthesise the most important findings into a coherent narrative. Acknowledge the primary data limitation. Close with one actionable recommendation grounded in the evidence. Written as a professional conclusion, not a template.>"
}}

CHART RULES (these are structural requirements, not style guidance):
- Produce 3-5 charts. Quality over quantity.
- All column names MUST be EXACT matches (case-sensitive) from the data — no paraphrasing, no substitution.
- Available chart types and their required field usage:
    "bar"         → x=categorical column, y=numeric column
    "line"        → x=temporal/ordered column, y=numeric column — only if temporal data confirmed in stats
    "scatter"     → x=numeric column, y=numeric column
    "histogram"   → x=numeric column, y_column MUST be null
    "heatmap"     → x_column and y_column MUST both be null — full correlation matrix
    "box"         → x=categorical column, y=numeric column
    "grouped_bar" → x=categorical, y=numeric, group_column MUST be set to a categorical column
    "multi_line"  → x=temporal column, y_columns MUST be a list of numeric columns, group_column=null — only if temporal data confirmed
- heatmap and histogram never have y_column set — always null.
- grouped_bar requires group_column; multi_line requires y_columns list — do not leave these empty.
- Only use line/multi_line if temporal data is confirmed in the stats.
- Variety is preferred where the data supports it — if multiple findings could use bar charts, consider whether scatter, box, or histogram would communicate the finding better.

INSIGHT GUIDANCE:
- Produce up to 5 insights, ranked by analytical impact. Include fewer if the data does not support more.
- Each insight should address a distinct pattern or finding — no two insights covering the same underlying observation.
- If significant group differences, temporal trends, or strong correlations exist in the data, they are worth surfacing.
- Insights should build toward a coherent picture of the dataset, not a disconnected list of observations.
- Use specific figures where they genuinely strengthen the finding. Where the data is directional but not statistically precise, say so honestly.

Respond ONLY with JSON. No markdown code blocks. No text before or after the JSON.
"""


# ─────────────────────────────────────────────────────────────────────────────
# API call
# ─────────────────────────────────────────────────────────────────────────────

def call_gemini(
    stats: StatsSummary,
    domain: DomainResult,
    was_cleaned: bool,
    dropped_columns: List[str],
    api_key: str,
) -> LLMReport:
    """Phase 4: Insight agent + report writer. Returns full LLMReport."""
    prompt = _build_prompt(stats, domain, was_cleaned, dropped_columns)

    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature":     0.2,
            "maxOutputTokens": 8192,
            "topP":            0.9,
        },
    }).encode("utf-8")

    url = f"{GEMINI_API_URL}?key={api_key}"
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Gemini API {e.code}: {e.read().decode()}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Gemini connection failed: {e.reason}")

    try:
        text = raw["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Unexpected Gemini response format: {raw}")

    # Strip markdown fences
    text = re.sub(r"```(?:json)?", "", text).strip().strip("`").strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
        else:
            raise RuntimeError(f"Could not parse Gemini response as JSON:\n{text[:800]}")

    # ── Parse chart instructions ──────────────────────────────────────────
    chart_instructions: List[ChartInstruction] = []
    for i, c in enumerate(parsed.get("chart_instructions", [])):
        ct = c.get("chart_type", "bar").lower()
        if ct not in VALID_CHART_TYPES:
            ct = "bar"
        chart_instructions.append(ChartInstruction(
            index=c.get("index", i + 1),
            chartType=ct,
            title=c.get("title", f"Chart {i + 1}"),
            xColumn=c.get("x_column") or "",
            yColumn=c.get("y_column") or None,
            description=c.get("description", ""),
            insightIndex=c.get("insight_index", 1),
            color=CHART_COLORS[i % len(CHART_COLORS)],
            chartSubtype=c.get("chart_subtype") or "",
            groupColumn=c.get("group_column") or None,
            yColumns=c.get("y_columns") or [],
        ))

    # Gemini confidence score — clamp to 1-10
    g_score = int(parsed.get("gemini_confidence_score", 6))
    g_score = max(1, min(10, g_score))

    return LLMReport(
        reportTitle=parsed.get("report_title", "Dataset Insight Report"),
        introduction=parsed.get("introduction", ""),
        executiveSummary=parsed.get("executive_summary", ""),
        insights=parsed.get("insights", []),
        chartInstructions=chart_instructions,
        dataQualitySection=parsed.get("data_quality_section", ""),
        geminiConfidenceScore=g_score,
        confidenceNote=parsed.get("confidence_note", ""),
        conclusion=parsed.get("conclusion", ""),
        rawResponse=text,
    )
