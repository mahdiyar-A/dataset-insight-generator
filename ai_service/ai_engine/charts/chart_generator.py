import io
import re
import base64
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import seaborn as sns
from matplotlib import font_manager
from matplotlib.text import Text
from contextlib import contextmanager
from dataclasses import replace
from typing import List, Dict, Any, Iterator, Optional
from ai_engine.fonts import RTL_CHARS, cjk_font_file
from ai_engine.models.models import ChartInstruction

try:
    import arabic_reshaper
    from bidi import get_display
except ImportError:  # charts still draw; Arabic-script labels just come out unjoined
    arabic_reshaper = None


def _font_families() -> List[str]:
    """DejaVu Sans, then a CJK font for the characters it lacks."""
    families = ["DejaVu Sans"]
    path = cjk_font_file()
    if path:
        try:
            font_manager.fontManager.addfont(path)
            families.append(font_manager.FontProperties(fname=path).get_name())
        except Exception as e:
            print(f"[Chart] CJK font {path} unusable: {e}")
    return families


# Clean dark-ish professional style
plt.rcParams.update({
    "figure.facecolor":  "#0f172a",
    "axes.facecolor":    "#1e293b",
    "axes.edgecolor":    "#334155",
    "axes.labelcolor":   "#94a3b8",
    "axes.titlecolor":   "#e2e8f0",
    "xtick.color":       "#64748b",
    "ytick.color":       "#64748b",
    "text.color":        "#e2e8f0",
    "grid.color":        "#1e293b",
    "grid.linewidth":    0.5,
    "font.family":       _font_families(),
    "font.size":         10,
})


# The colours every chart is drawn with. The dark set is the old look, kept for
# a chart drawn with no report look given; drawn_in() swaps in a report's own.
_DARK: Dict[str, Any] = {
    "paper": "#0f172a", "ink": "#e2e8f0", "edge": "#0f172a", "trend": "#f8fafc", "second": "#fbbf24",
    "other": "#64748b", "colors": ["#3b82f6", "#a855f7", "#10b981", "#f97316", "#ec4899"],
    "groups": ["#3987e5", "#d95926", "#199e70"], "heading": None, "themed": False,
}
_pal: Dict[str, Any] = dict(_DARK)
_registered: Dict[str, Optional[str]] = {}


def _family(path: str) -> Optional[str]:
    """matplotlib's name for a font file, registering it once; None if it cannot be used."""
    if path not in _registered:
        try:
            font_manager.fontManager.addfont(path)
            _registered[path] = font_manager.FontProperties(fname=path).get_name()
        except Exception as e:
            print(f"[Chart] font {path} unusable: {e}")
            _registered[path] = None
    return _registered[path]


def _mix(a: str, b: str, share: float) -> str:
    """Colour a moved `share` of the way towards b."""
    ca, cb = (tuple(int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) for h in (a, b))
    return "#" + "".join(f"{round(x + (y - x) * share):02x}" for x, y in zip(ca, cb))


@contextmanager
def drawn_in(style: Optional[Dict[str, Any]]) -> Iterator[None]:
    """
    Draw the charts inside in a report's look (Look.chart_style()): its paper,
    ink, colours and fonts, a light grid and no box. Without a style nothing
    changes.
    """
    global _pal
    if not style:
        yield
        return
    paper, ink, muted = style["paper"], style["ink"], style["muted"]
    body_files = list(style.get("body_files") or [])
    heading_files = list(style.get("heading_files") or [])
    body = next((f for f in (_family(p) for p in body_files) if f), None)
    heading = next((f for f in (_family(p) for p in heading_files) if f), None)
    families = list(dict.fromkeys(([body] if body else []) + _font_families()))
    rc = {
        "figure.facecolor": paper, "axes.facecolor": paper, "savefig.facecolor": paper,
        "axes.edgecolor": _mix(ink, paper, 0.55), "axes.labelcolor": muted, "axes.titlecolor": ink,
        "xtick.color": muted, "ytick.color": muted, "text.color": ink,
        "grid.color": _mix(ink, paper, 0.85), "grid.linewidth": 0.8,
        "axes.spines.top": False, "axes.spines.right": False, "axes.axisbelow": True,
        "font.family": families, "font.size": 10, "legend.frameon": False,
        "axes.labelsize": 9, "xtick.labelsize": 8.5, "ytick.labelsize": 8.5,
    }
    colors = list(style.get("colors") or _DARK["colors"])
    pal = {"paper": paper, "ink": ink, "edge": paper, "trend": ink, "second": colors[min(2, len(colors) - 1)],
           "other": _mix(muted, paper, 0.35), "colors": colors, "groups": colors[:3], "heading": heading,
           "themed": True}
    old = _pal
    with plt.rc_context(rc):
        _pal = pal
        try:
            yield
        finally:
            _pal = old


