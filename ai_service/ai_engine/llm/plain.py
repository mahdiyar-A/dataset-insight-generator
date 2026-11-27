"""
Statistics words in a report written for someone who does not read them.

The writer is told who the reader is and to keep test names and statistics
out of a plain report (insight_agent). Models still slip: "a large and
statistically significant effect (p < 1e-6)" is a habit. Here the slips are
found, so that a report with many of them can be sent back once, and the
ones left are taken out without asking any model:

  - a bracket holding a statistic goes: "(r = 0.71, p < 0.001)", "(η² = 0.51)"
  - a few stock phrases become plain ones: "statistically significant" → "clear"
  - in English, a sentence built on a test name goes when the paragraph has
    others to stand on ("The eta-squared of 0.51 confirms that ...")

Nothing is added and no figure is changed. The statistics are not lost: each
insight's "Based on" lines, written by DIG from the numbers, go on the report's
"How we know" page.
"""

from __future__ import annotations

import re
from typing import List

# Notation, the same in every language.
_STAT = (r"(?:\bp\s*[<=>≤≥]|\bp-?value|\br\s*=|\bρ|\brho\b|\bτ|\btau\b|η²?|\beta[\s\-‑]?squared|\bR²|\bR\^?2\b|"
         r"χ²|\bchi[\s\-‑]?squared?|Cram[eé]r|Mann[\s\-‑]?Kendall|Spearman|Pearson|Sen(?:'s)?\s+slope|"
         r"Kruskal[\s\-‑]?Wallis|Mann[\s\-‑]?Whitney|Welch|ANOVA|isolation[\s\-‑]?forest|\bz[\s\-‑]?score|"
         r"\bz\s*=|\bt\s*=|\bF\s*=|\bd\s*=|\bn\s*=|\bCI\b|confidence interval|\bstd\.?\b|σ|\bIQR\b|\bSD\b)")
_STAT_RE = re.compile(_STAT, re.IGNORECASE)

# A bracketed aside that holds a statistic, with the space before it.
_BRACKET = re.compile(r"\s*[\(\[]([^()\[\]]{0,160})[\)\]]")

# Words a plain reader would not know (English). Each is reported once.
_WORDS = [
    "p-value", "p value", "statistically significant", "statistical significance", "significance level",
    "correlation coefficient", "eta-squared", "eta squared", "mann-kendall", "spearman", "pearson",
    "cramér's v", "cramer's v", "chi-square", "chi-squared", "confidence interval", "sen slope", "sen's slope",
    "standard deviation", "variance", "regression", "r-squared", "r²", "model share", "coefficient",
    "heteroscedastic", "kurtosis", "skewness", "skewed", "interquartile", "quartile", "non-parametric",
    "parametric", "null hypothesis", "effect size", "multivariate", "univariate", "bivariate", "η²", "ρ", "τ",
    "kruskal-wallis", "kruskal wallis", "mann-whitney", "mann whitney", "anova", "welch", "isolation forest",
    "isolation-forest", "anomaly score", "z-score", "bimodal", "outlier fence",
]
_WORD_RE = re.compile("|".join(re.escape(w) for w in sorted(_WORDS, key=len, reverse=True)), re.IGNORECASE)

# Stock phrases with a plain equivalent (English).
_SWAPS = [
    (r"\b(is|are|was|were)\s+not\s+(?:statistically\s+)?significant\b", r"\1 too weak to rely on"),
    (r"\bnot statistically significant\b", "too weak to rely on"),
    (r"\b(is|are|was|were)\s+(?:statistically\s+)?insignificant\b", r"\1 too weak to rely on"),
    (r"\bstatistically insignificant\b", "very weak"),
    (r"\bnon[\s\-‑]?significant\b", "weak"),
    (r"\binsignificant\b", "very small"),
    (r"\bhighly statistically significant\b", "very clear"),
    (r"\bhighly significant\b", "very clear"),
    (r"\bstatistically significant\b", "clear"),
    (r"\bstatistically\s+", ""),
    (r"\bexplains? (over |about |nearly |roughly )?(half|a third|a quarter|\d+%?) of the variance in\b",
     r"accounts for \1\2 of the ups and downs in"),
    (r"\bthe variance in\b", "the ups and downs in"),
    (r"\bis (strongly |moderately |weakly )?correlated with\b", r"moves \1together with"),
    (r"\bcorrelates? (strongly |moderately |weakly )?with\b", r"moves \1together with"),
]
_SWAP_RES = [(re.compile(a, re.IGNORECASE), b) for a, b in _SWAPS]

