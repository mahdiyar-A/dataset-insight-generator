"""
Tests for column profiling and the skew-adjusted fences.

Two classes of damage are being pinned down here:

  * imputing a statistic into an identifier, which invents a key that refers to
    nothing and is undetectable downstream, and
  * winsorising the upper tail of a skewed column, which deletes the largest
    observations — usually the ones the analysis exists to find.

The convergence invariant, check(clean(df)).needsCleaning == False, has to keep
holding through both fixes, so it is asserted again here on frames that contain
identifiers and heavy tails.
"""

import numpy as np
import pandas as pd
import pytest

from ai_engine.core.cleaner import clean_dataset
from ai_engine.core.profiler import (
    adjusted_fences,
    identifier_columns,
    is_identifier,
    medcouple,
)
from ai_engine.quality.quality_checker import check_data_quality


def quality(df):
    return check_data_quality(df)


# ── Identifier detection ─────────────────────────────────────────────────────

class TestIdentifierDetection:
    def test_named_id_column_is_an_identifier(self):
        s = pd.Series(range(1000, 1200))
        assert is_identifier(s, "customer_id")

    def test_uuid_style_strings_are_identifiers(self):
        s = pd.Series([f"CUS{i:06d}" for i in range(200)])
        assert is_identifier(s, "customer")

    def test_sequential_row_number_is_an_identifier(self):
        # No name hint, but a dense strictly-increasing integer run is a key.
        s = pd.Series(range(500))
        assert is_identifier(s, "n")

    def test_unique_float_measurement_is_not_an_identifier(self):
        # Risk: the whole guard collapses if near-uniqueness alone qualifies.
        # Continuous measurements are routinely 100% unique — treating revenue
        # as an identifier would exempt it from cleaning entirely.
        rng = np.random.default_rng(7)
        s = pd.Series(rng.normal(500, 120, 400))
        assert s.nunique() == len(s)
        assert not is_identifier(s, "revenue")

    def test_low_cardinality_column_is_not_an_identifier(self):
        s = pd.Series(["north", "south", "east", "west"] * 50)
        assert not is_identifier(s, "region_code")

    def test_short_column_is_not_an_identifier(self):
        assert not is_identifier(pd.Series([1, 2, 3]), "id")

    def test_identifier_columns_finds_them_in_a_frame(self):
        df = pd.DataFrame({
            "order_id": [f"A{i:05d}" for i in range(100)],
            "revenue": np.linspace(10.5, 900.25, 100),
            "region": ["n", "s"] * 50,
        })
        assert identifier_columns(df) == ["order_id"]


# ── Medcouple ────────────────────────────────────────────────────────────────

class TestMedcouple:
    def test_symmetric_distribution_has_zero_skew(self):
        rng = np.random.default_rng(3)
        mc = medcouple(rng.normal(0, 1, 800))
        assert abs(mc) < 0.12

    def test_right_skewed_distribution_is_positive(self):
        rng = np.random.default_rng(3)
        mc = medcouple(rng.lognormal(0, 1, 800))
        assert mc > 0.15

    def test_left_skewed_distribution_is_negative(self):
        rng = np.random.default_rng(3)
        mc = medcouple(-rng.lognormal(0, 1, 800))
        assert mc < -0.15

    def test_is_deterministic_above_the_subsampling_threshold(self):
        # Risk: a random subsample would make the fence move between the
        # cleaner's call and the checker's, re-flagging values just cleaned.
        rng = np.random.default_rng(11)
        big = rng.lognormal(0, 1, 20000)
        assert medcouple(big) == medcouple(big)

    def test_constant_input_does_not_blow_up(self):
        assert medcouple(np.full(50, 4.0)) == pytest.approx(0.0, abs=1e-9)


# ── Adjusted fences ──────────────────────────────────────────────────────────

class TestAdjustedFences:
    def test_symmetric_column_stays_close_to_the_plain_iqr_rule(self):
        # At zero skew the correction factors are exp(0) = 1, so symmetric data
        # must be treated essentially as before. Sampling noise leaves a small
        # residual medcouple, so the fences are compared on the scale that
        # matters — the IQR — rather than as a ratio of the fence value, which
        # is near zero for a centred distribution and makes any tolerance
        # meaningless.
        rng = np.random.default_rng(5)
        s = pd.Series(rng.normal(100, 15, 600))
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        lower, upper = adjusted_fences(s)
        assert abs(lower - (q1 - 3 * iqr)) < iqr
        assert abs(upper - (q3 + 3 * iqr)) < iqr

    def test_flags_nothing_extra_on_symmetric_data(self):
        # The behavioural version of the above: same verdict as the old rule.
        rng = np.random.default_rng(9)
        s = pd.Series(rng.normal(0, 1, 1000))
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        lower, upper = adjusted_fences(s)
        adjusted_hits = ((s < lower) | (s > upper)).sum()
        plain_hits = ((s < q1 - 3 * iqr) | (s > q3 + 3 * iqr)).sum()
        assert abs(int(adjusted_hits) - int(plain_hits)) <= 2

    def test_right_skew_widens_the_upper_fence(self):
        rng = np.random.default_rng(5)
        s = pd.Series(rng.lognormal(0, 1.1, 800))
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        plain_upper = q3 + 3 * (q3 - q1)
        _, upper = adjusted_fences(s)
        assert upper > plain_upper

    def test_zero_spread_returns_infinite_fences(self):
        lower, upper = adjusted_fences(pd.Series([2.0] * 40))
        assert lower == -np.inf and upper == np.inf