def _words(column: str) -> str:
    """A column name as words for an axis: "units_sold" -> "Units sold"."""
    raw = str(column)
    if re.search(r"_|[a-z][A-Z]", raw):
        raw = re.sub(r"([a-z])([A-Z])", r"\1 \2", raw).replace("_", " ")
        raw = re.sub(r"\s+", " ", raw).strip().lower()
    # "revenue" -> "Revenue", but "pH" stays as it is.
    if raw[:1].islower() and raw[1:2].islower():
        raw = raw[:1].upper() + raw[1:]
    return raw


def _short(v: float) -> str:
    """A bar's value as a label: 1,240 / 12k / 3.1M."""
    a = abs(v)
    if a >= 1e6:
        return f"{v / 1e6:.1f}M"
    if a >= 1e4:
        return f"{v / 1e3:.0f}k"
    if a >= 100 or float(v).is_integer():
        return f"{v:,.0f}"
    return f"{v:,.1f}"


def _label_bars(ax, bars) -> None:
    """Each bar's value at its end, when there are few enough to read."""
    if 0 < len(bars) <= 12:
        ax.bar_label(bars, labels=[_short(b.get_height()) for b in bars], padding=3, fontsize=8,
                     color=_pal["ink"])
        ax.margins(y=0.12)


def _title(ax, text: str) -> None:
    kw = {"fontfamily": _pal["heading"]} if _pal.get("heading") else {}
    ax.set_title(text, fontsize=12.5, fontweight="bold", pad=14, loc="left" if _pal["themed"] else "center", **kw)


MAX_SCATTER_POINTS = 500
MAX_SCATTER_LEVELS = 20    # beyond this a column is labels, not groups
# In a scatter any group can sit beside any other, so these must stay apart in
# every pairing, for colour-blind readers too, on the axes colour above. Three
# is as many as that allows; the rest of the rows are drawn as other groups.
GROUP_COLORS = _DARK["groups"]
GROUP_MARKERS = ["o", "s", "^"]
OTHER_GROUPS_COLOR = "#64748b"


def _display(text: str) -> str:
    """
    Arabic-script text the way matplotlib must be given it. matplotlib neither
    joins Arabic letters nor lays text out right to left, so a Persian chart
    title came out as separate letters in reverse order. The reshaper picks
    each letter's joined form and the bidi pass puts the text in visual order.
    """
    if arabic_reshaper is None or not text or not RTL_CHARS.search(text):
        return text
    return get_display(arabic_reshaper.reshape(text))


def _fix_rtl_text(fig) -> None:
    for ax in fig.axes:   # asking for tick labels fills in their text, no draw needed
        for axis in (ax.xaxis, ax.yaxis):
            texts = [t.get_text() for t in axis.get_ticklabels()]
            if any(RTL_CHARS.search(s) for s in texts):
                axis.set_ticks(axis.get_ticklocs())
                axis.set_ticklabels([_display(s) for s in texts])
    # Titles, axis labels, legends. Tick labels are rewritten from the
    # formatter set above at the next draw, whatever is done to them here.
    for t in fig.findobj(Text):
        s = t.get_text()
        if RTL_CHARS.search(s):
            t.set_text(_display(s))


# Characters the chart fonts lack, drawn as a box: "Average Pre▯test Score".
# The writer uses the non-breaking hyphen (U+2011) in titles.
_NO_GLYPH = str.maketrans({"‑": "-", "‐": "-", "­": "", "−": "-"})


def _plain_glyphs(fig) -> None:
    from matplotlib.text import Text
    for t in fig.findobj(Text):
        s = t.get_text()
        if s and any(ch in s for ch in "‑‐­−"):
            t.set_text(s.translate(_NO_GLYPH))


