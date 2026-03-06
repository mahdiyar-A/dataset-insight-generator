import io
import base64
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import seaborn as sns
from typing import List, Dict, Any
from ai_engine.models.models import ChartInstruction

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
    "font.family":       "DejaVu Sans",
    "font.size":         10,
})


def _to_png_base64(fig) -> str:
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


def _bar_chart(df: pd.DataFrame, instr: ChartInstruction) -> str:
    x = _safe_col(df, instr.xColumn)
    y = _safe_col(df, instr.yColumn)
    if not x:
        return None

    fig, ax = plt.subplots(figsize=(8, 4.5))

    if y and pd.api.types.is_numeric_dtype(df[y]):
        data = df.groupby(x)[y].mean().sort_values(ascending=False).head(15)
        ax.bar(data.index.astype(str), data.values, color=instr.color, alpha=0.85, edgecolor="#0f172a", linewidth=0.5)
        ax.set_ylabel(y)
    else:
        data = df[x].value_counts().head(15)
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

    if pd.api.types.is_numeric_dtype(df[x]):
        sorted_df = df[[x, y]].dropna().sort_values(x)
        ax.plot(sorted_df[x], sorted_df[y], color=instr.color, linewidth=2, alpha=0.9)
        ax.fill_between(sorted_df[x], sorted_df[y], alpha=0.15, color=instr.color)
    else:
        data = df.groupby(x)[y].mean()
        ax.plot(data.index.astype(str), data.values, color=instr.color, linewidth=2, marker="o", markersize=4)

    ax.set_xlabel(x)
    ax.set_ylabel(y)
    ax.set_title(instr.title, fontsize=12, fontweight="bold", pad=12)
    plt.xticks(rotation=35, ha="right", fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    return _to_png_base64(fig)


def _scatter_chart(df: pd.DataFrame, instr: ChartInstruction) -> str:
    x = _safe_col(df, instr.xColumn)
    y = _safe_col(df, instr.yColumn)
    if not x or not y:
        return None

    fig, ax = plt.subplots(figsize=(7, 5))
    sample = df[[x, y]].dropna().sample(min(500, len(df)))  # cap at 500 points
    ax.scatter(sample[x], sample[y], color=instr.color, alpha=0.55, s=20, edgecolors="none")

    # Add trend line
    try:
        z = np.polyfit(sample[x].astype(float), sample[y].astype(float), 1)
        p = np.poly1d(z)
        xline = np.linspace(sample[x].min(), sample[x].max(), 100)
        ax.plot(xline, p(xline), color="#f8fafc", linewidth=1.2, linestyle="--", alpha=0.6, label="Trend")
        ax.legend(fontsize=8)
    except Exception:
        pass

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


_CHART_BUILDERS = {
    "bar":       _bar_chart,
    "line":      _line_chart,
    "scatter":   _scatter_chart,
    "histogram": _histogram,
    "box":       _box_chart,
    "heatmap":   _heatmap,
}


def generate_charts(df: pd.DataFrame, instructions: List[ChartInstruction]) -> List[Dict[str, Any]]:
    """
    Generate charts from LLM instructions.
    Returns list of {type, label, desc, color, image_base64} — max 5 charts.
    """
    results = []
    for instr in instructions[:5]:
        chart_type = instr.chartType.lower()
        builder    = _CHART_BUILDERS.get(chart_type, _bar_chart)
        try:
            img_b64 = builder(df, instr)
            if img_b64:
                results.append({
                    "type":         chart_type,
                    "label":        instr.title,
                    "desc":         instr.description,
                    "color":        instr.color,
                    "insight_index": instr.insightIndex,
                    "image_base64": img_b64,
                })
        except Exception as e:
            # Chart failed — skip it, don't fail the whole pipeline
            print(f"[Chart] Failed to generate '{instr.title}': {e}")

    return results
