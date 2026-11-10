"""
Phase 1 (Domain Gate)  →  detect_domain(df, api_keys)

  Receives a rich dataset fingerprint (column names, types, sample values,
  basic stats). Returns:
    - Domain classification
    - Column decisions: drop / keep / key  (3 buckets)
    - Attribute interpretations for every kept/key column
    - Cleaning directives (general + column-specific methods)

There used to be a Phase 6 judge here too, auditing the finished report on
Groq. It was replaced by ai_engine/core/confidence.py, which scores from the
statistics instead: see that module for why.
"""

import json
import re
from typing import Dict, Any, List, Optional, Tuple, Union

import pandas as pd

from ai_engine.llm.report_writer import GROQ_URL, OPENROUTER_URL, ReportProvider, write_report
from ai_engine.models.models import DomainResult


# Domain detection goes through the same harness as the report and the chat: a
# chain of models with a deadline, cool-downs and a fallback. It used to call
# one Groq model directly with its own retry loop, which slept up to 35s on a
# rate limit and then gave up. A busy minute on Groq quietly made every file
# domain "general", and the report lost its domain-specific analysis.
#
# gpt-oss-20b stays first: the prompt below was tuned and checked on it, and it
# reliably returns strict JSON for this task. The others draw on separate quota
# pools, so one busy model no longer means no domain. 4000 tokens, not 1500: the
# reply carries a per-column decision map, and gpt-oss charges its reasoning to
# the same budget. At 1500 the JSON was cut off mid-object.
DOMAIN_PROVIDERS: Tuple[ReportProvider, ...] = (
    ReportProvider("groq", "OpenAI gpt-oss-20b", GROQ_URL,
                   "openai/gpt-oss-20b", 4000, 40, {"temperature": 0.1}),
    ReportProvider("groq", "Qwen 3.8 27B", GROQ_URL,
                   "qwen/qwen3.8-27b", 4000, 40, {"temperature": 0.1}),
    ReportProvider("openrouter", "NVIDIA Nemotron 3.5 Super", OPENROUTER_URL,
                   "nvidia/nemotron-3.5-super-vl:free", 8000, 60, {"temperature": 0.1}),
)

# The old direct call could take 3 x 45s plus 35s of sleeping. This is the most
# the domain gate may now take before the analysis carries on without it.
DOMAIN_BUDGET_SECS = 75


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

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
    Build a rich, compact fingerprint of the dataset for the domain gate.

    Note what this does and does not send. The file is never uploaded, but the
    fingerprint is not anonymous either: it carries up to five real values from
    every column plus the three most frequent values of each text column. That
    is deliberate — a column of "CUS00102"-shaped strings is only recognisable
    as a customer key by looking at one — but it means actual cell contents
    leave the process, which is why the privacy policy says so explicitly and
    warns against uploading regulated data. An earlier version of this
    docstring claimed the model never sees raw data; it does.
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
    "drop_column:<column_name>"
  ]
}}

COLUMN DECISION RULES:
- Every column MUST appear in exactly one of: drop, keep, or key
- drop: row IDs, auto-increment numbers, names of people/entities (if not grouping variable), free-text comments, columns with >85% missing, columns with all identical values
- keep: temporal columns (Year, Date), geographic/categorical grouping columns (Region, Category, Industry code), identifier columns used for grouping (not for individual names)
- key: numeric KPIs and measurements the domain cares about most (revenue, salary, count, ratio, rate, score, price, volume)
- A column with mixed types (e.g. 73% numeric) should NOT be dropped — put it in key or keep

CLEANING METHOD RULES:
- Always include: remove_empty_rows, remove_duplicates, remove_infinity
- Missing values and outliers are handled by fixed rules: do not list them
- Do NOT drop a Year/temporal column even if its distribution is uniform — it is critical context

ATTRIBUTE INTERPRETATION RULES:
- Provide interpretations for ALL keep and key columns (not drop)
- Write as a noun phrase describing what the attribute measures, not what the column is called
- Include units if inferrable (thousands, percentages, headcount, etc.)
- Example good: "annual reported revenue per entity in NZD thousands"
- Example bad: "the Revenue column" or "Revenue values"

No markdown. No text outside the JSON.
"""


def _domain_reply(text: str) -> Optional[Dict[str, Any]]:
    """The model's classification, or None so the next model in the chain is tried."""
    try:
        parsed = _parse_json(text)
    except (RuntimeError, ValueError):
        return None
    if not isinstance(parsed, dict) or not parsed.get("domain"):
        return None
    return parsed


def detect_domain(df: pd.DataFrame, api_keys: Union[Dict[str, str], str], tracker=None,
                  providers: Tuple[ReportProvider, ...] = DOMAIN_PROVIDERS) -> DomainResult:
    """
    Phase 1: Rich dataset intake — domain, column decisions, cleaning directives.

    api_keys maps a provider ("groq", "openrouter") to its key; a bare string is
    taken as the Groq key. Never raises: every model failing gives the general
    fallback, as before.
    """
    if isinstance(api_keys, str):
        api_keys = {"groq": api_keys}
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

    parsed, provider = write_report(messages, api_keys or {}, _domain_reply, tracker=tracker,
                                    providers=providers, budget_secs=DOMAIN_BUDGET_SECS, phase="domain")
    if parsed is None:
        print("[Domain] no model classified the file — using the general fallback", flush=True)
        return _FALLBACK
    print(f"[Domain] classified by {provider.display_name if provider else 'a model'}", flush=True)

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