def readable_names(columns, meanings: Optional[Dict[str, str]]) -> Dict[str, str]:
    """
    Axis names for columns whose own names say nothing (V1, Q12, X_3), from
    what the file-reading model or the user said they hold. A chart of "V1"
    against "V5" told the reader nothing they had not already typed in.
    """
    out: Dict[str, str] = {}
    taken = {str(c) for c in columns}
    for col in columns:
        name = str(col)
        meaning = str((meanings or {}).get(name) or "").strip()
        if not meaning or not re.fullmatch(r"[A-Za-z]{1,3}_?\d{1,3}", name):
            continue
        words = re.sub(r"\s*[\(\[].*$", "", meaning).split()
        label = " ".join(words[:5]).rstrip(",;:.")
        label = label[:1].upper() + label[1:]
        if label and label not in taken:
            out[name] = label
            taken.add(label)
    return out


def _to_png_base64(fig) -> str:
    try:
        _fix_rtl_text(fig)
    except Exception as e:  # a label problem must not cost the chart
        print(f"[Chart] right-to-left labels left as they were: {e}")
    try:
        _plain_glyphs(fig)
    except Exception as e:
        print(f"[Chart] hyphens left as they were: {e}")
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


def _safe_col(df: pd.DataFrame, col: str) -> str | None:
    """Return col if it exists in df, else try case-insensitive match, else None."""
    if not col:
        return None
    if col in df.columns:
        return col
    lower_map = {c.lower(): c for c in df.columns}
    return lower_map.get(col.lower())


def _infer_top_n(title: str, default: int = 10) -> int:
    """Extract 'Top N' from chart title if present (e.g. 'Top 5 Industries' → 5)."""
    import re
    m = re.search(r"\btop\s+(\d+)\b", title, re.IGNORECASE)
    if m:
        return min(int(m.group(1)), 20)   # cap at 20 regardless
    return default


def _measure(instr: ChartInstruction) -> str:
    """
    "sum" when a chart promises totals, otherwise "mean".

    A model writes the words. One called a chart "Weekly Total Revenue" over
    weekly averages, so a week of 7,000 read as 160. A title that says average
    settles it; otherwise the title or the description can ask for a total.
    """
    if instr.aggregate in ("sum", "mean"):
        return instr.aggregate
    title = instr.title or ""
    if re.search(r"\b(average|avg|mean|median)\b", title, re.IGNORECASE):
        return "mean"
    words = f"{title} {instr.description or ''}"
    return "sum" if re.search(r"\b(totals?|sums?)\b", words, re.IGNORECASE) else "mean"


_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
           "november", "december"]


def _natural_order(index: pd.Index) -> Optional[List[Any]]:
    """
    Days of the week and months of the year in calendar order, not by size: a
    week read Sunday, Saturday, Wednesday hides the weekend. Also an ordered
    category's own order. None for anything else.
    """
    if isinstance(index, pd.CategoricalIndex) and index.ordered:
        return list(index.sort_values())
    names = [str(v).strip().lower() for v in index]
    if not names or len(names) > 12:
        return None
    for calendar in (_DAYS, _MONTHS):
        for width in (None, 3):
            keys = [c[:width] if width else c for c in calendar]
            if all(n in keys for n in names):
                return sorted(index, key=lambda v: keys.index(str(v).strip().lower()))
    return None


def _axis_label(column: str, how: str) -> str:
    return f"{_words(column)} ({'total' if how == 'sum' else 'average'})"


def _bar_chart(df: pd.DataFrame, instr: ChartInstruction) -> str:
    x = _safe_col(df, instr.xColumn)
    y = _safe_col(df, instr.yColumn)
    if not x:
        return None

    top_n = _infer_top_n(instr.title)
    fig, ax = plt.subplots(figsize=(8, 4.5))

    if y and pd.api.types.is_numeric_dtype(df[y]):
        how = _measure(instr)
        data = df.groupby(x, observed=True)[y].agg(how)
        natural = _natural_order(data.index)
        data = data.reindex(natural) if natural is not None else data.sort_values(ascending=False).head(top_n)
        bars = ax.bar(data.index.astype(str), data.values, color=instr.color, alpha=0.9, edgecolor=_pal["edge"],
                      linewidth=0.5)
        ax.set_ylabel(_axis_label(y, how))
    else:
        data = df[x].value_counts().head(top_n)
        bars = ax.bar(data.index.astype(str), data.values, color=instr.color, alpha=0.9, edgecolor=_pal["edge"],
                      linewidth=0.5)
        ax.set_ylabel("Count")
    if _pal["themed"]:
        _label_bars(ax, bars)

    ax.set_xlabel(_words(x))
    _title(ax, instr.title)
    # Labels lie flat while they fit side by side: each bar has about 110 / n
    # characters of room at this size.
    longest = max((len(str(v)) for v in data.index), default=0)
    crowded = len(data) > 12 or longest * len(data) > 90
    plt.xticks(rotation=35 if crowded or not _pal["themed"] else 0,
               ha="right" if crowded or not _pal["themed"] else "center", fontsize=8)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    return _to_png_base64(fig)


