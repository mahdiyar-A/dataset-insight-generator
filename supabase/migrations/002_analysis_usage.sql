-- ============================================================
-- DIG — Migration 002: Per-analysis LLM usage
-- Run this in Supabase → SQL Editor (after 001)
-- ============================================================

-- ── 1. Record what each analysis cost ─────────────────────────────────────────
-- The AI service has computed token counts and USD cost per run since August
-- 2026 and returned them in the /analyze response; the backend had no columns
-- to put them in, so the number was dropped at deserialization. All nullable:
-- rows written before this migration simply have no recorded cost, and the
-- analytics endpoint excludes them from averages rather than counting them
-- as free.

ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS cost_usd    NUMERIC(12, 6),   -- total for the run; 0 is a real value
  ADD COLUMN IF NOT EXISTS tokens_in   BIGINT,
  ADD COLUMN IF NOT EXISTS tokens_out  BIGINT,
  ADD COLUMN IF NOT EXISTS usage_json  JSONB;            -- per-phase costs and call log

-- ── 2. Index for the owner analytics scan ─────────────────────────────────────
-- idx_analyses_user_created leads with user_id, so it cannot serve the
-- analytics query, which spans every user and filters on created_at alone.

CREATE INDEX IF NOT EXISTS idx_analyses_created
  ON analyses(created_at DESC);
