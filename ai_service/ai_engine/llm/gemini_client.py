"""
Gemini 2.5 Flash Client  —  Phase 4 + Report Writing

One comprehensive call that:
  1. Receives full enriched stats + Groq domain context + attribute interpretations
  2. Writes boardroom-quality narrative (NEVER column language — always domain attributes)
  3. Generates up to 5 ranked insights with specific, cited evidence
  4. Specifies chart instructions (type / X / Y / placement) — charts NOT generated here
  5. Writes a 2-3 paragraph Data Quality & Methodology section
  6. Assigns its own confidence score 1-10 (later reviewed by Groq judge)

Reliability guarantee: if Gemini fails for any reason (429, timeout, safety block,
bad JSON), a fallback stats-only report is returned instead of raising — so the
pipeline always produces a PDF.
"""

import json
import re
import time
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
# Fallback report — used when Gemini is unavailable
# ─────────────────────────────────────────────────────────────────────────────

def _build_fallback_report(stats: StatsSummary, domain: DomainResult) -> LLMReport:
    """
    Stats-only minimal report. Used when Gemini fails after all retries
    (rate limit, safety block, network error, bad JSON).
    Ensures the pipeline always produces a PDF rather than returning an error.
    Confidence score is set to 4 to signal reduced analytical depth.
    """
    insights = []

    # Insight 1: Dataset scope
    insights.append({
        "rank": 1,
        "title": f"Dataset Overview: {stats.rowCount:,} Records Across {stats.columnCount} Attributes",
        "body": (
            f"This {domain.domain} dataset comprises {stats.rowCount:,} records and "
            f"{stats.columnCount} attributes. Automated statistical processing completed successfully. "
            f"AI-powered narrative interpretation was unavailable for this run due to service constraints — "
            f"statistical outputs are presented directly."
        ),
        "insight_index": 1,
    })

    # Insight 2: Top correlation if available
    if stats.topCorrelations:
        corr = stats.topCorrelations[0]
        col1 = corr.get("col1", "a key variable")
        col2 = corr.get("col2", "a related measure")
        r_val = corr.get("correlation", 0)
        insights.append({
            "rank": 2,
            "title": "Significant Statistical Relationship Identified",
            "body": (
                f"Correlation analysis identified a notable relationship between {col1} and {col2} "
                f"(Pearson r = {r_val:.2f}). "
                f"This association warrants further investigation to determine its practical significance "
                f"within the {domain.domain} context."
            ),
            "insight_index": 2,
        })

    # Insight 3: Missing data warning if meaningful
    significant_missing = {k: v for k, v in stats.missingPercentages.items() if v > 5}
    if significant_missing:
        worst_col, worst_pct = max(significant_missing.items(), key=lambda x: x[1])
        insights.append({
            "rank": 3,
            "title": "Data Completeness Limitations Identified",
            "body": (
                f"{len(significant_missing)} attribute(s) exhibit meaningful missing data. "
                f"The most affected attribute — {worst_col} — is missing in {worst_pct:.1f}% of records. "
                f"Findings derived from these attributes should be interpreted with appropriate caution."
            ),
            "insight_index": 3,
        })

    # Insight 4: Outliers if detected
    if stats.outlierSummary:
        high_outlier = max(stats.outlierSummary.items(), key=lambda x: x[1], default=None)
        if high_outlier and high_outlier[1] > 2:
            insights.append({
                "rank": 4,
                "title": "Outlier Concentrations Detected in Key Attributes",
                "body": (
                    f"Statistical outlier detection flagged elevated anomaly rates in {len(stats.outlierSummary)} attribute(s). "
                    f"The highest concentration is observed in {high_outlier[0]} at {high_outlier[1]:.1f}% of records. "
                    f"These values may represent genuine extremes or data entry anomalies — manual review is recommended."
                ),
                "insight_index": 4,
            })

    # Build basic chart instructions from available columns
    numeric_cols = list(stats.numericStats.keys()) if stats.numericStats else []
    cat_cols = list(stats.categoricalSummaries.keys()) if stats.categoricalSummaries else []

    chart_instructions: List[ChartInstruction] = []
    chart_idx = 1

    if numeric_cols:
        chart_instructions.append(ChartInstruction(
            index=chart_idx,
            chartType="histogram",
            title=f"Distribution: {numeric_cols[0]}",
            xColumn=numeric_cols[0],
            yColumn=None,
            description=f"Frequency distribution of the primary numeric attribute.",
            insightIndex=1,
            color=CHART_COLORS[0],
            chartSubtype="",
            groupColumn=None,
            yColumns=[],
        ))
        chart_idx += 1

    if len(numeric_cols) >= 2:
        chart_instructions.append(ChartInstruction(
            index=chart_idx,
            chartType="scatter",
            title=f"{numeric_cols[0]} vs {numeric_cols[1]}",
            xColumn=numeric_cols[0],
            yColumn=numeric_cols[1],
            description=f"Relationship between the two primary numeric attributes.",
            insightIndex=2 if len(insights) >= 2 else 1,
            color=CHART_COLORS[1],
            chartSubtype="",
            groupColumn=None,
            yColumns=[],
        ))
        chart_idx += 1

    if cat_cols and numeric_cols:
        chart_instructions.append(ChartInstruction(
            index=chart_idx,
            chartType="bar",
            title=f"{numeric_cols[0]} by {cat_cols[0]}",
            xColumn=cat_cols[0],
            yColumn=numeric_cols[0],
            description=f"Average {numeric_cols[0]} broken down by {cat_cols[0]}.",
            insightIndex=1,
            color=CHART_COLORS[2],
            chartSubtype="",
            groupColumn=None,
            yColumns=[],
        ))
        chart_idx += 1

    missing_count = len([k for k, v in stats.missingPercentages.items() if v > 0])
    quality_note = (
        f"The dataset contains {stats.rowCount:,} rows and {stats.columnCount} columns. "
        + (f"{missing_count} attribute(s) contain missing values. " if missing_count else "No missing values were detected. ")
        + "Standard statistical quality checks were performed. Results reflect the data as provided."
    )

    return LLMReport(
        reportTitle=f"{domain.domain.title()} Dataset Statistical Analysis",
        introduction=(
            f"This report presents automated statistical analysis of a {domain.domain} dataset "
            f"comprising {stats.rowCount:,} records across {stats.columnCount} attributes. "
            f"Statistical processing completed successfully. AI narrative interpretation was "
            f"unavailable for this run; quantitative findings are presented directly."
        ),
        executiveSummary=(
            f"Statistical processing of the {domain.domain} dataset completed across all {stats.columnCount} attributes. "
            + (f"Correlation analysis identified {len(stats.topCorrelations)} notable relationships between attributes. " if stats.topCorrelations else "")
            + f"Manual review of the outputs is recommended to draw domain-specific conclusions."
        ),
        insights=insights,
        chartInstructions=chart_instructions,
        dataQualitySection=quality_note,
        geminiConfidenceScore=4,
        confidenceNote=(
            "This report was generated using statistical computation only. "
            "AI-powered narrative interpretation was unavailable for this run — "
            "confidence is reduced accordingly."
        ),
        conclusion=(
            f"Statistical analysis of the {domain.domain} dataset has been completed successfully. "
            f"The outputs reflect automated computation from the provided data. "
            f"For comprehensive AI-assisted insights and executive narrative, "
            f"re-running the analysis when service availability is restored is recommended."
        ),
        rawResponse="[fallback report — Gemini service unavailable]",
    )


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
    """
    Phase 4: Insight agent + report writer. Returns full LLMReport.

    Never raises — on any failure (429, timeout, safety block, bad JSON)
    returns a stats-only fallback report so the pipeline always produces a PDF.
    """
    prompt = _build_prompt(stats, domain, was_cleaned, dropped_columns)

    payload_dict = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature":     0.2,
            "maxOutputTokens": 8192,
            "topP":            0.9,
        },
    }

    url = f"{GEMINI_API_URL}?key={api_key}"

    MAX_RETRIES = 3
    RETRY_DELAYS = [8, 15]        # seconds between attempts (only 2 gaps for 3 tries)
    TIMEOUT_SECS = 90             # per-attempt timeout — fail fast, use fallback
    raw = None
    last_error = None

    for attempt in range(MAX_RETRIES):
        print(f"[Gemini] Calling API (attempt {attempt + 1}/{MAX_RETRIES})...", flush=True)
        payload = json.dumps(payload_dict).encode("utf-8")
        req = urllib.request.Request(
            url, data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent":   "Mozilla/5.0 (compatible; DIG-AI/1.0)",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
            print(f"[Gemini] Response received OK", flush=True)
            break  # success — exit retry loop

        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode()
            except Exception:
                pass
            last_error = f"Gemini HTTP {e.code}: {body[:200]}"
            print(f"[Gemini] HTTP {e.code}: {body[:120]}", flush=True)

            if e.code in (429, 503) and attempt < MAX_RETRIES - 1:
                wait = RETRY_DELAYS[attempt]
                print(f"[Gemini] Waiting {wait}s before retry...", flush=True)
                time.sleep(wait)
                continue
            # Non-retriable HTTP error or exhausted retries
            break

        except urllib.error.URLError as e:
            last_error = f"Gemini connection error: {e.reason}"
            print(f"[Gemini] URLError: {e.reason}", flush=True)
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_DELAYS[attempt]
                print(f"[Gemini] Waiting {wait}s before retry...", flush=True)
                time.sleep(wait)
                continue
            break

        except Exception as e:
            last_error = f"Gemini unexpected error: {e}"
            print(f"[Gemini] Unexpected error: {e}", flush=True)
            break

    # ── All retries exhausted or non-retriable error ───────────────────────
    if raw is None:
        print(f"[Gemini] Failed after {MAX_RETRIES} attempts: {last_error} — using fallback report")
        return _build_fallback_report(stats, domain)

    # ── Safety block: empty candidates array ──────────────────────────────
    candidates = raw.get("candidates", [])
    if not candidates:
        block_reason = raw.get("promptFeedback", {}).get("blockReason", "unknown")
        print(f"[Gemini] Empty candidates — blockReason: {block_reason} — using fallback report")
        return _build_fallback_report(stats, domain)

    # ── Extract text from first candidate ─────────────────────────────────
    try:
        candidate = candidates[0]
        finish_reason = candidate.get("finishReason", "STOP")
        if finish_reason not in ("STOP", "MAX_TOKENS"):
            print(f"[Gemini] Unexpected finishReason: {finish_reason} — using fallback report")
            return _build_fallback_report(stats, domain)
        text = candidate["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        print(f"[Gemini] Could not extract text from candidate: {e} — using fallback report")
        return _build_fallback_report(stats, domain)

    # ── Strip markdown fences ─────────────────────────────────────────────
    text = re.sub(r"```(?:json)?", "", text).strip().strip("`").strip()

    # ── Parse JSON ────────────────────────────────────────────────────────
    parsed = None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group())
            except json.JSONDecodeError:
                pass

    if parsed is None:
        print(f"[Gemini] JSON parse failed — using fallback report. Raw (first 400): {text[:400]}")
        return _build_fallback_report(stats, domain)

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

    # If Gemini returned no chart instructions, build basic fallback charts
    if not chart_instructions:
        print("[Gemini] No chart instructions in response — building basic fallback charts")
        fallback = _build_fallback_report(stats, domain)
        chart_instructions = fallback.chartInstructions

    # Gemini confidence score — clamp to 1-10
    g_score = parsed.get("gemini_confidence_score", 6)
    try:
        g_score = int(g_score)
    except (TypeError, ValueError):
        g_score = 6
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