_ROW_COUNT = "__rows__"


def _line_chart(df: pd.DataFrame, instr: ChartInstruction) -> str:
    x = _safe_col(df, instr.xColumn)
    y = _safe_col(df, instr.yColumn)
    if not x:
        return None

    # Text cannot be averaged, so a line of it counts rows at each point.
    counting = not y or not pd.api.types.is_numeric_dtype(df[y])
    if counting:
        df, y = df.groupby(x).size().reset_index(name=_ROW_COUNT), _ROW_COUNT

    fig, ax = plt.subplots(figsize=(8, 4.5))
    how = "sum" if counting else _measure(instr)
    y_label = "Count" if counting else _axis_label(y, how)
    dated = False

    if pd.api.types.is_numeric_dtype(df[x]):
        y_label = "Count" if counting else _words(y)
        sorted_df = df[[x, y]].dropna().sort_values(x)
        ax.plot(sorted_df[x], sorted_df[y], color=instr.color, linewidth=2, alpha=0.9)
        ax.fill_between(sorted_df[x], sorted_df[y], alpha=0.15, color=instr.color)
    else:
        series = df[[x, y]].dropna()
        try:
            dates = pd.to_datetime(series[x], errors="coerce", format="mixed")
        except (ValueError, TypeError):
            dates = pd.to_datetime(series[x], errors="coerce")

        if len(series) and dates.notna().mean() > 0.8:
            # Dates stored as text. Plotted as categories, a year of daily data
            # drew one rotated tick label per day: 336 of them on a 30,000-row
            # file, unreadable and 3.5 of the 6.3 seconds spent on charts. A
            # real time axis lets matplotlib choose sensible ticks, and long
            # daily series are grouped per week (or month) so the trend shows.
            frame = pd.DataFrame({"t": dates, "y": pd.to_numeric(series[y], errors="coerce")}).dropna()
            data = frame.groupby("t")["y"].agg(how).sort_index()
            if len(data) > 120:
                span_days = (data.index.max() - data.index.min()).days
                rule = "W" if span_days <= 730 else "MS"
                periods = data.resample(rule)
                data = (periods.sum(min_count=1) if how == "sum" else periods.mean()).dropna()
                if how == "sum":
                    data = _without_part_periods(data, frame.groupby("t").size().resample(rule).size())
            ax.plot(data.index, data.values, color=instr.color, linewidth=2, marker="o", markersize=3)
            # "Jan Feb Mar … 2025" reads; "2025-01 2025-03", tilted, does not.
            import matplotlib.dates as mdates
            locator = mdates.AutoDateLocator(minticks=4, maxticks=10)
            ax.xaxis.set_major_locator(locator)
            ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
            dated = True
        else:
            data = series.groupby(x)[y].agg(how)
            ax.plot(data.index.astype(str), data.values, color=instr.color, linewidth=2, marker="o", markersize=4)
            if len(data) > 25:
                # Many categories: label a readable subset rather than all of them.
                from matplotlib.ticker import MaxNLocator
                ax.xaxis.set_major_locator(MaxNLocator(nbins=20))

    ax.set_xlabel(_words(x))
    ax.set_ylabel(y_label)
    _title(ax, instr.title)
    if dated:
        plt.xticks(fontsize=8)
    else:
        plt.xticks(rotation=35, ha="right", fontsize=8)
    ax.grid(alpha=0.3)
    if _pal["themed"]:
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}" if abs(v) >= 100 else f"{v:g}"))
    fig.tight_layout()
    return _to_png_base64(fig)


