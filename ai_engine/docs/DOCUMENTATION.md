# Dataset Analysis Engine

## Overview

The Dataset Analysis Engine evaluates CSV files uploaded by users before any LLM is called.
It ensures the system only processes reliable data and provides clear guidance to the frontend and backend when issues arise.

### The engine performs:
- Data quality checks
- Confidence scoring
- LLM‑readiness evaluation
- Prompt‑preparation (structured dataset summary)
- Interaction rule signaling

This document defines the expected inputs, outputs, JSON schema, warning/error types, and interpretation rules when using the analysis layer.

---

# 1. Backend Entry Points:

### These are the two ways to analyze a csv file

You can use:

The synchronous
```python
analyze_csv(file_path : str) -> dict
```

### OR

Asynchronous (Recommended)
```python
await analyze_csv_async(file_path: str) -> dict
```
---
# 2. Output JSON schematic

## When the engine returns it will return something in this format:

```json
{
  "status": "RECEIVED | ANALYZING | NEED_USER_CONFIRMATION | CLEANING_DATASET | LLM_NOT_CONFIDENT | FAILED | CANCELLED | COMPLETED",

  "dataQuality": {
    "warnings": ["string"],
    "errors": ["string"],
    "isUsable": true / false,
    "confidenceLevel": "NONE | LOW | MEDIUM | HIGH",
    "confidenceReason": "string"
  },

  "confidence": {
    "confidenceLevel": "NONE | LOW | MEDIUM | HIGH",
    "confidenceReason": "string"
  },

  "llmReadiness": {
    "llmReady": true / false,
    "llmReason": "string",
    "requiresUserConfirmation": true / false,
    "canAutoClean": true / false,
    "suggestedActions": ["string"]
  },

  "datasetSummary": {
    "rowCount": 0,
    "columnCount": 0,
    "columnTypes": { "col": "dtype" },
    "missingPercentages": { "col": 0.0 },
    "numericDistributions": {
      "col": {
        "mean": 0.0,
        "std": 0.0,
        "min": 0.0,
        "max": 0.0
      }
    },
    "topCorrelations": [
      { "col1": "A", "col2": "B", "correlation": 0.92 }
    ],
    "detectedIssues": ["string"]
  }
}
```

---
# 3. Data Quality Rules
### The engine detects and classifies dataset issues into errors and warnings within the json file:
## Errors (dataset becomes unusable)

These issues make the dataset unreliable for analysis.  
If any of these occur, the engine sets:

- `isUsable = false`
- `status = FAILED`
- `confidenceLevel = NONE`
- `datasetSummary = null`

### Error conditions:
- Dataset contains **fewer than 10 rows**
- Dataset has **fewer than 2 columns**
- A column is entirely empty (100% missing)
- A column has **over 80% missing values**
- Duplicate column names (exact duplicates)
- CSV cannot be parsed or loaded

---

## Warnings (dataset still usable)

Warnings do **not** block analysis.  
The dataset is still usable, but confidence may be reduced.

### Warning conditions:
- Column has **over 50% missing values**
- Column has no variance (all values identical)
- Empty rows detected
- Mixed numeric + non‑numeric values in a column
- Extreme outliers detected (IQR rule)
- Duplicate columns with suffixes (e.g., `A`, `A.1`)

---

# 4. Confidence Scoring

Confidence indicates how reliable the dataset is for generating insights.

| Level | Meaning |
|-------|---------|
| **NONE** | Dataset unusable or critically flawed |
| **LOW** | Dataset small (<20 rows) or contains significant issues |
| **MEDIUM** | Dataset usable with minor issues |
| **HIGH** | Dataset clean, large, and reliable |

### Confidence rules:
- `< 10 rows` → **NONE**
- `10–19 rows` → **LOW**
- `20+ rows` → **HIGH**
- Any error → **NONE**
- Multiple warnings → may reduce to **LOW**

---

# 5. LLM‑Readiness Rules

The engine determines whether the dataset is safe to send to an LLM.

### llmReady = false when:
- Dataset is unusable  
- Confidence is NONE or LOW  
- User confirmation is required  

### llmReady = true when:
- Dataset is usable  
- Confidence is MEDIUM or HIGH  

### Additional fields:
- `requiresUserConfirmation`: true when confidence is LOW  
- `canAutoClean`: true when warnings exist  
- `suggestedActions`: recommended next steps for frontend UX  

---

# 6. Prompt‑Preparation Layer

If the dataset is usable, the engine generates a structured summary for future LLM use.

The summary includes:
- Row and column counts  
- Column data types  
- Missing value percentages  
- Numeric distributions (mean, std, min, max)  
- Top correlations  
- Detected issues  

This summary becomes the `datasetSummary` object and is intended to be passed directly into an LLM prompt later.

---

# 7. Interaction Rules (Frontend/Backend)

These rules define how the system should behave after analysis.

1. **LLM not confident** → Ask user if they want to continue  
2. **Dataset not clean** → Ask user if they want auto‑cleaning  
3. **Dataset failed or too short** → Stop and return FAILED  
4. **User cancelled** → Return CANCELLED  
5. **LLM failed** → Return FAILED  
6. **Cleaning error** → Return FAILED  
7. **No error** → Return COMPLETED and generate PDF  

---

# 8. Example Outputs

## A. Good Dataset (clean, large)
```json
{
  "status": "COMPLETED",
  "dataQuality": { "warnings": [], "errors": [], "isUsable": true },
  "confidence": { "confidenceLevel": "HIGH" },
  "llmReadiness": { "llmReady": true },
  "datasetSummary": { ... }
}
```

## B. Bad Dataset (too small)
```json
{
  "status": "FAILED",
  "dataQuality": {
    "errors": ["Dataset contains fewer than 10 rows."],
    "isUsable": false
  },
  "confidence": { "confidenceLevel": "NONE" },
  "llmReadiness": { "llmReady": false },
  "datasetSummary": null
}
```

## C. Messy Dataset (usable but low confidence)
```json
{
  "status": "COMPLETED",
  "dataQuality": {
    "warnings": ["Column 'A' has over 50% missing values."],
    "errors": [],
    "isUsable": true
  },
  "confidence": { "confidenceLevel": "LOW" },
  "llmReadiness": {
    "llmReady": false,
    "requiresUserConfirmation": true
  },
  "datasetSummary": { ... }
}
```
---
# 9. Backend Interpretation Guide
```json
If isUsable = false → Do not call LLM

If confidenceLevel = NONE or LOW → Ask user before calling LLM

If llmReady = true → Safe to call LLM

Always pass datasetSummary to the LLM when ready
```
---
# 10. Frontend Interpretation Guide
```json
Show warnings in yellow

Show errors in red

Ask user for confirmation when confidence is LOW

Offer auto‑clean when canAutoClean = true
```