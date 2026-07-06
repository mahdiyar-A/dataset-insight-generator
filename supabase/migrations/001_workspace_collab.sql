-- ============================================================
-- DIG — Migration 001: Workspace & Collaboration Schema
-- Run this in Supabase → SQL Editor
-- ============================================================

-- ── 1. Extend the users table ──────────────────────────────────────────────────
-- Add plan management, Stripe billing, usage tracking, and session handling

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan              TEXT        NOT NULL DEFAULT 'free',       -- 'free' | 'pro' | 'admin'
  ADD COLUMN IF NOT EXISTS plan_expires_at   TIMESTAMPTZ,                               -- null = free or lifetime
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,                               -- Stripe customer ID
  ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT,                               -- Stripe subscription ID
  ADD COLUMN IF NOT EXISTS reports_used      INT         NOT NULL DEFAULT 0,            -- reports used in the current 48h window
  ADD COLUMN IF NOT EXISTS reports_reset_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),        -- when the 48h window started
  ADD COLUMN IF NOT EXISTS last_active_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),        -- for session timeout tracking
  ADD COLUMN IF NOT EXISTS session_timeout_minutes INT  NOT NULL DEFAULT 60;            -- configurable per user (default 1h)

-- Free tier = 2 reports per 48h, 5 history items
-- Pro tier  = unlimited reports,  15 history items
-- Admin     = unlimited everything, no payment

-- ── 2. analyses table ─────────────────────────────────────────────────────────
-- Replaces the single `datasets` row per user.
-- Each completed analysis run is stored here. Capped at 5 (free) or 15 (pro).
-- The frontend history tab reads from this table.

CREATE TABLE IF NOT EXISTS analyses (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- File metadata
  file_name          TEXT        NOT NULL,
  file_size_bytes    BIGINT      NOT NULL DEFAULT 0,
  row_count          INT,
  column_count       INT,

  -- Supabase Storage relative paths (null = not generated yet)
  original_csv_path  TEXT,
  cleaned_csv_path   TEXT,
  pdf_report_path    TEXT,
  word_report_path   TEXT,       -- .docx export (pro feature)
  pptx_report_path   TEXT,       -- .pptx export (pro feature)

  -- Chart images serialised as JSON array
  -- [{ type, label, url, desc, color }, ...]
  chart_urls         JSONB,

  -- Analysis lifecycle: pending → processing → done | failed
  status             TEXT        NOT NULL DEFAULT 'pending',

  -- AI customization options chosen by the user before analysis (pro only)
  -- { language, tone, insights_count, occasion, output_format, include_pptx }
  customization      JSONB,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  session_id         UUID        -- links to the chatbot session that triggered this run
);

CREATE INDEX IF NOT EXISTS idx_analyses_user_created
  ON analyses(user_id, created_at DESC);

-- ── 3. teams table ────────────────────────────────────────────────────────────
-- A team is owned by one pro user. Both the owner and all accepted members
-- must have a pro plan. The invite_code is a shareable link alternative to email.

CREATE TABLE IF NOT EXISTS teams (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT  NOT NULL,
  owner_id     UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code  TEXT  UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. team_members table ─────────────────────────────────────────────────────
-- Tracks who is in which team and their role.
-- role: 'owner' | 'editor' | 'viewer'
-- Owners can share analyses and manage permissions.
-- Editors can annotate and export. Viewers can only view.

CREATE TABLE IF NOT EXISTS team_members (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID  NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  user_id    UUID  NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role       TEXT  NOT NULL DEFAULT 'viewer',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- ── 5. team_invites table ─────────────────────────────────────────────────────
-- Email invitations to join a team. Token is emailed; clicking it accepts.

CREATE TABLE IF NOT EXISTS team_invites (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID  NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email       TEXT  NOT NULL,
  token       TEXT  UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  role        TEXT  NOT NULL DEFAULT 'viewer',
  invited_by  UUID  REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ  -- null = pending
);

CREATE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites(token);
CREATE INDEX IF NOT EXISTS idx_team_invites_email ON team_invites(email);

-- ── 6. shared_workspaces table ────────────────────────────────────────────────
-- The owner shares a specific analysis with a team.
-- This creates a workspace that all team members can access (subject to permissions).

CREATE TABLE IF NOT EXISTS shared_workspaces (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID  NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  analysis_id  UUID  NOT NULL REFERENCES analyses(id)  ON DELETE CASCADE,
  shared_by    UUID  NOT NULL REFERENCES users(id),
  shared_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, analysis_id)
);

-- ── 7. workspace_file_permissions table ───────────────────────────────────────
-- Per-file, per-member permission overrides.
-- If no row exists for a (workspace, user, file_type) the default is 'view'.
-- file_type: 'original_csv' | 'cleaned_csv' | 'pdf' | 'word' | 'pptx' | 'charts' | 'all'
-- permission: 'view' | 'edit' | 'none'

CREATE TABLE IF NOT EXISTS workspace_file_permissions (
  id                    UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_workspace_id   UUID  NOT NULL REFERENCES shared_workspaces(id) ON DELETE CASCADE,
  user_id               UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_type             TEXT  NOT NULL,
  permission            TEXT  NOT NULL DEFAULT 'view',
  granted_by            UUID  REFERENCES users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shared_workspace_id, user_id, file_type)
);