def _without_part_periods(totals: pd.Series, days: pd.Series) -> pd.Series:
    """
    Totals per week or month without a first or last period that holds only
    part of its days: a year that starts on a Thursday drew its first week as
    a collapse in sales.
    """
    days = days.reindex(totals.index).fillna(0)
    if len(totals) < 4 or not len(days):
        return totals
    full = float(days.median())
    keep = pd.Series(True, index=totals.index)
    for end in (totals.index[0], totals.index[-1]):
        if days.get(end, full) < 0.9 * full:
            keep[end] = False
    return totals[keep]


def _trend_line(ax, fitted: pd.DataFrame, drawn: pd.DataFrame, x: str, y: str, **style):
    """
    A straight line fitted to `fitted`, across the range of `drawn`. Returns its
    right-hand end, or None when no line can be fitted.

    Fitted on every row, not the plotted sample: a group's slope is the point
    of the line, and a few dozen sampled rows can tilt it the wrong way.
    """
    if fitted[x].nunique() < 2:
        return None
    try:
        slope, intercept = np.polyfit(fitted[x].astype(float), fitted[y].astype(float), 1)
        ends = np.array([drawn[x].min(), drawn[x].max()], dtype=float)
    except (TypeError, ValueError):
        return None
    ax.plot(ends, slope * ends + intercept, **style)
    return ends[1], slope * ends[1] + intercept


def _scatter_by_group(ax, points: pd.DataFrame, sample: pd.DataFrame, x: str, y: str, g: str) -> None:
    """The largest groups in their own colour and shape, each with its own line."""
    levels = points[g].value_counts().index[:len(_pal["groups"])]
    rest = sample[~sample[g].isin(levels)]
    if len(rest):
        ax.scatter(rest[x], rest[y], color=_pal["other"], alpha=0.35, s=14, edgecolors="none",
                   label="Other groups")
    for level, color, marker in zip(levels, _pal["groups"], GROUP_MARKERS):
        shown = sample[sample[g] == level]
        ax.scatter(shown[x], shown[y], color=color, marker=marker, alpha=0.6, s=22, edgecolors="none",
                   label=str(level))
        end = _trend_line(ax, points[points[g] == level], shown, x, y, color=color, linewidth=2)
        if end:
            ax.annotate(str(level), end, xytext=(5, 0), textcoords="offset points", fontsize=8, va="center")


def _scatter_chart(df: pd.DataFrame, instr: ChartInstruction) -> str:
    x = _safe_col(df, instr.xColumn)
    y = _safe_col(df, instr.yColumn)
    if not x or not y:
        return None
    g = _safe_col(df, instr.groupColumn) if instr.groupColumn else None
    if g in (x, y):
        g = None

    points = df[[x, y, g] if g else [x, y]].dropna()
    if points.empty:
        return None
    sample = points.sample(min(MAX_SCATTER_POINTS, len(points)), random_state=0)
    grouped = bool(g) and 2 <= points[g].nunique() <= MAX_SCATTER_LEVELS

    fig, ax = plt.subplots(figsize=(7, 5))
    if grouped:
        _scatter_by_group(ax, points, sample, x, y, g)
    else:
        ax.scatter(sample[x], sample[y], color=instr.color, alpha=0.55, s=20, edgecolors="none")
    _trend_line(ax, points, sample, x, y, color=_pal["trend"], linewidth=1.2, linestyle="--", alpha=0.6,
                label="Overall trend" if grouped else "Trend")
    if ax.get_legend_handles_labels()[0]:
        ax.legend(fontsize=8)

    ax.set_xlabel(_words(x))
    ax.set_ylabel(_words(y))
    _title(ax, instr.title)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    return _to_png_base64(fig)


def _histogram(df: pd.DataFrame, instr: ChartInstruction) -> str:
    x = _safe_col(df, instr.xColumn)
    if not x:
        return None

    fig, ax = plt.subplots(figsize=(7, 4.5))
    series = df[x].dropna()
    ax.hist(series, bins=30, color=instr.color, alpha=0.85, edgecolor=_pal["edge"], linewidth=0.4)

    # Mean + median lines
    ax.axvline(series.mean(),   color=_pal["trend"], linestyle="--", linewidth=1.2, alpha=0.8, label=f"Mean: {series.mean():.2f}")
    second = next((c for c in _pal["colors"] if c != instr.color), _pal["second"]) if _pal["themed"] else _pal["second"]
    ax.axvline(series.median(), color=second, linestyle=":",  linewidth=1.6, alpha=0.95, label=f"Median: {series.median():.2f}")
    ax.legend(fontsize=8)

    ax.set_xlabel(_words(x))
    ax.set_ylabel("How many rows" if _pal["themed"] else "Frequency")
    _title(ax, instr.title)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    return _to_png_base64(fig)


