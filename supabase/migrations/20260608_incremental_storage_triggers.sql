-- Migration: Replace expensive per-insert full-scan storage triggers with
-- incremental counters (Option E) and add a periodic recalculation function
-- for the safety-net cron job (Option B).
--
-- Problem being fixed:
--   The old update_tenant_storage() trigger does 5 full-table SUM scans on
--   every single file insert. At 1,000 files synced → 5,000 expensive queries.
--   It also had no DELETE handler, so removed files were never subtracted.
--
-- What this migration does:
--   1. Creates increment_tenant_storage()   — adds NEW.file_size on INSERT
--   2. Creates decrement_tenant_storage()   — subtracts OLD.file_size on DELETE
--   3. Creates recalculate_all_tenant_storage() — full recalc for periodic cron
--   4. Drops the 5 old INSERT triggers
--   5. Runs a one-time full recalculation to establish an accurate baseline
--      (also corrects existing drift from the missing DELETE handler)
--   6. Creates 5 new INSERT triggers
--   7. Creates 5 new DELETE triggers
--
-- Safety guarantee:
--   All steps run inside a single transaction. PostgreSQL transactional DDL
--   means the old triggers remain active until COMMIT — there is no window
--   where a file insert fires no trigger at all.

BEGIN;

-- ─── 1. Increment function — fires on INSERT ──────────────────────────────────
CREATE OR REPLACE FUNCTION increment_tenant_storage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.file_size IS NOT NULL AND NEW.file_size > 0 THEN
    UPDATE tenants
    SET storage_used_bytes = storage_used_bytes + NEW.file_size
    WHERE id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 2. Decrement function — fires on DELETE ──────────────────────────────────
-- GREATEST(0, ...) prevents the counter from ever going negative, even if the
-- existing value had drift from the pre-existing missing-delete-handler bug.
CREATE OR REPLACE FUNCTION decrement_tenant_storage()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.file_size IS NOT NULL AND OLD.file_size > 0 THEN
    UPDATE tenants
    SET storage_used_bytes = GREATEST(0, storage_used_bytes - OLD.file_size)
    WHERE id = OLD.tenant_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ─── 3. Periodic recalculation function — called by cron every 30 min ─────────
-- This is the safety net. Even if the incremental counter ever drifts due to
-- any edge case (bulk deletes, re-synced files, etc.), this corrects it within
-- 30 minutes. SECURITY DEFINER so the service role can call it via RPC.
CREATE OR REPLACE FUNCTION recalculate_all_tenant_storage()
RETURNS void AS $$
BEGIN
  UPDATE tenants t
  SET storage_used_bytes = (
    SELECT COALESCE(SUM(file_size), 0) FROM media_files        WHERE tenant_id = t.id
  ) + (
    SELECT COALESCE(SUM(file_size), 0) FROM call_recordings    WHERE tenant_id = t.id
  ) + (
    SELECT COALESCE(SUM(file_size), 0) FROM voicemails          WHERE tenant_id = t.id
  ) + (
    SELECT COALESCE(SUM(file_size), 0) FROM faxes               WHERE tenant_id = t.id
  ) + (
    SELECT COALESCE(SUM(file_size), 0) FROM meeting_recordings  WHERE tenant_id = t.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 4. Drop old per-insert full-scan triggers ────────────────────────────────
DROP TRIGGER IF EXISTS trigger_media_storage     ON media_files;
DROP TRIGGER IF EXISTS trigger_recording_storage ON call_recordings;
DROP TRIGGER IF EXISTS trigger_voicemail_storage ON voicemails;
DROP TRIGGER IF EXISTS trigger_fax_storage       ON faxes;
DROP TRIGGER IF EXISTS trigger_meeting_storage   ON meeting_recordings;

-- ─── 5. One-time baseline recalculation ──────────────────────────────────────
-- Runs while old triggers are dropped and new ones aren't yet active (safe
-- because we're inside a transaction — no other session can insert files here).
-- Also corrects any drift accumulated from the missing DELETE handler.
SELECT recalculate_all_tenant_storage();

-- ─── 6. New INSERT triggers (one per file table) ──────────────────────────────
CREATE TRIGGER trigger_media_storage_inc
  AFTER INSERT ON media_files
  FOR EACH ROW EXECUTE FUNCTION increment_tenant_storage();

CREATE TRIGGER trigger_recording_storage_inc
  AFTER INSERT ON call_recordings
  FOR EACH ROW EXECUTE FUNCTION increment_tenant_storage();

CREATE TRIGGER trigger_voicemail_storage_inc
  AFTER INSERT ON voicemails
  FOR EACH ROW EXECUTE FUNCTION increment_tenant_storage();

CREATE TRIGGER trigger_fax_storage_inc
  AFTER INSERT ON faxes
  FOR EACH ROW EXECUTE FUNCTION increment_tenant_storage();

CREATE TRIGGER trigger_meeting_storage_inc
  AFTER INSERT ON meeting_recordings
  FOR EACH ROW EXECUTE FUNCTION increment_tenant_storage();

-- ─── 7. New DELETE triggers — these were completely missing before ─────────────
-- Files that were deleted never decremented storage_used_bytes under the old
-- trigger. These fix that going forward; the recalculation above fixed history.
CREATE TRIGGER trigger_media_storage_dec
  AFTER DELETE ON media_files
  FOR EACH ROW EXECUTE FUNCTION decrement_tenant_storage();

CREATE TRIGGER trigger_recording_storage_dec
  AFTER DELETE ON call_recordings
  FOR EACH ROW EXECUTE FUNCTION decrement_tenant_storage();

CREATE TRIGGER trigger_voicemail_storage_dec
  AFTER DELETE ON voicemails
  FOR EACH ROW EXECUTE FUNCTION decrement_tenant_storage();

CREATE TRIGGER trigger_fax_storage_dec
  AFTER DELETE ON faxes
  FOR EACH ROW EXECUTE FUNCTION decrement_tenant_storage();

CREATE TRIGGER trigger_meeting_storage_dec
  AFTER DELETE ON meeting_recordings
  FOR EACH ROW EXECUTE FUNCTION decrement_tenant_storage();

COMMIT;
