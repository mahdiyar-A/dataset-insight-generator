-- ============================================================
-- DIG — Migration 003: Fix infinite recursion in the team policies
-- Run this in Supabase → SQL Editor (after 002)
-- ============================================================
--
-- Symptom: every read of `teams` or `team_members` through the client key
-- fails outright with
--
--     ERROR 42P17: infinite recursion detected in policy for relation "team_members"
--
-- Cause: the policy on `team_members` selects from `team_members`.
--
--     CREATE POLICY "team members visible" ON team_members
--       FOR SELECT USING (
--         team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
--       );
--
-- Evaluating the policy runs the subquery, which is itself subject to the same
-- policy, which runs the subquery again. Postgres detects the cycle and aborts.
-- `teams` is collateral damage: its policy reads `team_members`, so it inherits
-- the same failure.
--
-- The backend talks to Postgres with the service-role key, which bypasses RLS
-- entirely, so this never surfaced server-side — it only breaks reads made
-- directly from the browser, and it breaks them completely rather than subtly.
--
-- Fix: move the membership lookup into a SECURITY DEFINER function. The
-- function body runs as its owner, so its read of `team_members` is not
-- re-checked against the policy, and the cycle is broken. It still answers only
-- for the calling user, because auth.uid() is evaluated inside it.

-- ── 1. Membership lookup that does not re-enter RLS ───────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_team_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
-- A SECURITY DEFINER function without a pinned search_path can be hijacked by a
-- caller-controlled schema shadowing the objects it names.
SET search_path = public, pg_temp
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.current_user_team_ids() IS
  'Team ids for the calling user. SECURITY DEFINER so RLS policies on teams and '
  'team_members can use it without recursing into themselves.';

-- Safe to expose: it takes no arguments and is scoped to auth.uid().
GRANT EXECUTE ON FUNCTION public.current_user_team_ids() TO authenticated, anon;

-- ── 2. Rewrite the two recursive policies ────────────────────────────────────

DROP POLICY IF EXISTS "team member access" ON teams;
CREATE POLICY "team member access" ON teams
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (SELECT public.current_user_team_ids())
  );

DROP POLICY IF EXISTS "team members visible" ON team_members;
CREATE POLICY "team members visible" ON team_members
  FOR SELECT USING (
    -- Your own membership row is always visible, which also means a user with
    -- no team at all gets an empty result rather than an error.
    user_id = auth.uid()
    OR team_id IN (SELECT public.current_user_team_ids())
  );

-- ── 3. Close the write side of the analyses policy ───────────────────────────
-- `FOR ALL USING (...)` governs which rows are visible to read, update and
-- delete, but USING is not consulted on INSERT — that needs WITH CHECK. Without
-- it a client key could insert a row owned by someone else. The backend uses
-- the service key so this was never the live path, but the policy was written
-- as defence in depth and did not actually defend that direction.

DROP POLICY IF EXISTS "own analyses" ON analyses;
CREATE POLICY "own analyses" ON analyses
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
