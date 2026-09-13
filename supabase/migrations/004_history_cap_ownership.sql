-- ============================================================
-- DIG — Migration 004: One owner for history pruning, and index cleanup
-- Run this in Supabase → SQL Editor (after 003)
-- ============================================================
--
-- THE STORAGE LEAK
-- ----------------
-- Two mechanisms were enforcing the 5/15 history cap, and the wrong one was
-- winning.
--
--   1. trg_enforce_history_cap — AFTER INSERT OR UPDATE ON analyses
--      WHEN (NEW.status = 'done') — deletes the overflow ROWS.
--   2. AnalysisService.TryPruneHistoryAsync — deletes the overflow FILES from
--      Supabase Storage, then the rows.
--
-- The application marks an analysis finished with
-- UpdateStatusAsync(id, "done", ...), which is an UPDATE, so the trigger fires
-- during that statement — before TryPruneHistoryAsync is ever called. By the
-- time the application asks GetOverflowAsync which analyses are past the cap,
-- the trigger has already deleted those rows, so it gets an empty list and
-- deletes nothing.
--
-- The rows are gone; the PDF, both CSVs and up to five chart PNGs are not.
-- They stay in the bucket with nothing referencing them, permanently. On the
-- free tier's 1 GB that is the ceiling this product would hit first, and it
-- would look like storage filling up for no reason.
--
-- The database cannot fix this itself: a trigger has no way to reach the
-- storage API. Only the application can delete both halves, so the application
-- owns pruning and the trigger goes.
--
-- Trade-off worth stating: the trigger was also a safety net that enforced the
-- cap even if the application failed mid-run. That net was already illusory —
-- it enforced the row cap while silently leaking the files, which is the more
-- expensive half.

DROP TRIGGER IF EXISTS trg_enforce_history_cap ON analyses;
DROP FUNCTION IF EXISTS enforce_analysis_history_cap();

-- A second reason the trigger was unsafe: it was SECURITY INVOKER and read
-- `SELECT plan FROM users`, which RLS now restricts. Called by anything other
-- than the service role it would read no plan at all, fall to the ELSE branch,
-- and cap a Pro user's history at the Free limit of 5.


-- ── Index cleanup ────────────────────────────────────────────────────────────

-- Migration 002 shipped this index as analyses_created_at_idx and was later
-- renamed in the repository to match the idx_ convention used everywhere else.
-- The live database still has the original name, so re-running 002 today would
-- build a second, identical index rather than skip it. Converge on one.
CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);
DROP INDEX IF EXISTS analyses_created_at_idx;

-- datasets carries three indexes on user_id: a unique constraint plus two
-- hand-made duplicates, one of them also unique. Every insert maintained all
-- three. Keep the constraint-backed one.
DROP INDEX IF EXISTS idx_datasets_user_id;
DROP INDEX IF EXISTS idx_datasets_user_id_unique;
