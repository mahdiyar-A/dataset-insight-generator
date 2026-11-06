"""
Scatter charts, split by group or not.

The drawing is captured before it becomes a PNG, so these read the slopes and
labels actually plotted.
"""

import base64

import numpy as np
import pandas as pd
import pytest

from ai_engine.charts import chart_generator
from ai_engine.charts.chart_generator import _scatter_chart, generate_charts
from ai_engine.core.confidence import split_misleading_scatters
from ai_engine.models.models import ChartInstruction, StatsSummary


def instruction(group=None, x="x", y="y", chart_type="scatter"):
    return ChartInstruction(index=1, chartType=chart_type, title="t", xColumn=x, yColumn=y, description="",
                            insightIndex=1, color="#3b82f6", groupColumn=group)


@pytest.fixture
def drawn(monkeypatch):
    """Keep the figure instead of encoding it."""
    monkeypatch.setattr(chart_generator, "_to_png_base64", lambda fig: fig)


def regions(names=("North", "East", "South", "West"), per_group=300, seed=1):
    """y falls with x inside every region, while richer regions have more of both."""
    rng = np.random.default_rng(seed)
    frames = []
    for i, name in enumerate(names):
        centre = i * 4.0
        x = rng.normal(centre, 2.0, per_group)
        y = 3.0 * centre - 0.8 * (x - centre) + rng.normal(0, 1.0, per_group)
        frames.append(pd.DataFrame({"x": x, "y": y, "region": name}))
    return pd.concat(frames, ignore_index=True)


def slope(line):
    (x0, x1), (y0, y1) = line.get_xdata(), line.get_ydata()
    return (y1 - y0) / (x1 - x0)


def lines_by_style(fig):
    ax = fig.axes[0]
    return ([l for l in ax.lines if l.get_linestyle() == "-"],
            [l for l in ax.lines if l.get_linestyle() == "--"])


def test_each_group_gets_its_own_line_against_the_overall_one(drawn):
    fig = _scatter_chart(regions(names=("North", "East", "South")), instruction("region"))

    groups, overall = lines_by_style(fig)
    assert len(groups) == 3
    assert all(slope(line) < 0 for line in groups)
    assert len(overall) == 1 and slope(overall[0]) > 0

    labels = fig.axes[0].get_legend_handles_labels()[1]
    assert set(labels) == {"North", "East", "South", "Overall trend"}


def test_groups_past_three_are_drawn_as_other_groups(drawn):
    # Rows are never hidden: dropping them would change what the chart shows.
    df = regions(names=("North", "East", "South", "West", "Central"))

    fig = _scatter_chart(df, instruction("region"))

    ax = fig.axes[0]
    assert "Other groups" in ax.get_legend_handles_labels()[1]
    assert sum(len(c.get_offsets()) for c in ax.collections) == 500
    assert len(lines_by_style(fig)[0]) == 3


def test_a_groups_line_is_fitted_on_all_its_rows_not_the_plotted_sample(drawn):
    df = regions(names=("North", "East"), per_group=3000)

    fig = _scatter_chart(df, instruction("region"))

    rows = df[df["region"] == df["region"].value_counts().index[0]]
    expected = np.polyfit(rows["x"], rows["y"], 1)[0]
    assert slope(lines_by_style(fig)[0][0]) == pytest.approx(expected)


def test_identity_is_not_carried_by_colour_alone(drawn):
    fig = _scatter_chart(regions(names=("North", "East", "South")), instruction("region"))

    ax = fig.axes[0]
    shapes = {c.get_paths()[0].vertices.tobytes() for c in ax.collections}
    assert len(shapes) == 3
    assert {t.get_text() for t in ax.texts} == {"North", "East", "South"}


def test_a_chart_without_a_group_is_as_it_was(drawn):
    fig = _scatter_chart(regions(), instruction())

    ax = fig.axes[0]
    assert len(ax.collections) == 1
    assert ax.get_legend_handles_labels()[1] == ["Trend"]


def test_the_chart_is_the_same_every_time(drawn):
    first = _scatter_chart(regions(), instruction("region")).axes[0].collections[0].get_offsets()
    second = _scatter_chart(regions(), instruction("region")).axes[0].collections[0].get_offsets()

    assert np.array_equal(first, second)


@pytest.mark.parametrize("group", ["not_a_column", "x", "y", "id", "one"])
def test_a_group_that_cannot_group_falls_back_to_a_plain_chart(drawn, group):
    df = regions()
    df["id"] = [f"row{i}" for i in range(len(df))]
    df["one"] = "same"

    fig = _scatter_chart(df, instruction(group))

    assert len(fig.axes[0].collections) == 1


