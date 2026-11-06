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
from typing import List, Dict, Any
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


MAX_SCATTER_POINTS = 500
MAX_SCATTER_LEVELS = 20    # beyond this a column is labels, not groups
# In a scatter any group can sit beside any other, so these must stay apart in
# every pairing, for colour-blind readers too, on the axes colour above. Three
# is as many as that allows; the rest of the rows are drawn as other groups.
GROUP_COLORS = ["#3987e5", "#d95926", "#199e70"]
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


def _to_png_base64(fig) -> str:
    try:
        _fix_rtl_text(fig)
    except Exception as e:  # a label problem must not cost the chart
        print(f"[Chart] right-to-left labels left as they were: {e}")
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


def _measure(title: str) -> str:
    """
    "sum" when a chart's title promises totals, otherwise "mean".

    A model writes the title. One called a chart "Weekly Total Revenue" over
    weekly averages, so a week of 7,000 read as 160.
    """
    return "sum" if re.search(r"\b(totals?|sums?)\b", title or "", re.IGNORECASE) else "mean"


def _axis_label(column: str, how: str) -> str:
    return f"{column} ({'total' if how == 'sum' else 'average'})"


def _bar_chart(df: pd.DataFrame, instr: ChartInstruction) -> str:
    x = _safe_col(df, instr.xColumn)
    y = _safe_col(df, instr.yColumn)
    if not x:
        return None

    top_n = _infer_top_n(instr.title)
    fig, ax = plt.subplots(figsize=(8, 4.5))

    if y and pd.api.types.is_numeric_dtype(df[y]):
        how = _measure(instr.title)
        data = df.groupby(x)[y].agg(how).sort_values(ascending=False).head(top_n)
        ax.bar(data.index.astype(str), data.values, color=instr.color, alpha=0.85, edgecolor="#0f172a", linewidth=0.5)
        ax.set_ylabel(_axis_label(y, how))
    else:
        data = df[x].value_counts().head(top_n)
        ax.bar(data.index.astype(str), data.values, color=instr.color, alpha=0.85, edgecolor="#0f172a", linewidth=0.5)
        ax.set_ylabel("Count")

    ax.set_xlabel(x)
    ax.set_title(instr.title, fontsize=12, fontweight="bold", pad=12)
    plt.xticks(rotation=35, ha="right", fontsize=8)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    return _to_png_base64(fig)