# A sentence that leans on a test name to make its point.
_TEST_NAMES = re.compile(r"eta[\s\-‑]?squared|η²|mann[\s\-‑]?kendall|sen(?:'s)?\s+slope|spearman|pearson|"
                         r"cram[eé]r|chi[\s\-‑]?squared?|r[\s\-‑]?squared|R²|p[\s\-‑]?value|model share|"
                         r"\bp\s*[<=>]|\bτ\b|\btau\b|kruskal|mann[\s\-‑]?whitney|isolation[\s\-‑]?forest",
                         re.IGNORECASE)
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“(])")


def jargon(text: str) -> List[str]:
    """The statistics words and notation in `text`, each once, in order."""
    found: List[str] = []
    for m in _WORD_RE.finditer(text or ""):
        w = m.group(0).lower()
        if w not in found:
            found.append(w)
    for m in _STAT_RE.finditer(text or ""):
        w = m.group(0).strip().lower()
        if w and w not in found and not any(w in f or f in w for f in found):
            found.append(w)
    return found


def _drop_stat_brackets(text: str) -> str:
    def keep(m: "re.Match[str]") -> str:
        return "" if _STAT_RE.search(m.group(1)) else m.group(0)
    return _BRACKET.sub(keep, text)


def _same_case(m: "re.Match[str]", plain: str) -> str:
    """The plain words, capitalised when the words they replace began a sentence."""
    out = m.expand(plain)
    if out and m.group(0)[:1].isupper():
        return out[:1].upper() + out[1:]
    return out


def _tidy(text: str) -> str:
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r",\s*,", ",", text)
    text = re.sub(r"\(\s*\)", "", text)
    return text.strip()


def soften(text: str, english: bool = True) -> str:
    """
    `text` with its statistics taken out, for a reader who does not read them.
    Changes no figure and adds nothing.
    """
    if not text:
        return text or ""
    out = _drop_stat_brackets(str(text))
    if english:
        for pattern, plain in _SWAP_RES:
            out = pattern.sub(lambda m, plain=plain: _same_case(m, plain), out)
        paragraphs = []
        for para in out.split("\n"):
            sentences = _SENTENCE.split(para)
            kept = [s for s in sentences if not _TEST_NAMES.search(s)]
            # A paragraph made only of such sentences keeps them, cleaned:
            # an empty insight would tell the reader less.
            paragraphs.append(" ".join(kept) if kept else para)
        out = "\n".join(paragraphs)
    return _tidy(out)


def humanize_columns(text: str, columns) -> str:
    """
    Column names written as code ("units_sold", "unitPrice") turned into the
    words they stand for ("units sold", "unit price"). Only whole names of the
    file's own columns are touched, and only ones that look like code.
    """
    if not text:
        return text or ""
    out = str(text)
    for col in sorted({str(c) for c in (columns or []) if c}, key=len, reverse=True):
        if not re.search(r"_|[a-z][A-Z]", col):
            continue
        words = re.sub(r"([a-z])([A-Z])", r"\1 \2", col).replace("_", " ")
        words = re.sub(r"\s+", " ", words).strip().lower()
        out = re.sub(r"(?<![\w])" + re.escape(col) + r"(?![\w])", words, out)
    return out


def soften_title(text: str, english: bool = True) -> str:
    """A heading with no statistic in it at all."""
    out = soften(text, english)
    out = re.sub(r"\s*[,:;–—-]?\s*" + _STAT + r"[^,;:]*$", "", out, flags=re.IGNORECASE) if _STAT_RE.search(out) else out
    return out.strip(" ,;:–—-") or text