def test_many_missing_values_do_not_lose_the_chart():
    # 1,000 rows with 300 complete pairs asked for a sample of 500 from 300,
    # which raised, and generate_charts dropped the chart without a word.
    df = regions(per_group=250)
    df.loc[df.index[300:], "y"] = np.nan

    charts = generate_charts(df, [instruction()])

    assert len(charts) == 1


def test_nothing_to_plot_is_no_chart():
    df = pd.DataFrame({"x": [1.0, np.nan], "y": [np.nan, 2.0]})

    assert _scatter_chart(df, instruction()) is None


def test_a_group_of_one_x_value_still_draws():
    df = regions(names=("North", "East"))
    df.loc[df["region"] == "East", "x"] = 3.0

    charts = generate_charts(df, [instruction("region")])

    assert base64.b64decode(charts[0]["image_base64"])[:4] == b"\x89PNG"


def test_a_text_column_on_an_axis_still_draws_without_a_line():
    df = regions()
    df["label"] = df["region"]

    charts = generate_charts(df, [instruction(x="label")])

    assert len(charts) == 1


# ── A misleading pair is always split ─────────────────────────────────────────

def summary(checks):
    return StatsSummary(rowCount=10, columnCount=3, columnTypes={}, missingPercentages={}, numericStats={},
                        topCorrelations=[], categoricalSummaries={}, outlierSummary={}, detectedIssues=[],
                        correlationChecks=checks)


CHECKS = [{"a": "spend", "b": "revenue", "by": "region", "kind": "reversed"}]


@pytest.mark.parametrize("x, y", [("spend", "revenue"), ("revenue", "spend")])
def test_a_plain_scatter_of_a_misleading_pair_is_split(x, y):
    # Risk: the writer is told to split it and does not. The chart would then
    # show one rising line beside text saying the opposite.
    chart = instruction(x=x, y=y)

    split_misleading_scatters([chart], summary(CHECKS))

    assert chart.groupColumn == "region"


def test_other_charts_are_left_alone():
    other_pair = instruction(x="spend", y="units")
    other_type = instruction(x="spend", y="revenue", chart_type="line")
    no_y = instruction(x="spend", y=None)
    chosen = instruction("channel", x="spend", y="revenue")

    split_misleading_scatters([other_pair, other_type, no_y, chosen], summary(CHECKS))

    assert other_pair.groupColumn is None
    assert other_type.groupColumn is None
    assert no_y.groupColumn is None
    assert chosen.groupColumn == "channel"


# ── A chart shows what its title says ────────────────────────────────────────

def daily_sales(days=200, rows_per_day=4):
    dates = pd.date_range("2025-01-01", periods=days).repeat(rows_per_day).strftime("%Y-%m-%d")
    return pd.DataFrame({"date": dates, "revenue": 10.0, "store": ["A", "B"] * (days * rows_per_day // 2)})


def titled(title, x, y, chart_type):
    return ChartInstruction(index=1, chartType=chart_type, title=title, xColumn=x, yColumn=y, description="",
                            insightIndex=1, color="#3b82f6")


def test_a_weekly_total_is_a_total(drawn):
    # A model titled weekly averages "Weekly Total Revenue".
    fig = chart_generator._line_chart(daily_sales(), titled("Weekly Total Revenue", "date", "revenue", "line"))
    ax = fig.axes[0]
    assert max(ax.lines[0].get_ydata()) == 10.0 * 4 * 7
    assert ax.get_ylabel() == "revenue (total)"


def test_a_line_with_no_total_in_its_title_says_it_is_an_average(drawn):
    fig = chart_generator._line_chart(daily_sales(), titled("Revenue over time", "date", "revenue", "line"))
    ax = fig.axes[0]
    assert set(ax.lines[0].get_ydata()) == {10.0}
    assert ax.get_ylabel() == "revenue (average)"


@pytest.mark.parametrize("title, height, label", [
    ("Total Revenue by Store", 4000.0, "revenue (total)"),
    ("Average Revenue by Store", 10.0, "revenue (average)"),
    ("Subtotals by Store", 10.0, "revenue (average)"),
])
def test_a_bar_shows_what_its_title_says(drawn, title, height, label):
    fig = chart_generator._bar_chart(daily_sales(), titled(title, "store", "revenue", "bar"))
    ax = fig.axes[0]
    assert ax.patches[0].get_height() == height
    assert ax.get_ylabel() == label


def test_a_week_with_no_sales_is_left_out_not_drawn_as_nothing(drawn):
    df = daily_sales()
    df = df[~df["date"].between("2025-03-01", "2025-03-20")]
    fig = chart_generator._line_chart(df, titled("Weekly Total Revenue", "date", "revenue", "line"))
    assert min(fig.axes[0].lines[0].get_ydata()) > 0
