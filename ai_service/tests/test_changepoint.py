"""
Telling a moment from a drift.

A trend test calls a jump steady growth and a rise then a fall no trend at all.
The expensive mistake is naming a moment that never happened, so most of these
are about staying quiet on smooth curves, waves and series that wander. Rates
are read across many random series, because one lucky series proves nothing.
"""

from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from ai_engine.core.changepoint import (
    _candidates,
    _describe,
    _pattern,
    _simulate,
    _wander,
    find_shift,
    labelled_shift,
)
from ai_engine.core.confidence import count_evidence
from ai_engine.core.domain_stats import trend
from ai_engine.core.stat_tests import mann_kendall
from ai_engine.core.stats_analyzer import build_stats_summary
from ai_engine.llm.query_tools import run_query
from ai_engine.llm.stats_digest import build_digest
from ai_engine.models.models import DomainResult, StatsSummary

DOMAIN = DomainResult(domain="sales", confidence=0.9, is_analyzable=True, analysis_focus=[],
                      key_questions=[], column_decisions={}, attribute_interpretations={})
RUNS = 60
T = np.arange(36.0)
LONG = np.arange(60.0)


def with_memory(rng, n, memory):
    """Noise where each value carries this much of the one before."""
    out = np.empty(n + 100)
    out[0] = rng.standard_normal()
    for i in range(1, n + 100):
        out[i] = memory * out[i - 1] + np.sqrt(1 - memory ** 2) * rng.standard_normal()
    return out[100:]


def flagged(make, kind=None, runs=RUNS):
    """Share of random series with a change found, of this kind if one is given."""
    found = [find_shift(make(np.random.default_rng(seed)), seed=seed) for seed in range(runs)]
    return sum(1 for f in found if f and (kind is None or f["kind"] == kind)) / runs