def _box_chart(df: pd.DataFrame, instr: ChartInstruction) -> str:
    x = _safe_col(df, instr.xColumn)
    y = _safe_col(df, instr.yColumn)
    if not x:
        return None

    fig, ax = plt.subplots(figsize=(8, 4.5))

    if y and pd.api.types.is_numeric_dtype(df[y]):
        groups = [grp[y].dropna().values for _, grp in df.groupby(x)]
        labels = [str(k) for k in df[x].unique()[:12]]
        bp = ax.boxplot(groups[:12], patch_artist=True, labels=labels,
                        medianprops={"color": _pal["trend"], "linewidth": 1.5},
                        whiskerprops={"color": "#64748b"},
                        capprops={"color": "#64748b"},
                        flierprops={"marker": "o", "color": instr.color, "alpha": 0.4, "markersize": 3})
        for patch in bp["boxes"]:
            patch.set_facecolor(instr.color)
            patch.set_alpha(0.6)
        ax.set_ylabel(_words(y))
    else:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()[:8]
        data = [df[c].dropna().values for c in numeric_cols]
        bp = ax.boxplot(data, patch_artist=True, labels=numeric_cols,
                        medianprops={"color": _pal["trend"], "linewidth": 1.5},
                        whiskerprops={"color": "#64748b"},
                        capprops={"color": "#64748b"})
        for patch in bp["boxes"]:
            patch.set_facecolor(instr.color)
            patch.set_alpha(0.6)

    ax.set_xlabel(_words(x))
    _title(ax, instr.title)
    plt.xticks(rotation=25, ha="right", fontsize=8)
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    return _to_png_base64(fig)


def _heatmap(df: pd.DataFrame, instr: ChartInstruction) -> str:
    numeric_df = df.select_dtypes(include=[np.number])
    if len(numeric_df.columns) < 2:
        return None

    corr = numeric_df.corr()
    fig, ax = plt.subplots(figsize=(max(6, len(corr.columns) * 0.8), max(5, len(corr.columns) * 0.7)))
    sns.heatmap(
        corr, ax=ax, annot=True, fmt=".2f", cmap="coolwarm",
        linewidths=0.5, linecolor=_pal["edge"],
        annot_kws={"size": 8},
        cbar_kws={"shrink": 0.8},
    )
    _title(ax, instr.title)
    plt.xticks(rotation=35, ha="right", fontsize=8)
    plt.yticks(fontsize=8)
    fig.tight_layout()
    return _to_png_base64(fig)


def _grouped_bar_chart(df: pd.DataFrame, instr: ChartInstruction) -> str:
    """Grouped bar chart — compares a metric across two categorical dimensions."""
    x = _safe_col(df, instr.xColumn)
    y = _safe_col(df, instr.yColumn)
    g = _safe_col(df, instr.groupColumn) if instr.groupColumn else None

    if not x or not y:
        return _bar_chart(df, instr)   # graceful fallback

    if g and g in df.columns and df[g].nunique() <= 12:
        numeric    = pd.api.types.is_numeric_dtype(df[y])
        fig, ax = plt.subplots(figsize=(10, 5))
        groups     = df[g].dropna().unique()[:6]
        x_vals     = df[x].dropna().unique()[:12]
        n_groups   = len(groups)
        x_indices  = np.arange(len(x_vals))
        bar_width  = 0.8 / max(n_groups, 1)
        colors     = ([_pal["colors"][i % len(_pal["colors"])] for i in range(n_groups)] if _pal["themed"]
                      else plt.cm.Blues(np.linspace(0.4, 0.9, n_groups)))

        for gi, (grp, col) in enumerate(zip(groups, colors)):
            subset  = df[df[g] == grp]
            at_x    = [subset[subset[x] == xv] for xv in x_vals]
            heights = [(rows[y].mean() if numeric else len(rows)) if len(rows) else 0 for rows in at_x]
            offset  = (gi - n_groups / 2 + 0.5) * bar_width
            ax.bar(x_indices + offset, heights, bar_width * 0.9,
                   label=str(grp), color=col, alpha=0.9, edgecolor=_pal["edge"], linewidth=0.4)

        ax.set_xticks(x_indices)
        ax.set_xticklabels([str(v) for v in x_vals], rotation=35, ha="right", fontsize=8)
        ax.set_xlabel(_words(x))
        ax.set_ylabel(_words(y) if numeric else "Count")
        _title(ax, instr.title)
        ax.legend(title=_words(g), fontsize=7, title_fontsize=8)
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
        ax.grid(axis="y", alpha=0.3)
        fig.tight_layout()
        return _to_png_base64(fig)
    else:
        return _bar_chart(df, instr)


