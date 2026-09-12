-- LLM usage per analysis. The AI service has computed cost per run since
-- August 2026 and returned it in the /analyze response; these columns are
-- where the backend finally persists it. All nullable: rows written before
-- this migration simply have no recorded cost.

alter table analyses add column if not exists cost_usd   numeric;
alter table analyses add column if not exists tokens_in  bigint;
alter table analyses add column if not exists tokens_out bigint;
-- Full telemetry payload (per-phase costs, call log) for drill-down.
alter table analyses add column if not exists usage_json text;

-- The owner analytics endpoint scans by creation time across all users.
create index if not exists analyses_created_at_idx on analyses (created_at desc);