def _line_chart(df: pd.DataFrame, instr: ChartInstruction) -> str:
    x = _safe_col(df, instr.xColumn)
    y = _safe_col(df, instr.yColumn)
    if not x or not y:
        return None

    fig, ax = plt.subplots(figsize=(8, 4.5))
    how = _measure(instr.title)
    y_label = _axis_label(y, how)

    if pd.api.types.is_numeric_dtype(df[x]):
        y_label = y
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
                periods = data.resample("W" if span_days <= 730 else "MS")
                data = (periods.sum(min_count=1) if how == "sum" else periods.mean()).dropna()
            ax.plot(data.index, data.values, color=instr.color, linewidth=2, marker="o", markersize=3)
            fig.autofmt_xdate()
        else:
            data = series.groupby(x)[y].agg(how)
            ax.plot(data.index.astype(str), data.values, color=instr.color, linewidth=2, marker="o", markersize=4)
            if len(data) > 25:
                # Many categories: label a readable subset rather than all of them.
                from matplotlib.ticker import MaxNLocator
                ax.xaxis.set_major_locator(MaxNLocator(nbins=20))

    ax.set_xlabel(x)
    ax.set_ylabel(y_label)
    ax.set_title(instr.title, fontsize=12, fontweight="bold", pad=12)
    plt.xticks(rotation=35, ha="right", fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    return _to_png_base64(fig)


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
    levels = points[g].value_counts().index[:len(GROUP_COLORS)]
    rest = sample[~sample[g].isin(levels)]
    if len(rest):
        ax.scatter(rest[x], rest[y], color=OTHER_GROUPS_COLOR, alpha=0.35, s=14, edgecolors="none",
                   label="Other groups")
    for level, color, marker in zip(levels, GROUP_COLORS, GROUP_MARKERS):
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
    _trend_line(ax, points, sample, x, y, color="#f8fafc", linewidth=1.2, linestyle="--", alpha=0.6,
                label="Overall trend" if grouped else "Trend")
    if ax.get_legend_handles_labels()[0]:
        ax.legend(fontsize=8)

    ax.set_xlabel(x)
    ax.set_ylabel(y)
    ax.set_title(instr.title, fontsize=12, fontweight="bold", pad=12)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    return _to_png_base64(fig)


def _histogram(df: pd.DataFrame, instr: ChartInstruction) -> str:
    x = _safe_col(df, instr.xColumn)
    if not x:
        return None

    fig, ax = plt.subplots(figsize=(7, 4.5))
    series = df[x].dropna()
    ax.hist(series, bins=30, color=instr.color, alpha=0.8, edgecolor="#0f172a", linewidth=0.4)

    # Mean + median lines
    ax.axvline(series.mean(),   color="#f8fafc", linestyle="--", linewidth=1.2, alpha=0.8, label=f"Mean: {series.mean():.2f}")
    ax.axvline(series.median(), color="#fbbf24", linestyle=":",  linewidth=1.2, alpha=0.8, label=f"Median: {series.median():.2f}")
    ax.legend(fontsize=8)

    ax.set_xlabel(x)
    ax.set_ylabel("Frequency")
    ax.set_title(instr.title, fontsize=12, fontweight="bold", pad=12)
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
                        medianprops={"color": "#f8fafc", "linewidth": 1.5},
                        whiskerprops={"color": "#64748b"},
                        capprops={"color": "#64748b"},
                        flierprops={"marker": "o", "color": instr.color, "alpha": 0.4, "markersize": 3})
        for patch in bp["boxes"]:
            patch.set_facecolor(instr.color)
            patch.set_alpha(0.6)
        ax.set_ylabel(y)
    else:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()[:8]
        data = [df[c].dropna().values for c in numeric_cols]
        bp = ax.boxplot(data, patch_artist=True, labels=numeric_cols,
                        medianprops={"color": "#f8fafc", "linewidth": 1.5},
                        whiskerprops={"color": "#64748b"},
                        capprops={"color": "#64748b"})
        for patch in bp["boxes"]:
            patch.set_facecolor(instr.color)
            patch.set_alpha(0.6)

    ax.set_xlabel(x)
    ax.set_title(instr.title, fontsize=12, fontweight="bold", pad=12)
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
        linewidths=0.5, linecolor="#0f172a",
        annot_kws={"size": 8},
        cbar_kws={"shrink": 0.8},
    )
    ax.set_title(instr.title, fontsize=12, fontweight="bold", pad=12)
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
        fig, ax = plt.subplots(figsize=(10, 5))
        groups     = df[g].dropna().unique()[:6]
        x_vals     = df[x].dropna().unique()[:12]
        n_groups   = len(groups)
        x_indices  = np.arange(len(x_vals))
        bar_width  = 0.8 / max(n_groups, 1)
        colors     = plt.cm.Blues(np.linspace(0.4, 0.9, n_groups))

        for gi, (grp, col) in enumerate(zip(groups, colors)):
            subset = df[df[g] == grp]
            means  = [subset[subset[x] == xv][y].mean() if xv in subset[x].values else 0
                      for xv in x_vals]
            offset = (gi - n_groups / 2 + 0.5) * bar_width
            ax.bar(x_indices + offset, means, bar_width * 0.9,
                   label=str(grp), color=col, alpha=0.85, edgecolor="#0f172a", linewidth=0.4)

        ax.set_xticks(x_indices)
        ax.set_xticklabels([str(v) for v in x_vals], rotation=35, ha="right", fontsize=8)
        ax.set_xlabel(x)
        ax.set_ylabel(y)
        ax.set_title(instr.title, fontsize=12, fontweight="bold", pad=12)
        ax.legend(title=str(g), fontsize=7, title_fontsize=8)
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

    colors_cycle = [instr.color, "#a855f7", "#10b981", "#f97316", "#ec4899"]
    fig, ax = plt.subplots(figsize=(9, 5))

    for i, yc in enumerate(y_cols[:5]):
        if not pd.api.types.is_numeric_dtype(df[yc]):
            continue
        if pd.api.types.is_numeric_dtype(df[x]):
            sorted_df = df[[x, yc]].dropna().sort_values(x)
            ax.plot(sorted_df[x], sorted_df[yc],
                    color=colors_cycle[i % len(colors_cycle)],
                    linewidth=2, marker="o", markersize=3, label=yc)
        else:
            data = df.groupby(x)[yc].mean()
            ax.plot(data.index.astype(str), data.values,
                    color=colors_cycle[i % len(colors_cycle)],
                    linewidth=2, marker="o", markersize=3, label=yc)

    ax.set_xlabel(x)
    ax.set_ylabel("Value")
    ax.set_title(instr.title, fontsize=12, fontweight="bold", pad=12)
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


def generate_charts(df: pd.DataFrame, instructions: List[ChartInstruction]) -> List[Dict[str, Any]]:
    """
    Generate charts from LLM instructions.
    Routes to correct builder including complex types (grouped_bar, multi_line).
    Also routes simple bar/line charts with subtype/groupColumn to the complex builders.
    Returns list of {type, label, desc, color, insight_index, image_base64} — max 5 charts.
    """
    results = []
    # Truncation is announced rather than silent. The slice used to be a bare
    # [:5]: when depth="deep" asked the model for 7 charts, two were discarded
    # here with no trace, so the report simply had fewer charts than the
    # customization implied and nothing said why.
    if len(instructions) > MAX_CHARTS:
        print(f"[Chart] {len(instructions)} instructions received, keeping the first "
              f"{MAX_CHARTS} — the backend stores no more than that.")
    for instr in instructions[:MAX_CHARTS]:
        chart_type = instr.chartType.lower()

        # Route subtypes even when base type is simple
        if chart_type == "bar" and instr.chartSubtype == "grouped" and instr.groupColumn:
            chart_type = "grouped_bar"
        elif chart_type == "line" and (instr.chartSubtype == "multi_line" or instr.yColumns):
            chart_type = "multi_line"

        builder = _CHART_BUILDERS.get(chart_type, _bar_chart)
        try:
            img_b64 = builder(df, instr)
            if img_b64:
                results.append({
                    "type":          chart_type,
                    "label":         instr.title,
                    "desc":          instr.description,
                    "color":         instr.color,
                    "insight_index": instr.insightIndex,
                    "image_base64":  img_b64,
                })
        except Exception as e:
            print(f"[Chart] Failed to generate '{instr.title}': {e}")

    return results
