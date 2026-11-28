-- Three small tables, all read and written only with the server's secret key.
--
--   usage_daily       how many times a day something happened: questions asked,
--                     report edits, chat suggestions, runs refused. Counts only.
--   finding_feedback  per kind of data and kind of finding, how many insights
--                     reports were written with and how many people deleted or
--                     rewrote. Counts only: no account, no file, no words.
--                     The AI service uses it to rank findings (llm/feedback.py).
--   admin_actions     who on the admin page changed whose plan or deleted whom,
--                     and when. Email addresses are stored masked (n***@site.com).
--
-- The server works without them (the admin page says the migration is missing),
-- so this can be run before or after the deploy.

-- ── Daily usage counts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_daily (
  day    DATE NOT NULL,
  kind   TEXT NOT NULL,
  count  INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION bump_usage(p_day DATE, p_kind TEXT, p_by INT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO usage_daily AS u (day, kind, count) VALUES (p_day, p_kind, GREATEST(p_by, 0))
  ON CONFLICT (day, kind) DO UPDATE SET count = u.count + GREATEST(p_by, 0);
END;
$$;

REVOKE ALL ON FUNCTION bump_usage(DATE, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION bump_usage(DATE, TEXT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION bump_usage(DATE, TEXT, INT) TO service_role;

-- ── What people keep in their reports ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finding_feedback (
  domain     TEXT NOT NULL,
  kind       TEXT NOT NULL,
  shown      INT  NOT NULL DEFAULT 0,
  removed    INT  NOT NULL DEFAULT 0,
  rewritten  INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (domain, kind)
);
ALTER TABLE finding_feedback ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION bump_finding_feedback(
  p_domain TEXT, p_kind TEXT, p_shown INT, p_removed INT, p_rewritten INT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO finding_feedback AS f (domain, kind, shown, removed, rewritten)
  VALUES (p_domain, p_kind, GREATEST(p_shown, 0), GREATEST(p_removed, 0), GREATEST(p_rewritten, 0))
  ON CONFLICT (domain, kind) DO UPDATE
    SET shown     = f.shown     + GREATEST(p_shown, 0),
        removed   = f.removed   + GREATEST(p_removed, 0),
        rewritten = f.rewritten + GREATEST(p_rewritten, 0);
END;
$$;

REVOKE ALL ON FUNCTION bump_finding_feedback(TEXT, TEXT, INT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION bump_finding_feedback(TEXT, TEXT, INT, INT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION bump_finding_feedback(TEXT, TEXT, INT, INT, INT) TO service_role;

-- ── A record of admin actions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_actions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin_id      UUID,
  admin_email   TEXT NOT NULL DEFAULT '',   -- masked
  action        TEXT NOT NULL,              -- set_plan | delete_user | refused
  target_id     UUID,
  target_email  TEXT NOT NULL DEFAULT '',   -- masked
  detail        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS admin_actions_at ON admin_actions (at DESC);
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