def _multi_line_chart(df: pd.DataFrame, instr: ChartInstruction) -> str:
    """Multi-line chart — multiple numeric series over the same temporal axis."""
    x = _safe_col(df, instr.xColumn)
    if not x:
        return None

    # Resolve y_columns list
    y_cols = [_safe_col(df, c) for c in (instr.yColumns or []) if _safe_col(df, c)]

    # Fallback: if no y_columns, use single yColumn
    if not y_cols and instr.yColumn:
        yc = _safe_col(df, instr.yColumn)
        if yc:
            y_cols = [yc]

    if not y_cols:
        return _line_chart(df, instr)

    colors_cycle = [instr.color] + [c for c in _pal["colors"] if c != instr.color]
    fig, ax = plt.subplots(figsize=(9, 5))

    for i, yc in enumerate(y_cols[:5]):
        if not pd.api.types.is_numeric_dtype(df[yc]):
            continue
        if pd.api.types.is_numeric_dtype(df[x]):
            sorted_df = df[[x, yc]].dropna().sort_values(x)
            ax.plot(sorted_df[x], sorted_df[yc],
                    color=colors_cycle[i % len(colors_cycle)],
                    linewidth=2, marker="o", markersize=3, label=_words(yc))
        else:
            data = df.groupby(x)[yc].mean()
            ax.plot(data.index.astype(str), data.values,
                    color=colors_cycle[i % len(colors_cycle)],
                    linewidth=2, marker="o", markersize=3, label=_words(yc))

    ax.set_xlabel(_words(x))
    ax.set_ylabel("Value")
    _title(ax, instr.title)
    ax.legend(fontsize=8)
    plt.xticks(rotation=35, ha="right", fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    return _to_png_base64(fig)


_CHART_BUILDERS = {
    "bar":         _bar_chart,
    "line":        _line_chart,
    "scatter":     _scatter_chart,
    "histogram":   _histogram,
    "box":         _box_chart,
    "heatmap":     _heatmap,
    "grouped_bar": _grouped_bar_chart,
    "multi_line":  _multi_line_chart,
}


MAX_CHARTS = 5
"""Kept in step with gemini_client.MAX_CHARTS and AnalysisService's Take(5)."""


def _is_measure(df: pd.DataFrame, column: str | None) -> bool:
    name = _safe_col(df, column) if column else None
    return bool(name) and pd.api.types.is_numeric_dtype(df[name])


def generate_charts(df: pd.DataFrame, instructions: List[ChartInstruction],
                    style: Optional[Dict[str, Any]] = None,
                    names: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    """
    `names` renames columns for the axes only (readable_names): the data and
    each instruction are renamed together, so every chart finds its columns.

    Generate charts from LLM instructions, in the report's look when `style`
    (Look.chart_style()) is given: each chart takes the theme's next colour.
    Routes to correct builder including complex types (grouped_bar, multi_line).
    Also routes simple bar/line charts with subtype/groupColumn to the complex builders.
    Returns list of {type, label, desc, color, insight_index, image_base64} — max 5 charts.
    """
    if names:
        df = df.rename(columns=names)
        rename = lambda c: names.get(c, c) if isinstance(c, str) else c
        instructions = [replace(i, xColumn=rename(i.xColumn), yColumn=rename(i.yColumn),
                                groupColumn=rename(i.groupColumn), yColumns=[rename(c) for c in i.yColumns])
                        for i in instructions]
    results = []
    counted = set()   # x columns already shown as a count, so no chart repeats
    # Truncation is announced rather than silent. The slice used to be a bare
    # [:5]: when depth="deep" asked the model for 7 charts, two were discarded
    # here with no trace, so the report simply had fewer charts than the
    # customization implied and nothing said why.
    if len(instructions) > MAX_CHARTS:
        print(f"[Chart] {len(instructions)} instructions received, keeping the first "
              f"{MAX_CHARTS} — the backend stores no more than that.")
    with drawn_in(style):
        for i, instr in enumerate(instructions[:MAX_CHARTS]):
            if style:
                instr = replace(instr, color=_pal["colors"][i % len(_pal["colors"])])
            _one_chart(df, instr, counted, results)
    if names:
        # The stored spec redraws the chart from the real file later, so it
        # keeps the file's own column names.
        back = {v: k for k, v in names.items()}
        orig = lambda c: back.get(c, c) if isinstance(c, str) else c
        for r in results:
            spec = r.get("spec") or {}
            r["spec"] = {**spec, "x": orig(spec.get("x")), "y": orig(spec.get("y")),
                         "group": orig(spec.get("group")),
                         "yColumns": [orig(c) for c in spec.get("yColumns") or []]}
    return results


def _one_chart(df: pd.DataFrame, instr: ChartInstruction, counted: set, results: List[Dict[str, Any]]) -> None:
    """Draw one instruction into `results`, falling back to a count when it cannot be drawn as asked."""
    chart_type = instr.chartType.lower()

    # Route subtypes even when base type is simple
    if chart_type == "bar" and instr.chartSubtype == "grouped" and instr.groupColumn:
        chart_type = "grouped_bar"
    elif chart_type == "line" and (instr.chartSubtype == "multi_line" or instr.yColumns):
        chart_type = "multi_line"

    builder = _CHART_BUILDERS.get(chart_type, _bar_chart)
    drawn = instr
    try:
        img_b64 = builder(df, instr)
    except Exception as e:
        print(f"[Chart] Could not draw '{instr.title}' as {chart_type}: {e}")
        plt.close("all")
        img_b64 = None

    # Most of these want numbers, and a file of text has none: 19 of 32 ways
    # of asking for a chart of one drew nothing. Counting always works.
    if not img_b64 and instr.xColumn not in counted:
        try:
            drawn = replace(instr, yColumn=None, groupColumn=None, yColumns=[])
            img_b64 = _bar_chart(df, drawn)
            chart_type = "bar"
        except Exception as e:
            print(f"[Chart] Failed to generate '{instr.title}': {e}")
            plt.close("all")
    if not img_b64:
        return

    if chart_type == "bar" and not _is_measure(df, instr.yColumn):
        counted.add(instr.xColumn)
    results.append({
        "type":          chart_type,
        "label":         instr.title,
        "desc":          instr.description,
        "color":         instr.color,
        "insight_index": instr.insightIndex,
        "image_base64":  img_b64,
        # The columns it was drawn from, so it can be drawn again as
        # another kind of chart. See report_document and report_changes.
        "spec":          spec_of(drawn),
    })


def spec_of(instr: ChartInstruction) -> Dict[str, Any]:
    """The columns a chart was drawn from."""
    return {"x": instr.xColumn, "y": instr.yColumn, "group": instr.groupColumn,
            "yColumns": list(instr.yColumns or []), "aggregate": instr.aggregate or ""}


# The kinds of chart a person can ask for in the chat. A heatmap of every
# numeric column and a multi-line chart need more than a column or two named.
DRAWABLE = ("bar", "line", "scatter", "histogram", "box", "grouped_bar")


def draw_chart(df: pd.DataFrame, instr: ChartInstruction, style: Optional[Dict[str, Any]] = None) -> str | None:
    """
    One chart exactly as asked, as base64 PNG, or None when it cannot be drawn.

    Unlike generate_charts there is no fallback to a count: a person who asked
    for a scatter of two columns should hear that it could not be drawn, not
    be handed a bar chart of something else.
    """
    builder = _CHART_BUILDERS.get(instr.chartType)
    if builder is None or instr.chartType not in DRAWABLE:
        return None
    try:
        with drawn_in(style):
            if style:
                instr = replace(instr, color=_pal["colors"][0])
            return builder(df, instr)
    except Exception as e:
        print(f"[Chart] Could not draw '{instr.title}' as {instr.chartType}: {e}")
        plt.close("all")
        return None
