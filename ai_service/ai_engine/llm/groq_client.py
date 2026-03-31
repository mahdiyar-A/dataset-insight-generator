"""
Groq LLM Client  —  Phase 1 (Domain Gate) and Phase 6 (Judge)

Phase 1  →  detect_domain(df, api_key)
  Receives a rich dataset fingerprint (column names, types, sample values,
  basic stats). Returns:
    - Domain classification
    - Column decisions: drop / keep / key  (3 buckets)
    - Attribute interpretations for every kept/key column
    - Cleaning directives (general + column-specific methods)

Phase 6  →  judge_insights(report_json, chart_instructions, stats, domain, api_key)
  Reviews the full Gemini JSON report. Returns:
    - Corrected insights (if any used "column" language or were imprecise)
    - Corrected chart instructions (variety, correct X/Y, sensible placement)
    - Refined conclusion paragraph
    - Confidence score 1-10
    - Judge statement
"""

import json
import re
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional

import pandas as pd

from ai_engine.models.models import DomainResult, JudgeResult, StatsSummary


GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def _groq_call(messages: List[Dict], api_key: str,
               max_tokens: int = 1200, temperature: float = 0.1) -> str:
    payload = json.dumps({
        "model":       GROQ_MODEL,
        "messages":    messages,
        "temperature": temperature,
        "max_tokens":  max_tokens,
    }).encode("utf-8")

    req = urllib.request.Request(
        GROQ_API_URL, data=payload,
        headers={
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent":    "Mozilla/5.0 (compatible; DIG-AI/1.0)",
            "Accept":        "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Groq API {e.code}: {e.read().decode()}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Groq connection failed: {e.reason}")

    try:
        return raw["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Unexpected Groq response: {raw}")


def _parse_json(text: str) -> Dict:
    text = re.sub(r"```(?:json)?", "", text).strip().strip("`").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise RuntimeError(f"Could not parse JSON from Groq response:\n{text[:500]}")


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 — Domain Gate
# ─────────────────────────────────────────────────────────────────────────────

def _build_fingerprint(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Build a rich, compact fingerprint of the dataset so Groq can make
    intelligent column-level decisions without seeing the raw data.
    """
    fingerprint: Dict[str, Any] = {
        "rows":    len(df),
        "columns": len(df.columns),
        "column_detail": [],
    }

    for col in df.columns:
        dtype   = str(df[col].dtype)
        missing = round(float(df[col].isnull().mean() * 100), 1)
        n_unique = int(df[col].nunique(dropna=True))

        # Sample values — first 5 non-null, cast to str for JSON safety
        sample_vals = (
            df[col].dropna()
                   .head(5)
                   .astype(str)
                   .tolist()
        )

        col_info: Dict[str, Any] = {
            "name":         col,
            "dtype":        dtype,
            "missing_pct":  missing,
            "unique_count": n_unique,
            "sample_values": sample_vals,
        }

        # Extra stats for numeric columns
        if pd.api.types.is_numeric_dtype(df[col]):
            s = df[col].dropna()
            if len(s) > 0:
                col_info["min"]  = round(float(s.min()), 4)
                col_info["max"]  = round(float(s.max()), 4)
                col_info["mean"] = round(float(s.mean()), 4)
                col_info["std"]  = round(float(s.std()), 4)
        else:
            # Top 3 categorical values with counts
            vc = df[col].value_counts().head(3)
            col_info["top_values"] = {str(k): int(v) for k, v in vc.items()}

        fingerprint["column_detail"].append(col_info)

    return fingerprint


def _build_domain_prompt(fingerprint: Dict[str, Any]) -> str:
    fp_json = json.dumps(fingerprint, indent=2)
    return f"""You are a senior data scientist performing dataset intake assessment.

DATASET FINGERPRINT:
{fp_json}

Your job is to classify this dataset and produce a structured analysis plan.
Respond ONLY with valid JSON — no markdown, no explanation, no text outside the JSON.

{{
  "domain": "<one of: finance, healthcare, retail, ecommerce, hr, logistics, iot, academic, marketing, real_estate, manufacturing, general>",
  "confidence": <float 0.0-1.0>,
  "is_analyzable": <true | false — only false if data is completely uninterpretable random noise>,
  "rejection_reason": "<only if is_analyzable is false>",

  "analysis_focus": [
    "<3-5 SPECIFIC analytical angles for this exact dataset — name actual column values/domains, not generic>",
    "..."
  ],
  "key_questions": [
    "<3-5 domain-specific questions this dataset should definitively answer — use real column names>",
    "..."
  ],

  "key_issues": [
    "<2-4 most critical data quality or structural problems that will affect analysis reliability — be specific, e.g. 'Value column is 27% non-numeric — requires coercion before any quantitative analysis', 'Year spans only 2 distinct values — temporal trend analysis will be limited'>",
    "..."
  ],

  "column_decisions": {{
    "drop": [
      "<column names that have NO analytical value — e.g. row IDs, free-text notes, person names with no domain relevance, constant columns, 90%+ unique identifiers. These are SUGGESTIONS — the insight engine may override if it finds analytical value.>"
    ],
    "keep": [
      "<column names needed for grouping, temporal context — e.g. Year, Region, Category code. SUGGESTIONS for context attributes.>"
    ],
    "key": [
      "<column names that are the PRIMARY analytical features for this domain — KPIs, metrics, measurements. SUGGESTIONS — the insight engine validates and may add others if the data supports it.>"
    ]
  }},

  "attribute_interpretations": {{
    "<col_name>": "<what this attribute REPRESENTS in domain context — written as a noun phrase, e.g. 'annual reported revenue per entity in NZD thousands' NOT 'the Revenue column'>",
    "...": "..."
  }},

  "cleaning_needed": <true | false>,
  "cleaning_methods": [
    "<one method per entry — use these exact formats:>",
    "remove_empty_rows",
    "remove_duplicates",
    "remove_infinity",
    "impute_median:<column_name>",
    "impute_mode:<column_name>",
    "impute_zero:<column_name>",
    "cap_outliers:<column_name>",
    "drop_column:<column_name>"
  ]
}}

COLUMN DECISION RULES:
- Every column MUST appear in exactly one of: drop, keep, or key
- drop: row IDs, auto-increment numbers, names of people/entities (if not grouping variable), free-text comments, columns with >85% missing, columns with all identical values
- keep: temporal columns (Year, Date), geographic/categorical grouping columns (Region, Category, Industry code), identifier columns used for grouping (not for individual names)
- key: numeric KPIs and measurements the domain cares about most (revenue, salary, count, ratio, rate, score, price, volume)
- A column with mixed types (e.g. 73% numeric) should NOT be dropped — specify "impute_median:<col>" in cleaning_methods and put it in key or keep

CLEANING METHOD RULES:
- Always include: remove_empty_rows, remove_duplicates, remove_infinity
- For each numeric column with missing values: specify impute_median:<col> OR impute_zero:<col>
- For each categorical column with missing values: specify impute_mode:<col>
- For each key numeric column with significant outliers (>5%): specify cap_outliers:<col>
- Do NOT drop a Year/temporal column even if its distribution is uniform — it is critical context

ATTRIBUTE INTERPRETATION RULES:
- Provide interpretations for ALL keep and key columns (not drop)
- Write as a noun phrase describing what the attribute measures, not what the column is called
- Include units if inferrable (thousands, percentages, headcount, etc.)
- Example good: "annual reported revenue per entity in NZD thousands"
- Example bad: "the Revenue column" or "Revenue values"

No markdown. No text outside the JSON.
"""


def detect_domain(df: pd.DataFrame, api_key: str) -> DomainResult:
    """Phase 1: Rich dataset intake — domain, column decisions, cleaning directives."""
    fingerprint = _build_fingerprint(df)
    prompt = _build_domain_prompt(fingerprint)

    messages = [
        {
            "role":    "system",
            "content": (
                "You are a senior data scientist performing dataset intake classification. "
                "You respond only with valid JSON. You are precise about column names — "
                "you only reference columns that exist in the fingerprint provided."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    _FALLBACK = DomainResult(
        domain="general",
        confidence=0.5,
        is_analyzable=True,
        analysis_focus=["statistical patterns", "correlations", "distributions", "outliers"],
        key_questions=[
            "What are the dominant patterns in this dataset?",
            "Which attributes show the strongest relationships?",
            "Are there significant anomalies affecting the analysis?",
            "What does the distribution of primary metrics reveal?",
        ],
        column_decisions={"drop": [], "keep": [], "key": list(df.select_dtypes(include="number").columns[:5])},
        attribute_interpretations={
            col: col.replace("_", " ").lower()
            for col in df.columns[:10]
        },
        cleaning_needed=True,
        cleaning_methods=["remove_empty_rows", "remove_duplicates", "remove_infinity"],
    )

    try:
        text   = _groq_call(messages, api_key, max_tokens=1500, temperature=0.1)
        parsed = _parse_json(text)
    except Exception as e:
        print(f"[Groq] Domain detection failed: {e} — using general fallback")
        return _FALLBACK

    # Validate column names — only accept columns that actually exist
    existing = set(df.columns)

    def _filter_cols(lst):
        return [c for c in (lst or []) if c in existing]

    raw_decisions = parsed.get("column_decisions", {})
    decisions = {
        "drop": _filter_cols(raw_decisions.get("drop", [])),
        "keep": _filter_cols(raw_decisions.get("keep", [])),
        "key":  _filter_cols(raw_decisions.get("key",  [])),
    }

    # Any columns not classified → put in keep as fallback
    classified = set(decisions["drop"] + decisions["keep"] + decisions["key"])
    unclassified = [c for c in df.columns if c not in classified]
    decisions["keep"].extend(unclassified)

    # Filter attribute interpretations to only real columns
    raw_interp = parsed.get("attribute_interpretations", {})
    interpretations = {k: v for k, v in raw_interp.items() if k in existing}

    # Validate cleaning methods — only accept methods with real column names
    raw_methods = parsed.get("cleaning_methods", [
        "remove_empty_rows", "remove_duplicates", "remove_infinity"
    ])
    validated_methods = []
    always = {"remove_empty_rows", "remove_duplicates", "remove_infinity"}
    for m in raw_methods:
        if m in always:
            validated_methods.append(m)
        elif ":" in m:
            method_name, col_name = m.split(":", 1)
            if col_name in existing:
                validated_methods.append(m)
        # else: skip unknown method strings
    # Ensure the three always-on methods are present
    for a in always:
        if a not in validated_methods:
            validated_methods.insert(0, a)

    return DomainResult(
        domain=parsed.get("domain", "general"),
        confidence=float(parsed.get("confidence", 0.5)),
        is_analyzable=bool(parsed.get("is_analyzable", True)),
        analysis_focus=parsed.get("analysis_focus", []),
        key_questions=parsed.get("key_questions", []),
        key_issues=parsed.get("key_issues", []),
        column_decisions=decisions,
        attribute_interpretations=interpretations,
        cleaning_needed=bool(parsed.get("cleaning_needed", True)),
        cleaning_methods=validated_methods,
        rejection_reason=parsed.get("rejection_reason"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6 — Judge
# ─────────────────────────────────────────────────────────────────────────────

def _build_judge_prompt(
    report_json: Dict[str, Any],
    stats: StatsSummary,
    domain: str,
    attribute_interpretations: Dict[str, str],
    valid_columns: List[str],
) -> str:

    # Compact stats context for fact-checking
    stats_context = {
        "rows":    stats.rowCount,
        "columns": stats.columnCount,
        "domain":  domain,
        "numeric_stats_summary": {
            col: {k: v for k, v in info.items() if k in ("mean", "min", "max", "std", "outlier_pct")}
            for col, info in list(stats.numericStats.items())[:8]
        },
        "top_correlations":       stats.topCorrelations[:4],
        "significant_groups":     [
            g for g in stats.groupComparisons if g.get("significant")
        ][:3],
        "temporal":               stats.temporalInfo,
        "normality_summary":      [
            {"col": t["column"], "is_normal": t["is_normal"], "p": t["p_value"]}
            for t in stats.normalityTests[:5]
        ],
    }

    report_text  = json.dumps(report_json,  indent=2)
    stats_text   = json.dumps(stats_context, indent=2)
    interp_text  = json.dumps(attribute_interpretations, indent=2)
    cols_text    = json.dumps(valid_columns)

    return f"""You are the quality director of a top-tier data analytics firm. Your job is to review an AI-generated analysis before it reaches a client, catching any issues that would undermine its credibility.

DOMAIN: {domain}
VALID COLUMN NAMES: {cols_text}
ATTRIBUTE INTERPRETATIONS:
{interp_text}

STATISTICAL GROUND TRUTH:
{stats_text}

REPORT TO REVIEW:
{report_text}

YOUR REVIEW — work through each of these:

1. LANGUAGE REVIEW
   Read through the insights for any raw technical column references — phrases like "the Year column", "column Revenue", "variable X". These undermine the professional tone.
   If you find any, rewrite the affected insights using the attribute interpretations above. Return the corrected insights list in corrected_insights, or null if nothing needed changing.

2. FACT CHECK
   Check whether key numbers cited in the insights are consistent with the statistical ground truth provided.
   If something is materially wrong (not just a rounding difference), flag it in issues_found and correct it.
   If numbers look reasonable, no action needed.

3. CHART REVIEW
   Look at the chart instructions for obvious problems:
   - Are x/y assignments appropriate for the chart type? (bar: categorical x + numeric y; scatter: both numeric; histogram: numeric x only; etc.)
   - Is the chart selection monotonous when the data would support more variety?
   - Does each chart meaningfully support the insight it is linked to?
   Return corrected_chart_instructions with the full corrected list if changes are needed, or null if charts look good.

4. CONCLUSION
   Write a professional conclusion paragraph (3-4 sentences) that synthesises the most important findings, acknowledges the primary data limitation, and closes with one actionable recommendation appropriate for the {domain} domain. This replaces the Gemini-generated conclusion.

5. CONFIDENCE SCORE
   Assign an overall confidence score 1-10 reflecting how much weight a decision-maker should give these findings.
   Consider: data size and completeness, statistical significance, consistency of findings, domain fit.
   Score guide: 9-10 publication-quality, 7-8 boardroom-ready, 5-6 informative with caveats, 3-4 preliminary, 1-2 unreliable.

Respond ONLY with valid JSON using EXACTLY this structure:
{{
  "confidence_score": <integer 1-10>,
  "confidence_level": "<HIGH (8-10) | MEDIUM (5-7) | LOW (1-4)>",
  "overall_confidence": <float 0.0-1.0>,
  "issues_found": [
    "<description of any issue found and what was done>",
    "..."
  ],
  "corrected_insights": [
    {{
      "rank": <integer — must match the original insight rank>,
      "title": "<corrected or original title>",
      "body": "<corrected or original body>",
      "insight_index": <integer matching rank>
    }}
  ],
  "corrected_chart_instructions": [
    {{
      "index": <integer — must match the original chart index>,
      "chart_type": "<corrected or original chart type>",
      "title": "<corrected or original title>",
      "x_column": "<EXACT column name or null>",
      "y_column": "<EXACT column name or null>",
      "description": "<corrected or original description>",
      "insight_index": <integer linking chart to insight>
    }}
  ],
  "conclusion": "<3-4 sentence professional conclusion — synthesised findings, honest limitation, one recommendation>",
  "judge_statement": "<2-3 sentence assessment of overall analysis quality and confidence rationale>",
  "proceed": <true | false — false only if findings are fundamentally unreliable>
}}

IMPORTANT:
- corrected_insights must be the FULL list of all insights (not just changed ones), or null if nothing was changed.
- corrected_chart_instructions must be the FULL list of all chart instructions (not just changed ones), or null if nothing was changed.
- Every insight in corrected_insights must include: rank, title, body, insight_index.
- Every chart in corrected_chart_instructions must include: index, chart_type, title, x_column, y_column, description, insight_index.
- Do not omit fields — the downstream renderer depends on all of them being present.

No markdown. No text outside the JSON.
"""


def judge_insights(
    report_json: Dict[str, Any],
    stats: StatsSummary,
    domain: str,
    attribute_interpretations: Dict[str, str],
    valid_columns: List[str],
    api_key: str,
) -> JudgeResult:
    """Phase 6: Quality audit, corrections, confidence scoring."""
    prompt = _build_judge_prompt(
        report_json, stats, domain, attribute_interpretations, valid_columns
    )
    messages = [
        {
            "role":    "system",
            "content": (
                "You are a rigorous data analytics quality director. "
                "You catch imprecise language, hallucinated statistics, and poor chart choices. "
                "Respond only with valid JSON."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    _FALLBACK = JudgeResult(
        confidence_score=6,
        confidence_level="MEDIUM",
        overall_confidence=0.6,
        issues=[],
        judge_statement=(
            "Analysis completed using standard pipeline. "
            "Results reflect patterns observed in the provided dataset. "
            "Interpret findings in the context of data completeness and sample size."
        ),
        conclusion="",
        corrected_insights=None,
        corrected_chart_instructions=None,
        proceed=True,
    )

    try:
        text   = _groq_call(messages, api_key, max_tokens=2500, temperature=0.15)
        parsed = _parse_json(text)
    except Exception as e:
        print(f"[Groq] Judge call failed: {e} — using default")
        return _FALLBACK

    score = int(parsed.get("confidence_score", 6))
    score = max(1, min(10, score))

    level = parsed.get("confidence_level", "MEDIUM").upper()
    if level not in ("HIGH", "MEDIUM", "LOW"):
        level = "HIGH" if score >= 8 else "MEDIUM" if score >= 5 else "LOW"

    return JudgeResult(
        confidence_score=score,
        confidence_level=level,
        overall_confidence=float(parsed.get("overall_confidence", score / 10)),
        issues=parsed.get("issues_found", []),
        judge_statement=parsed.get("judge_statement", ""),
        conclusion=parsed.get("conclusion", ""),
        corrected_insights=parsed.get("corrected_insights"),
        corrected_chart_instructions=parsed.get("corrected_chart_instructions"),
        proceed=bool(parsed.get("proceed", True)),
    )