def exact_step(n):
    return np.where(np.arange(n) < n // 2, 10.0, 20.0)


class TestSteps:
    def test_a_step_is_found_and_dated(self):
        def make(rng):
            return 100 + 6 * (T >= 20) + rng.standard_normal(36)

        assert flagged(make, "step") >= 0.95
        found = find_shift(make(np.random.default_rng(1)))
        assert abs(found["position"] - 20) <= 1 and found["earliest"] <= 20 <= found["latest"]

    def test_a_trend_test_alone_calls_a_step_steady_growth(self):
        y = 100 + 6 * (T >= 18) + np.random.default_rng(2).standard_normal(36)
        assert mann_kendall(y)["p"] < 0.001, "the test this exists to correct must be fooled"
        assert find_shift(y)["kind"] == "step"

    def test_the_levels_either_side_are_reported(self):
        found = find_shift(100 + 30 * (T >= 20) + np.random.default_rng(3).standard_normal(36))
        assert found["before"] == pytest.approx(100, abs=2)
        assert found["after"] == pytest.approx(130, abs=2)
        assert found["changePct"] == pytest.approx(30, abs=3)

    def test_a_slope_around_a_step_does_not_count_towards_its_size(self):
        y = 100 + 2 * T + 30 * (T >= 20) + np.random.default_rng(4).standard_normal(36)
        found = find_shift(y)
        assert found["kind"] == "step"
        assert found["before"] == pytest.approx(140, abs=3), "the level just before, not at the start"
        assert found["after"] - found["before"] == pytest.approx(30, abs=3)

    def test_a_sudden_drop_in_a_rising_series_is_found(self):
        # It runs against the slope, the way a step imitating a wave does, and
        # it is the story a reader most wants: a big customer lost in March.
        def make(rng):
            return T / 2 - 8 * (T >= 18) + rng.standard_normal(36)

        assert flagged(make, "step") >= 0.9
        found = find_shift(make(np.random.default_rng(5)))
        assert found["after"] < found["before"]

    def test_only_a_jump_the_slope_takes_back_is_held_to_the_stricter_bar(self):
        # That is the shape of a step imitating a wave. Going with the slope, or
        # against one too slight to undo it, is not, and either is found 8 times in
        # 10 under this much memory. The stricter bar would cost a quarter to a half.
        assert flagged(lambda r: LONG / 4 + 6 * (LONG >= 30) + with_memory(r, 60, 0.4), "step", runs=100) >= 0.7
        assert flagged(lambda r: 6 * (LONG >= 30) + with_memory(r, 60, 0.4), "step", runs=100) >= 0.72

    def test_a_step_with_no_noise_at_all(self):
        # A price list: one fee, then another. Nothing is left over to read.
        found = find_shift(exact_step(30))
        assert found["kind"] == "step" and found["earliest"] == found["latest"] == 15
        assert (found["before"], found["after"]) == (pytest.approx(10), pytest.approx(20))

    def test_a_step_with_a_slope_and_no_noise(self):
        found = find_shift(3 * T + 50 * (T >= 12))
        assert found["kind"] == "step" and found["position"] == 12

    def test_the_jump_itself_is_not_read_as_memory(self):
        y = 500 * (T >= 18) + np.random.default_rng(6).standard_normal(36)
        assert _wander(y, 18) < 0.4


class TestTurningPoints:
    def test_a_rise_then_a_fall_that_a_trend_test_misses(self):
        def make(rng):
            return np.minimum(T, 36 - T) / 2 + rng.standard_normal(36)

        assert flagged(make, "turning_point") >= 0.95
        y = make(np.random.default_rng(1))
        assert mann_kendall(y)["p"] > 0.05, "the test this exists to correct must see nothing"
        found = find_shift(y)
        assert abs(found["position"] - 18) <= 3
        assert found["slopeBefore"] > 0 > found["slopeAfter"]

    def test_a_fall_then_a_rise(self):
        found = find_shift(-np.minimum(T, 36 - T) / 2 + np.random.default_rng(2).standard_normal(36))
        assert found["kind"] == "turning_point" and found["slopeBefore"] < 0 < found["slopeAfter"]

    def test_a_take_off_after_a_flat_start(self):
        def make(rng):
            return np.maximum(T - 18, 0) * 2 + rng.standard_normal(36)

        assert flagged(make, "turning_point") >= 0.9
        found = find_shift(make(np.random.default_rng(1)))
        assert abs(found["slopeBefore"]) < 0.25 * found["slopeAfter"]

    def test_a_smooth_rise_and_fall_counts_because_it_really_did_both(self):
        def make(rng):
            return 10 * np.sin(np.pi * T / 35) + rng.standard_normal(36)

        assert flagged(make, "turning_point") >= 0.9

    def test_a_small_dip_before_a_long_rise_is_not_a_reversal(self):
        # The curve really is smooth, so only the reversal test could name it,
        # and "fell, then rose" would be a poor account of a series that rose.
        def make(rng):
            return 0.1 * (T - 10) ** 2 + 3 * rng.standard_normal(36)

        assert flagged(make) <= 0.05


class TestNotAMoment:
    @pytest.mark.parametrize("name, ceiling, make", [
        ("flat noise", 0.05, lambda r: r.standard_normal(36)),
        ("a steady rise", 0.05, lambda r: 0.2 * T + r.standard_normal(36)),
        ("one spike", 0.05, lambda r: r.standard_normal(36) + 8 * (T == 18)),
        ("two spikes together", 0.05, lambda r: r.standard_normal(36) + 8 * ((T == 18) | (T == 19))),
        ("skewed noise", 0.05, lambda r: r.lognormal(0, 1, 36)),
        ("heavy tails", 0.05, lambda r: r.standard_t(3, 36)),
        ("small counts", 0.05, lambda r: r.poisson(5, 36).astype("float64")),
        ("quiet compound growth", 0.02, lambda r: 100 * 20 ** (LONG / 59) * (1 + 0.02 * r.standard_normal(60))),
        ("noisy compound growth", 0.05, lambda r: np.exp(3 * LONG / 59) + 0.3 * r.standard_normal(60)),
        ("gentle compound growth", 0.05, lambda r: 100 * 3 ** (LONG / 59) * (1 + 0.05 * r.standard_normal(60))),
        ("a slow S-curve", 0.05, lambda r: 100 / (1 + np.exp(-(LONG / 59 - 0.5) * 6)) + r.standard_normal(60)),
        ("two slow waves", 0.05, lambda r: 3 * np.sin(4 * np.pi * LONG / 59) + r.standard_normal(60)),
        ("a yearly wave", 0.05, lambda r: 3 * np.sin(2 * np.pi * LONG / 12) + r.standard_normal(60)),
    ])
    def test_no_moment_is_named(self, name, ceiling, make):
        assert flagged(make) <= ceiling, name

    def test_memory_is_not_mistaken_for_regimes(self):
        # Without the margin on the memory reading these sit near 12%.
        assert flagged(lambda r: with_memory(r, 24, 0.7), runs=300) <= 0.08
        assert flagged(lambda r: with_memory(r, 24, 0.9), runs=300) <= 0.08
        assert flagged(lambda r: with_memory(r, 36, 0.5), runs=300) <= 0.05

    def test_a_random_walk_gets_no_step(self):
        # A wander that went up and came down did rise and then fall, so a
        # turning point is a fair description. A step would be invented.
        assert flagged(lambda r: np.cumsum(r.standard_normal(24)), "step") <= 0.03
        assert flagged(lambda r: np.cumsum(r.standard_normal(24))) <= 0.1

    def test_a_long_wander_names_no_moment(self):
        # What a shape leaves of a wander still predicts itself. Without that
        # refusal, one in nine of these would get a moment.
        assert flagged(lambda r: np.cumsum(r.standard_normal(120)), runs=100) <= 0.03

    def test_a_jump_in_the_last_two_periods_is_too_late_to_call_a_step(self):
        assert flagged(lambda r: r.standard_normal(36) + 6 * (T >= 34), "step") <= 0.05

    def test_an_exactly_straight_line(self):
        assert find_shift(5 + 2 * T) is None

    @pytest.mark.parametrize("periods, start, slope", [(53, 1e6, 12345.678), (101, 3.3, 1 / 3), (102, 3.3, 1 / 3)])
    def test_rounding_on_an_exact_line_is_not_a_moment(self, periods, start, slope):
        # What rounding leaves of these lines happens to look like a shape.
        assert find_shift(start + slope * np.arange(float(periods))) is None

    def test_an_exact_parabola_has_no_sharp_moment(self):
        assert find_shift(T ** 2) is None


class TestInputs:
    def test_too_few_periods(self):
        assert find_shift(exact_step(11)) is None
        assert find_shift(exact_step(12)) is not None

    def test_too_many_periods_for_the_memory_of_the_server(self):
        assert find_shift(exact_step(120)) is not None
        assert find_shift(exact_step(121)) is None

    def test_a_constant_series(self):
        assert find_shift(np.full(36, 7.0)) is None

    @pytest.mark.parametrize("bad", [np.nan, np.inf])
    def test_a_series_with_a_hole(self, bad):
        y = exact_step(36)
        y[3] = bad
        assert find_shift(y) is None

    def test_the_same_series_always_gets_the_same_answer(self):
        y = 6 * (T >= 20) + np.random.default_rng(1).standard_normal(36)
        assert find_shift(y) == find_shift(y)

    def test_units_do_not_change_the_answer(self):
        y = 6 * (T >= 20) + np.random.default_rng(1).standard_normal(36)
        plain, scaled = find_shift(y), find_shift(1000 * y + 5)
        assert (plain["kind"], plain["position"], plain["p"]) == (scaled["kind"], scaled["position"], scaled["p"])


class TestReadings:
    def test_what_a_good_fit_leaves_reads_as_having_no_pattern(self):
        line, _, _, steps, _ = _candidates(36)
        readings = []
        for seed in range(300):
            residual = line @ (6 * (T >= 18) + np.random.default_rng(seed).standard_normal(36))
            best = steps[int(np.argmax((steps @ residual) ** 2))]
            readings.append(_pattern(residual - (best @ residual) * best))
        assert abs(float(np.mean(readings))) < 0.04

    def test_simulated_series_hold_the_curve_as_fitted_and_leave_what_the_real_one_leaves(self):
        line, curve, _, _, _ = _candidates(36)
        residual = line @ (0.05 * T ** 2 + np.random.default_rng(1).standard_normal(36))
        fitted = (curve @ residual) * curve

        simulated = _simulate(residual, line, curve, 0.5, np.random.default_rng(2))

        assert curve @ simulated == pytest.approx(np.full(299, curve @ residual))
        assert np.linalg.norm(simulated - fitted[:, None], axis=0) == pytest.approx(
            np.full(299, np.linalg.norm(residual - fitted)))

    def test_changes_read_memory_where_a_fit_would_hide_it(self):
        readings = [_wander(with_memory(np.random.default_rng(seed), 60, 0.7), 30) for seed in range(300)]
        assert float(np.mean(readings)) == pytest.approx(0.7, abs=0.1)

    def test_how_sure_of_the_date_depends_on_the_data(self):
        def spread(size):
            found = [find_shift(size * (LONG >= 30) + np.random.default_rng(s).standard_normal(60), seed=s)
                     for s in range(RUNS)]
            return [f["latest"] - f["earliest"] for f in found if f]

        assert float(np.mean(spread(3.5))) > 0.3, "a modest step cannot always be pinned to one period"
        assert max(spread(12)) == 0, "a large one can"

    def test_memory_makes_the_date_less_certain(self):
        y = 3 * (LONG >= 30) + np.random.default_rng(1).standard_normal(60)
        line, _, positions, steps, _ = _candidates(60)
        residual = line @ ((y - y.mean()) / y.std())
        k = int(positions[int(np.argmax((steps @ residual) ** 2))])

        def width(memory):
            found = _describe(y, "step", k, steps, positions, residual, memory, 0.01)
            return found["latest"] - found["earliest"]

        assert width(0.8) > width(0.0)


class TestLabels:
    PERIODS = [f"P{i}" for i in range(36)]

    def test_positions_become_the_series_own_periods(self):
        shift = labelled_shift(10 + 10 * (T >= 18), self.PERIODS)
        assert shift == {"kind": "step", "period": "P18", "earliestPeriod": "P18", "latestPeriod": "P18",
                         "before": 10.0, "after": 20.0, "changePct": 100.0}

    def test_a_turn_gives_slopes_and_no_levels(self):
        shift = labelled_shift(np.minimum(T, 36 - T), self.PERIODS)
        assert shift["kind"] == "turning_point" and shift["period"] == "P18"
        assert shift["slopeBeforePerPeriod"] == pytest.approx(1) and shift["slopeAfterPerPeriod"] == pytest.approx(-1)
        assert "before" not in shift and "changePct" not in shift

    def test_the_test_statistics_stay_behind(self):
        shift = labelled_shift(exact_step(36), self.PERIODS)
        assert "p" not in shift and "memory" not in shift

    def test_nothing_to_label(self):
        assert labelled_shift(T, self.PERIODS) is None

    def test_a_launch_from_nothing_has_no_percentage(self):
        assert "changePct" not in labelled_shift(np.where(T < 18, 0.0, 50.0), self.PERIODS)

    def test_a_rise_of_many_times_a_small_base_has_no_percentage(self):
        assert "changePct" not in labelled_shift(np.where(T < 18, 1.0, 50.0), self.PERIODS)
        assert labelled_shift(np.where(T < 18, 5.0, 50.0), self.PERIODS)["changePct"] == pytest.approx(900)

    def test_a_percentage_of_a_loss_would_mean_the_opposite(self):
        assert "changePct" not in labelled_shift(np.where(T < 18, -100.0, -50.0), self.PERIODS)


def monthly(values):
    return pd.DataFrame({"month": pd.date_range("2022-01-01", periods=len(values), freq="MS").astype(str),
                         "sales": values})


class TestInATrend:
    def test_a_jump_in_monthly_sales_names_the_month(self):
        out = trend(monthly(100 + 40 * (T >= 20) + np.random.default_rng(1).normal(0, 3, 36)), "month")
        assert out["direction"] == "rising" and out["significant"] is True
        assert out["changePoint"]["kind"] == "step" and out["changePoint"]["period"] == "2023-09"

    def test_a_steady_rise_has_no_change_point(self):
        out = trend(monthly(100 + 2 * T + np.random.default_rng(2).normal(0, 3, 36)), "month")
        assert out["significant"] is True and "changePoint" not in out

    def test_a_step_under_a_seasonal_swing_is_found_once_the_swing_is_removed(self):
        swing = 40 * np.sin(2 * np.pi * T / 12)
        y = 100 + swing + 30 * (T >= 20) + np.random.default_rng(3).normal(0, 3, 36)
        assert find_shift(y) is None, "the swing has to hide it, or this proves nothing"
        out = trend(monthly(y), "month")
        assert out["deseasonalized"] is True
        assert out["changePoint"]["kind"] == "step"
        assert out["changePoint"]["earliestPeriod"] <= "2023-09" <= out["changePoint"]["latestPeriod"]

    def test_a_turn_counts_as_evidence_when_the_trend_test_sees_nothing(self):
        stats = StatsSummary(rowCount=600, columnCount=2, columnTypes={}, missingPercentages={}, numericStats={},
                             topCorrelations=[], categoricalSummaries={}, outlierSummary={}, detectedIssues=[])
        stats.domainAnalyses = {"analyses": {"trend": {"significant": False}}}
        assert count_evidence(stats) == 0
        stats.domainAnalyses = {"analyses": {"trend": {"significant": False, "changePoint": {"kind": "turning_point"}}}}
        assert count_evidence(stats) == 1

    def test_the_writer_and_chat_receive_it(self):
        df = monthly(100 + 40 * (T >= 20) + np.random.default_rng(1).normal(0, 3, 36))
        stats = build_stats_summary(df, SimpleNamespace(warnings=[], errors=[]))
        change = build_digest(stats, DOMAIN)["findings"]["trend"]["changePoint"]
        assert change["kind"] == "step" and change["period"] == "2023-09"


class TestInAChatQuestion:
    @staticmethod
    def daily(by_month):
        rows = pd.DataFrame({"day": pd.date_range("2022-01-01", periods=len(by_month) * 28, freq="D")})
        rows["sales"] = np.repeat(by_month, 28)
        return rows

    def test_a_question_about_any_measure_gets_the_change(self):
        out = run_query(monthly(100 + 40 * (T >= 20) + np.random.default_rng(1).normal(0, 3, 36)),
                        {"op": "trend", "measure": "sales", "date": "month", "period": "M", "agg": "mean"})
        assert out["change"]["kind"] == "step" and out["change"]["period"] == "2023-09"

    def test_an_answer_with_no_change_has_no_entry(self):
        out = run_query(monthly(100 + 2 * T + np.random.default_rng(2).normal(0, 3, 36)),
                        {"op": "trend", "measure": "sales", "date": "month", "period": "M", "agg": "mean"})
        assert "change" not in out and "error" not in out

    def test_a_month_with_nothing_recorded_does_not_lose_it(self):
        df = monthly(100 + 40 * (T >= 20) + np.random.default_rng(1).normal(0, 3, 36))
        df.loc[5, "sales"] = np.nan
        out = run_query(df, {"op": "trend", "measure": "sales", "date": "month", "period": "M", "agg": "mean"})
        assert out["change"]["kind"] == "step"

    def test_years_of_daily_figures_are_answered_without_it(self):
        df = pd.DataFrame({"day": pd.date_range("2020-01-01", periods=900, freq="D"), "sales": np.arange(900.0)})
        out = run_query(df, {"op": "trend", "measure": "sales", "date": "day", "period": "D", "agg": "sum"})
        assert out["periods"] == 900 and "change" not in out and "error" not in out
