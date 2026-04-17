-- Tighten catune_submissions tau CHECK constraints to match cadecon (LOGIC-M1).
--
-- Before:
--   tau_rise  > 0  AND tau_rise  < 1
--   tau_decay > 0  AND tau_decay < 10
-- After (matching 006_cadecon_submissions.sql:62-63):
--   tau_rise  >= 0.001 AND tau_rise  <= 0.5
--   tau_decay >= 0.01  AND tau_decay <= 10
--
-- Same parameter semantically — calcium indicator decay kinetics — so the
-- two tables shouldn't disagree on what's plausible. cadecon's range is
-- the more realistic one (no GCaMP variant has tau_rise > 0.5 s).
--
-- Safety: any existing row in catune_submissions violating the new bounds
-- will block the ALTER TABLE and the whole migration rolls back (Supabase
-- runs each migration in a transaction; the explicit BEGIN/COMMIT here
-- documents that intent and keeps the behaviour consistent if the file
-- is ever applied manually via psql). Audit production data first if
-- the migration fails; clean up outliers before retrying.

BEGIN;

ALTER TABLE catune_submissions
  DROP CONSTRAINT valid_tau_rise;

ALTER TABLE catune_submissions
  ADD CONSTRAINT valid_tau_rise CHECK (tau_rise >= 0.001 AND tau_rise <= 0.5);

ALTER TABLE catune_submissions
  DROP CONSTRAINT valid_tau_decay;

ALTER TABLE catune_submissions
  ADD CONSTRAINT valid_tau_decay CHECK (tau_decay >= 0.01 AND tau_decay <= 10);

COMMIT;