# ── Cleaning behaviour ───────────────────────────────────────────────────────

class TestCleaningRespectsIdentifiers:
    def test_missing_identifier_is_never_imputed(self):
        # The bug this prevents: a median customer_id is a customer who does
        # not exist, inserted silently into the middle of the user's data.
        ids = [f"CUS{i:05d}" for i in range(100)]
        ids[7] = None
        df = pd.DataFrame({
            "customer_id": ids,
            "revenue": np.linspace(10, 500, 100),
            "region": ["n", "s"] * 50,
        })

        out = clean_dataset(df, quality(df))

        assert out["customer_id"].isnull().sum() == 0
        # The row went; no value was invented to keep it.
        assert len(out) == 99
        assert set(out["customer_id"]) <= set(i for i in ids if i)

    def test_numeric_identifier_keeps_its_own_values(self):
        ids = list(range(1000, 1100))
        df = pd.DataFrame({
            "account_no": [float(i) for i in ids],
            "amount": np.linspace(5, 900, 100),
        })
        df.loc[3, "account_no"] = np.nan

        out = clean_dataset(df, quality(df))

        median = pd.Series(ids, dtype="float64").median()
        assert median not in set(out["account_no"])
        assert out["account_no"].isnull().sum() == 0

    def test_mostly_missing_identifier_drops_the_column_not_the_rows(self):
        # Dropping a row per missing key is right at 2% and catastrophic at 60%.
        ids = [f"K{i:05d}" if i % 5 == 0 else None for i in range(100)]
        df = pd.DataFrame({
            "record_key": ids,
            "value": np.linspace(1, 200, 100),
            "grp": ["a", "b"] * 50,
        })

        out = clean_dataset(df, quality(df))

        assert "record_key" not in out.columns
        assert len(out) == 100

    def test_identifier_is_not_capped_as_an_outlier(self):
        # A high account number is not an anomaly; clipping one silently
        # rewrites which account a row belongs to.
        ids = list(range(1, 100)) + [9_999_999]
        df = pd.DataFrame({
            "account_id": ids,
            "score": np.linspace(1, 50, 100),
        })

        out = clean_dataset(df, quality(df))

        assert 9_999_999 in set(out["account_id"])


class TestCleaningRespectsSkew:
    def test_lognormal_tail_largely_survives_cleaning(self):
        # Risk: the plain 3x IQR fence treats a log-normal upper tail as errors.
        # On revenue data those rows are the largest sales in the dataset.
        #
        # This is not a claim that nothing is trimmed — the adjusted boxplot is
        # still an outlier rule and still clips the extreme fringe. The claim is
        # that it clips an order of magnitude less, and that ordinary large
        # values survive.
        rng = np.random.default_rng(19)
        revenue = rng.lognormal(mean=6, sigma=1.2, size=1500)
        df = pd.DataFrame({"revenue": revenue, "region": ["n", "s"] * 750})

        q1, q3 = np.quantile(revenue, 0.25), np.quantile(revenue, 0.75)
        plain_upper = q3 + 3 * (q3 - q1)
        plain_would_cap = int((revenue > plain_upper).sum())

        out = clean_dataset(df, quality(df))
        adjusted_capped = int((revenue > out["revenue"].max()).sum())

        assert plain_would_cap > 40, "fixture should be heavy-tailed enough to matter"
        assert adjusted_capped * 5 < plain_would_cap
        # The 99th percentile is an ordinary large sale, not an error.
        assert out["revenue"].max() > np.quantile(revenue, 0.99)

    def test_symmetric_outliers_are_still_capped(self):
        # The fix must not become a licence to leave real errors in place.
        rng = np.random.default_rng(21)
        values = np.concatenate([rng.normal(50, 5, 500), [5000.0, -4000.0]])
        df = pd.DataFrame({"reading": values, "grp": ["a", "b"] * 251})

        out = clean_dataset(df, quality(df))

        assert out["reading"].max() < 500
        assert out["reading"].min() > -500


class TestConvergenceStillHolds:
    def test_frame_with_identifier_and_skew_converges(self):
        rng = np.random.default_rng(23)
        ids = [f"ORD{i:06d}" for i in range(600)]
        ids[5] = None
        df = pd.DataFrame({
            "order_id": ids,
            "revenue": rng.lognormal(5, 1.3, 600),
            "qty": rng.integers(1, 9, 600).astype("float64"),
            "region": ["n", "s", "e"] * 200,
        })
        df.loc[11, "qty"] = np.nan

        cleaned = clean_dataset(df, quality(df))

        assert quality(cleaned).needsCleaning is False

    @pytest.mark.parametrize("seed", range(8))
    def test_fuzz_identifier_frames_converge(self, seed):
        rng = np.random.default_rng(seed)
        n = int(rng.integers(60, 400))
        df = pd.DataFrame({
            "record_id": [f"R{i:07d}" for i in range(n)],
            "amount": rng.lognormal(4, float(rng.uniform(0.4, 1.5)), n),
            "count": rng.integers(0, 40, n).astype("float64"),
            "label": rng.choice(["a", "b", "c"], n),
        })
        # Sprinkle missing values everywhere except the key.
        for col in ("amount", "count", "label"):
            idx = rng.choice(n, size=max(1, n // 25), replace=False)
            df.loc[idx, col] = np.nan

        cleaned = clean_dataset(df, quality(df))

        assert quality(cleaned).needsCleaning is False
