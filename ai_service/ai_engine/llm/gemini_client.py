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
    # ── Standard customization ─────────────────────────────────────────────
    language: str = "en",
    tone: str = "professional",
    insights_count: int = 5,
    occasion: str = "general",
    # ── Deep customization (new) ───────────────────────────────────────────
    audience: str = "general",      # executive | technical | client | student | general
    depth: str = "standard",        # quick | standard | deep
    focus_on: str = "",             # free text: "focus on revenue vs cost comparison"
    comparisons: str = "",          # free text: "compare male vs female" / "Q1 vs Q2"
    must_mention: Optional[List[str]] = None,   # topics/columns that MUST be addressed
    chart_style: str = "mixed",     # mixed | bar-heavy | trend | distribution | comparison
    include_methodology: bool = True,
    include_confidence: bool = True,
) -> str:
    """
    Build the Gemini prompt. Every customization parameter genuinely reshapes
    the output — persona, structure, analytical focus, and chart preferences
    all change based on the user's choices, not just style notes appended at the end.
    """

    # ── Language ──────────────────────────────────────────────────────────
    LANGUAGE_NAMES = {
        "en": "English", "fr": "French", "es": "Spanish",
        "de": "German",  "zh": "Simplified Chinese",
        "ar": "Arabic",  "pt": "Portuguese", "fa": "Persian (Farsi)",
    }
    lang_name = LANGUAGE_NAMES.get(language, "English")

    # ── Persona — the "You are..." line changes entirely based on audience + tone ──
    # This is the most important customization: the model's entire framing
    # comes from this sentence, so it must reflect the real reading context.
    PERSONAS = {
        # audience → (professional, technical, casual/storytelling, academic, simplified)
        "executive": {
            "professional":   "You are the Chief Analytics Officer presenting to the C-suite. Every insight must be decision-ready, tied to business impact, and expressed in KPI language. Short. Sharp. No padding.",
            "technical":      "You are a data science lead briefing an executive team. Lead with business conclusions, then back them with statistics. Assume executives can handle numbers but not methodology jargon.",
            "casual":         "You are a trusted advisor walking an executive through the key takeaways over lunch. Clear, direct, no fluff.",
            "storytelling":   "You are a strategic advisor telling the story of what this data reveals to senior leadership. Each insight is a chapter in the business narrative.",
            "academic":       "You are a research director presenting evidence-based findings to a board. Maintain rigor while keeping conclusions actionable.",
            "simplified":     "You are explaining the most important data findings to a busy executive who needs the headline in 10 seconds.",
        },
        "technical": {
            "professional":   "You are a senior data scientist writing a formal analytical report for a technical team. Include statistical evidence, methodology details, and precise numerical claims.",
            "technical":      "You are a lead analyst writing for a team of data scientists. Include p-values, confidence intervals, effect sizes, and test names where relevant. Assume a high statistical literacy in the reader.",
            "casual":         "You are a data scientist sharing findings with colleagues over Slack. Technically precise but conversational — you can use shorthand your team understands.",
            "storytelling":   "You are a data engineer narrating a technical investigation. Walk the reader through what you found and how, building the case step by step.",
            "academic":       "You are a researcher documenting methodology and findings for a technical audience. Reference statistical tests by name. Use hedged language where appropriate.",
            "simplified":     "You are a technical analyst explaining findings to a mixed technical/non-technical team. Lead with the finding, then optionally add the supporting statistic.",
        },
        "client": {
            "professional":   "You are a senior consultant producing a polished deliverable for an external client. Professional, client-ready, focused on value delivered. No internal jargon.",
            "technical":      "You are a consulting analyst producing a detailed technical report for a client's data team. Precise and complete — they will verify your numbers.",
            "casual":         "You are a friendly consultant wrapping up a project with a client. Approachable, clear, focused on what matters to them.",
            "storytelling":   "You are a consulting storyteller turning data into a client narrative. The story starts with the client's problem and ends with an evidence-backed answer.",
            "academic":       "You are a research consultant producing a rigorous evidence report for a client. Cite your statistical reasoning.",
            "simplified":     "You are making your analysis accessible to a non-technical client. Every finding has a plain-English explanation of what it means for them.",
        },
        "student": {
            "professional":   "You are a data analysis instructor writing a model report for students to learn from. Show good analytical practice — clear titles, evidence-backed claims, domain language.",
            "technical":      "You are a professor writing a technical analysis that students can learn methodology from. Name the statistical tests and explain what each one tells us.",
            "casual":         "You are a teaching assistant explaining a dataset to students. Friendly, encouraging, clear. Explain what each finding means in plain terms.",
            "storytelling":   "You are a data science teacher walking students through an analysis as a narrative. Build curiosity: start with the question, then reveal the answer.",
            "academic":       "You are writing a model academic analysis for data science students. Follow academic convention: hypothesis → evidence → conclusion.",
            "simplified":     "You are explaining a data analysis to students who are new to the field. Define terms as you go. Keep each finding to one clear idea.",
        },
        "general": {
            "professional":   "You are a managing partner at a world-class analytics consultancy producing a formal report. Your standard is publication quality — precise, evidence-backed, confident executive language.",
            "technical":      "You are a senior data analyst producing a rigorous technical report. Include statistical evidence throughout. Assume a data-literate reader.",
            "casual":         "You are an experienced analyst explaining findings to a smart but non-specialist reader. Friendly, clear, no unnecessary jargon.",
            "storytelling":   "You are a data journalist turning analytical findings into a compelling story. Each insight advances the narrative. Numbers serve the story.",
            "academic":       "You are a research analyst producing an evidence-based report. Frame findings with academic rigor and precise statistical references.",
            "simplified":     "You are making a complex dataset accessible. Plain language. Short sentences. Translate every number into a human meaning.",
        },
    }

    # Map tone aliases
    TONE_MAP = {
        "executive": "professional",
        "board":     "professional",
        "friendly":  "casual",
        "story":     "storytelling",
        "plain":     "simplified",
        "simple":    "simplified",
    }
    tone_key = TONE_MAP.get(tone, tone)
    persona_map = PERSONAS.get(audience, PERSONAS["general"])
    persona = persona_map.get(tone_key, persona_map.get("professional",
        "You are a senior analyst producing a high-quality data report."))

    # ── Occasion framing — shapes the purpose of the report ───────────────
    OCCASION_FRAMING = {
        "general":   "General analytical report.",
        "investor":  "This report will be seen by investors. Every finding should connect to growth, risk, or ROI. Business impact is the lens.",
        "academic":  "This is an academic/research report. Reference statistical tests by name. The methodology section should be rigorous enough to appear in a published paper.",
        "internal":  "This is an internal team review. Be candid about data limitations. Flag issues that need follow-up. Skip the marketing language.",
        "client":    "This is a client-facing deliverable. Polished, confident, focused on the value the analysis provides. No internal jargon or caveats that undermine confidence.",
    }
    occasion_note = OCCASION_FRAMING.get(occasion, OCCASION_FRAMING["general"])

    # ── Depth settings — controls output volume and detail ─────────────────
    DEPTH_SETTINGS = {
        "quick":    {"max_insights": min(insights_count, 3), "max_charts": 3,
                     "summary_style": "1-2 sentences. The single most important takeaway.",
                     "intro_style":   "1-2 sentences. What this dataset is and the top finding.",
                     "body_style":    "2-3 sentences per insight. Tight. Lead with the number.",
                     "conclusion_style": "2-3 sentences. One recommendation.",
                     "methodology_note": "Omit the data_quality_section — set it to an empty string ''."},
        "standard": {"max_insights": insights_count, "max_charts": 5,
                     "summary_style": "3-4 sentences. Lead with the most significant finding, 1-2 supporting takeaways, one implication.",
                     "intro_style":   "2-4 sentences. Dataset context and analytical approach.",
                     "body_style":    "1 paragraph (4-6 sentences) per insight. Evidence + implication.",
                     "conclusion_style": "3-5 sentences. Synthesise findings, acknowledge limitation, one actionable recommendation.",
                     "methodology_note": "Include a 2-3 paragraph data_quality_section."},
        "deep":     {"max_insights": max(insights_count, 7), "max_charts": 7,
                     "summary_style": "4-5 sentences. Cover the most significant finding, supporting evidence, and strategic implications.",
                     "intro_style":   "3-5 sentences. Full dataset context, analytical pipeline description, scope.",
                     "body_style":    "2 paragraphs per insight. First paragraph: the finding with evidence. Second paragraph: implications, caveats, related patterns.",
                     "conclusion_style": "5-7 sentences. Comprehensive synthesis, data limitations, 2-3 actionable recommendations.",
                     "methodology_note": "Include a thorough data_quality_section (300-400 words): dataset profile, missing data, cleaning performed, statistical methods used, known limitations, confidence assessment."},
    }
    d = DEPTH_SETTINGS.get(depth, DEPTH_SETTINGS["standard"])
    actual_insights_count = d["max_insights"]

    # ── Chart style guidance ───────────────────────────────────────────────
    CHART_STYLE_GUIDANCE = {
        "mixed":        "Use a variety of chart types. Match the chart type to the finding type: bar for categories, scatter for relationships, histogram for distributions, box for group comparisons, line only if temporal.",
        "bar-heavy":    "Prefer bar charts and grouped bar charts for all comparisons. Use grouped_bar whenever comparing a numeric metric across two categorical groupings. Only use other types if bar charts genuinely cannot represent the finding.",
        "trend":        "Prioritise temporal patterns. Use line charts and multi_line charts wherever time-ordered data exists. If no temporal data is confirmed, use scatter to show numeric relationships and progression.",
        "distribution": "Focus on how values are distributed. Prefer histogram for numeric distributions, box plots for group comparisons, scatter for bivariate relationships. Use bar only if distribution charts cannot capture the finding.",
        "comparison":   "Every chart should compare something against something else. Prefer grouped_bar for multi-category comparison, box for distribution comparison across groups, scatter for two-variable comparison. Avoid single-series charts.",
    }
    chart_guidance = CHART_STYLE_GUIDANCE.get(chart_style, CHART_STYLE_GUIDANCE["mixed"])

    # ── Writing standard — changes completely based on tone ────────────────
    WRITING_STANDARDS = {
        "professional": """Write as a senior analyst presenting in person to a board. Authoritative but not mechanical.
Findings should read as genuine analytical conclusions, not templates.

Good: "Average annual revenue across entities stands at 4,200 NZD thousands — a figure that masks significant sectoral disparity, with manufacturing recording 34% above the median."
Avoid: "The Revenue column has a mean of 4,200" / "Looking at the data, we can see..."

Use specific statistics where they strengthen a finding. Where the data is directional but not statistically precise, say so honestly.""",

        "technical": """Write for a data-literate audience. Precision is the priority.
Include statistical details: reference test names (Pearson r, Shapiro-Wilk, IQR), cite exact values, report significance where available.

Good: "A Pearson correlation of r=0.82 (p<0.01) between tenure and performance score suggests a strong positive relationship — though the relationship is non-linear above 5 years, as evidenced by the Spearman rho of 0.71."
Avoid vague language: "there appears to be a relationship" — either it is or it isn't, and you have the numbers.

Every finding should be traceable back to a specific statistic from the data.""",

        "casual": """Write like a smart friend explaining something interesting. No jargon. Short sentences. Active voice.

Good: "The interesting thing here is that sales didn't actually peak in summer — they peaked in October. That's backwards from what you'd expect, and it's consistent across all three years."
Avoid corporate language: "it is noteworthy that", "the data suggests", "as evidenced by the foregoing analysis"

If a number is needed, round it. If a concept needs explaining, explain it in one sentence. The goal is that someone who's never looked at a dataset can follow every insight.""",

        "storytelling": """Build a narrative. The data tells a story — your job is to find it and tell it compellingly.

The executive summary is the trailer. Each insight is a scene. The conclusion is the resolution.
Use contrast and tension: "Everyone assumed X. The data says Y." Lead with the surprising finding.
Numbers are supporting evidence, not the subject of the sentence.

Good: "For three consecutive years, Q3 was the growth engine. Then 2022 happened — and Q3 collapsed while Q1, historically the weakest quarter, quietly became the strongest. Something structural changed."
Avoid: "Q3 revenue declined by 23% in 2022 while Q1 increased by 15%." (True, but not a story.)""",

        "academic": """Write with academic rigor. Findings must be supported by statistical evidence. Use hedged language where appropriate.

Reference tests by name. Report test statistics and significance. Distinguish between correlation and causation explicitly.
The methodology section is not an afterthought — it establishes the credibility of every subsequent claim.

Good: "A statistically significant negative correlation was observed between employee tenure and reported absenteeism (Pearson r = −0.61, p < 0.001, n = 847), consistent with the hypothesis that organizational embeddedness reduces absence behavior."
Avoid assertions without evidence. Every claim should trace back to a specific statistic.""",

        "simplified": """Use plain English. One idea per sentence. No acronyms, no jargon, no statistical terms without explanation.

Good: "Employees who have been with the company longer tend to miss fewer days. This is a strong pattern — it's consistent across every department in the dataset."
Avoid: "Longitudinal tenure exhibits a statistically significant inverse relationship with absenteeism metrics."

If you must use a technical term (like 'correlation'), add one plain-English sentence right after explaining what it means.
Every insight should end with a sentence starting 'In plain terms:' that summarises what this means for a non-technical reader.""",
    }
    writing_std = WRITING_STANDARDS.get(tone_key, WRITING_STANDARDS["professional"])

    # ── Attribute vocabulary block ─────────────────────────────────────────
    interp_block = "\n".join(
        f'  "{col}": "{interp}"'
        for col, interp in domain.attribute_interpretations.items()
    )
    key_features  = domain.column_decisions.get("key",  [])
    keep_features = domain.column_decisions.get("keep", [])

    # ── Cleaning note ──────────────────────────────────────────────────────
    if was_cleaned:
        cleaning_note = (
            f"Dataset was cleaned before analysis. "
            f"Methods: {', '.join(domain.cleaning_methods)}. "
            + (f"Dropped columns: {', '.join(dropped_columns)}. " if dropped_columns else "")
        )
    else:
        cleaning_note = "Dataset analyzed as provided, without automated cleaning."

    # ── Stats context ──────────────────────────────────────────────────────
    stats_context = {
        "dataset":              {"rows": stats.rowCount, "columns": stats.columnCount, "domain": domain.domain},
        "key_features":         key_features,
        "support_features":     keep_features,
        "numeric_statistics":   stats.numericStats,
        "missing_pct":          {k: v for k, v in stats.missingPercentages.items() if v > 0},
        "categorical":          stats.categoricalSummaries,
        "pearson_correlations": stats.topCorrelations,
        "spearman_correlations":stats.spearmanCorrelations,
        "outlier_pct":          stats.outlierSummary,
        "normality_tests":      stats.normalityTests,
        "group_comparisons":    stats.groupComparisons,
        "temporal":             stats.temporalInfo,
        "anomaly_scores":       stats.anomalyScores,
        "quality_issues":       stats.detectedIssues,
    }
    stats_json      = json.dumps(stats_context, indent=2)
    focus_block     = "\n".join(f"  - {f}" for f in domain.analysis_focus)
    questions_block = "\n".join(f"  {i+1}. {q}" for i, q in enumerate(domain.key_questions))

    # ── User directives block — highest priority in the prompt ─────────────
    # These override the model's autonomous analytical choices.
    user_directives_lines = []
    if focus_on and focus_on.strip():
        user_directives_lines.append(f"FOCUS ON:        {focus_on.strip()}")
        user_directives_lines.append("  → This is the primary analytical lens. Shape insights around this directive first.")
    if comparisons and comparisons.strip():
        user_directives_lines.append(f"COMPARE:         {comparisons.strip()}")
        user_directives_lines.append("  → At least one insight AND one chart must directly address this comparison.")
    if must_mention:
        items = [m.strip() for m in must_mention if m.strip()]
        if items:
            user_directives_lines.append(f"MUST MENTION:    {', '.join(items)}")
            user_directives_lines.append("  → Every item in this list must appear meaningfully in at least one insight or the conclusion.")

    user_directives_block = ""
    if user_directives_lines:
        directives_text = "\n".join(user_directives_lines)
        user_directives_block = f"""
⚑ USER DIRECTIVES — HIGHEST PRIORITY, FOLLOW THESE EXACTLY BEFORE ANYTHING ELSE
══════════════════════════════════════════════════════════════════════════════════
{directives_text}
══════════════════════════════════════════════════════════════════════════════════
These directives take precedence over domain defaults, suggested features, and analytical focus areas.
"""

    # ── Build insight JSON slots ───────────────────────────────────────────
    insight_body_guidance = d["body_style"]
    first_insight = (
        f'    {{\n      "rank": 1,\n'
        f'      "title": "<Declarative statement of the finding — e.g. \'Sales Peak in October, Not Summer, Across All Three Years\'>",\n'
        f'      "body": "<{insight_body_guidance}>",\n'
        f'      "insight_index": 1\n    }}{"," if actual_insights_count > 1 else ""}'
    )
    remaining_slots = "\n".join(
        f'    {{\n      "rank": {i+1},\n      "title": "...",\n      "body": "...",\n      "insight_index": {i+1}\n    }}{"," if i < actual_insights_count - 1 else ""}'
        for i in range(1, actual_insights_count)
    )
    insight_slots = first_insight + ("\n" + remaining_slots if remaining_slots else "")

    # ── Methodology section instruction ───────────────────────────────────
    if not include_methodology or depth == "quick":
        methodology_instruction = '  "data_quality_section": "",'
    else:
        methodology_instruction = f'  "data_quality_section": "<{d["methodology_note"]}>",\n  // Aim for the depth described above — this section establishes analytical credibility.,'

    # ── Confidence score instruction ───────────────────────────────────────
    if not include_confidence:
        confidence_instructions = (
            '  "gemini_confidence_score": 7,\n'
            '  "confidence_note": "",'
        )
    else:
        confidence_instructions = (
            '  "gemini_confidence_score": <integer 1-10: honest self-assessment — data completeness, statistical significance, domain fit>,\n'
            '  "confidence_note": "<1-2 sentences — brief note on analytical reliability.>",'
        )

    return f"""{persona}

Write the entire report in {lang_name}. Every word — titles, body text, insights, conclusions, field values — must be in {lang_name}.
{user_directives_block}
CONTEXT: {domain.domain.upper()} dataset | {cleaning_note}
PURPOSE: {occasion_note}

═══════════════════════════════════════════════════
ATTRIBUTE VOCABULARY — use these terms, never raw column names
═══════════════════════════════════════════════════
{interp_block}

Suggested primary analytical features: {key_features}
Suggested contextual/grouping attributes: {keep_features}
(These are starting points. Your analytical judgement takes precedence.)

═══════════════════════════════════════════════════
ANALYSIS OBJECTIVES
═══════════════════════════════════════════════════
Domain focus areas:
{focus_block}

Key questions to answer:
{questions_block}

═══════════════════════════════════════════════════
ENRICHED STATISTICAL DATA
═══════════════════════════════════════════════════
{stats_json}

═══════════════════════════════════════════════════
WRITING STANDARD — follow this exactly for every sentence
═══════════════════════════════════════════════════
{writing_std}

═══════════════════════════════════════════════════
YOUR OUTPUT — respond ONLY with valid JSON
═══════════════════════════════════════════════════
{{
  "report_title": "<Specific title — name the domain, scope, and timeframe where available>",

  "introduction": "<{d["intro_style"]}>",

  "executive_summary": "<{d["summary_style"]}>",

  "insights": [
{insight_slots}
  ],

  "chart_instructions": [
    {{
      "index": 1,
      "chart_type": "<see CHART RULES below>",
      "chart_subtype": "<grouped | stacked | multi_line | '' — only for multi-series charts>",
      "title": "<Chart title in domain language — describes what the chart shows>",
      "x_column": "<EXACT column name, case-sensitive — or null>",
      "y_column": "<EXACT column name — or null>",
      "y_columns": ["<for multi-series: list of EXACT column names, or empty list>"],
      "group_column": "<for grouped/stacked: EXACT column name — or null>",
      "description": "<1-2 sentences: what this chart reveals and which insight it supports>",
      "insight_index": <integer matching the insight rank this chart illustrates>,
      "color": "<hex from: #3b82f6 #a855f7 #10b981 #f97316 #ec4899>"
    }}
  ],

  {methodology_instruction}

  {confidence_instructions}

  "conclusion": "<{d["conclusion_style"]}>"
}}

CHART RULES — structural requirements:
- Produce {d["max_charts"]} charts maximum. Quality over quantity.
- Chart style preference: {chart_guidance}
- All column names MUST be EXACT case-sensitive matches from the data — no paraphrasing.
- Chart type field requirements:
    "bar"         → x=categorical, y=numeric
    "line"        → x=temporal/ordered, y=numeric — ONLY if temporal data confirmed in stats
    "scatter"     → x=numeric, y=numeric
    "histogram"   → x=numeric, y_column MUST be null
    "heatmap"     → x_column AND y_column MUST both be null
    "box"         → x=categorical, y=numeric
    "grouped_bar" → x=categorical, y=numeric, group_column MUST be a categorical column
    "multi_line"  → x=temporal, y_columns=list of numeric columns — ONLY if temporal data confirmed
- heatmap and histogram: y_column is always null.
- grouped_bar: group_column is required. multi_line: y_columns list is required.
- line/multi_line: only valid if temporal data appears in the stats.

INSIGHT RULES:
- Produce exactly {actual_insights_count} insights.
- Each insight covers a distinct pattern — no overlap in underlying observation.
- Rank by analytical impact: most important finding is rank 1.
- Surface group differences, temporal trends, or strong correlations if they exist.
- If USER DIRECTIVES were given above, at least one insight must directly address them.
- Use specific figures where they strengthen the finding. If data is directional but imprecise, say so.

Respond ONLY with JSON. No markdown. No text before or after the JSON object.
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
    language: str = "en",
    tone: str = "professional",
    insights_count: int = 5,
    occasion: str = "general",
    audience: str = "general",
    depth: str = "standard",
    focus_on: str = "",
    comparisons: str = "",
    must_mention: Optional[List[str]] = None,
    chart_style: str = "mixed",
    include_methodology: bool = True,
    include_confidence: bool = True,
) -> LLMReport:
    """
    Phase 5: Insight agent + report writer. Returns full LLMReport.

    Standard customization:
      language         — en/fr/es/de/zh/ar/pt/fa
      tone             — professional/technical/casual/storytelling/academic/simplified
      insights_count   — 3/5/7
      occasion         — general/investor/academic/internal/client

    Deep customization (Pro):
      audience         — general/executive/technical/client/student
      depth            — quick/standard/deep
      focus_on         — free text analytical directive ("focus on revenue vs cost")
      comparisons      — specific comparison directive ("compare male vs female")
      must_mention     — list of topics/columns that must appear in insights
      chart_style      — mixed/bar-heavy/trend/distribution/comparison
      include_methodology / include_confidence — section toggles

    Never raises — returns a stats-only fallback on any failure.
    """
    prompt = _build_prompt(
        stats, domain, was_cleaned, dropped_columns,
        language=language, tone=tone,
        insights_count=insights_count, occasion=occasion,
        audience=audience, depth=depth,
        focus_on=focus_on, comparisons=comparisons,
        must_mention=must_mention, chart_style=chart_style,
        include_methodology=include_methodology,
        include_confidence=include_confidence,
    )

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
