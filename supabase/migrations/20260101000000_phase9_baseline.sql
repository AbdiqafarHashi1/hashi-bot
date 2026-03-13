-- Phase 9 migration baseline for release-candidate snapshots.
--
-- This repository already wires migration verification into the release checks,
-- but persistence tables are not implemented yet in this snapshot.
--
-- We intentionally keep this baseline migration side-effect free so teams can
-- initialize Supabase migration history without introducing placeholder tables.

DO $$
BEGIN
  RAISE NOTICE 'Phase 9 baseline migration applied: no schema changes in this snapshot.';
END
$$;