-- ── 8. annotations table ─────────────────────────────────────────────────────
-- Comments and annotations on shared reports.
-- Supports threaded replies via parent_id.
-- position stores where in the document the annotation lives:
--   PDF:  { page: 1, x: 0.5, y: 0.3 }   (fractional position on the page)
--   CSV:  { row: 3, col: 1 }
--   General: { section: "insight-2" }

CREATE TABLE IF NOT EXISTS annotations (
  id                    UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_workspace_id   UUID  NOT NULL REFERENCES shared_workspaces(id) ON DELETE CASCADE,
  user_id               UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_type             TEXT  NOT NULL,
  content               TEXT  NOT NULL,
  position              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ,                    -- null = open
  parent_id             UUID  REFERENCES annotations(id) -- null = top-level comment
);

CREATE INDEX IF NOT EXISTS idx_annotations_workspace
  ON annotations(shared_workspace_id, file_type);

-- ── 9. collab_presence table ──────────────────────────────────────────────────
-- Tracks who is currently viewing a shared workspace for real-time presence.
-- Rows are upserted on connect and deleted on disconnect.
-- cursor_data: { x, y, color, file_type } — for cursor presence

CREATE TABLE IF NOT EXISTS collab_presence (
  id                    UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_workspace_id   UUID  NOT NULL REFERENCES shared_workspaces(id) ON DELETE CASCADE,
  user_id               UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cursor_data           JSONB,
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shared_workspace_id, user_id)
);

-- ── 10. Row Level Security ────────────────────────────────────────────────────
-- Enable RLS on new tables so the Supabase anon key cannot read other users' data

ALTER TABLE analyses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invites          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_workspaces     ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_file_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab_presence       ENABLE ROW LEVEL SECURITY;

-- NOTE: The backend uses the service-role key (bypasses RLS),
-- so these policies apply to client-side Supabase calls only.
-- They are a defence-in-depth measure in case the anon key is ever used directly.

-- analyses: users can only see their own
CREATE POLICY "own analyses" ON analyses
  FOR ALL USING (user_id = auth.uid());

-- teams: members can see teams they belong to
CREATE POLICY "team member access" ON teams
  FOR SELECT USING (
    id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    OR owner_id = auth.uid()
  );

-- team_members: visible to other members of the same team
CREATE POLICY "team members visible" ON team_members
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- ── 11. Helper function — enforce history cap ─────────────────────────────────
-- Called after each new analysis is saved. Deletes the oldest entries
-- beyond the user's tier cap (5 for free, 15 for pro/admin).

CREATE OR REPLACE FUNCTION enforce_analysis_history_cap()
RETURNS TRIGGER AS $$
DECLARE
  v_plan     TEXT;
  v_cap      INT;
  v_count    INT;
BEGIN
  -- Look up the user's plan
  SELECT plan INTO v_plan FROM users WHERE id = NEW.user_id;

  v_cap := CASE
    WHEN v_plan IN ('pro', 'admin') THEN 15
    ELSE 5
  END;

  -- Count how many completed analyses this user has
  SELECT COUNT(*) INTO v_count
    FROM analyses
   WHERE user_id = NEW.user_id
     AND status  = 'done';

  -- Delete oldest entries beyond the cap
  IF v_count > v_cap THEN
    DELETE FROM analyses
     WHERE id IN (
       SELECT id FROM analyses
        WHERE user_id = NEW.user_id
          AND status  = 'done'
        ORDER BY completed_at ASC
        LIMIT (v_count - v_cap)
     );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_enforce_history_cap
  AFTER INSERT OR UPDATE ON analyses
  FOR EACH ROW
  WHEN (NEW.status = 'done')
  EXECUTE FUNCTION enforce_analysis_history_cap();

-- ── 12. Helper function — reset 48h report counter ────────────────────────────
-- Resets reports_used when reports_reset_at is more than 48 hours ago.
-- Called from the backend before checking quota.

CREATE OR REPLACE FUNCTION reset_report_quota_if_expired(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE users
     SET reports_used     = 0,
         reports_reset_at = NOW()
   WHERE id            = p_user_id
     AND reports_reset_at < NOW() - INTERVAL '48 hours';
END;
$$ LANGUAGE plpgsql;
