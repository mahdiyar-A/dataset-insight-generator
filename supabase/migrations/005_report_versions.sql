-- ============================================================
-- DIG — Migration 005: Report versions (the editable report)
-- Run this in Supabase → SQL Editor (after 004)
-- ============================================================
--
-- An analysis's report used to exist only inside its PDF, Word and PowerPoint
-- files. From now on the report is also kept as a document that can be edited
-- in DIG, and every save is a new version of it:
--
--   version 1   what DIG wrote, saved when the analysis finishes; kept for good
--   version 2+  each save by a person, or a return to an older version
--
-- The files are always rebuilt from the newest version. Going back never
-- deletes anything: the older version is saved again as the newest.
--
-- Additive only. No existing table or column changes, so the analysis flow
-- runs exactly as before whether or not this has been applied. Deleting an
-- analysis, or an account, deletes its versions (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS report_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id    UUID        NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  version        INT         NOT NULL CHECK (version >= 1),

  -- The whole report as the files are built from it. See
  -- ai_service/ai_engine/report_document.py for its shape.
  document       JSONB       NOT NULL,

  -- Who saved it. NULL for version 1, which DIG wrote. SET NULL rather than
  -- CASCADE so that once teams edit together (Part 4), a member leaving DIG
  -- does not delete the owner's history.
  edited_by      UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- 'written' (version 1) | 'edited' | 'restored'
  kind           TEXT        NOT NULL DEFAULT 'edited'
                             CHECK (kind IN ('written', 'edited', 'restored')),
  -- For a 'restored' version, the version it went back to.
  restored_from  INT,

  -- Whether the stored PDF/Word/PowerPoint were built from this version.
  -- False only between a save and its files being uploaded; a download that
  -- finds the newest version unbuilt builds it then.
  files_built    BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Two saves made from the same starting version both ask for the same next
  -- number; this is what turns the second into "changed since you opened it"
  -- instead of a silent overwrite.
  UNIQUE (analysis_id, version)
);

-- The UNIQUE constraint's index serves "newest version of this analysis"
-- (analysis_id = ? ORDER BY version DESC LIMIT 1); no second index is needed.

-- ── Row level security ───────────────────────────────────────────────────────
-- The backend uses the service key, which bypasses RLS. As with analyses, the
-- policy is defence in depth: a client key may read the versions of its own
-- analyses and write none.

ALTER TABLE report_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own report versions" ON report_versions;
CREATE POLICY "own report versions" ON report_versions
  FOR SELECT
  USING (analysis_id IN (SELECT id FROM analyses WHERE user_id = auth.uid()));
