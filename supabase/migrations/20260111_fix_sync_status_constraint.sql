-- Fix sync_status table: add unique constraint needed for upsert
-- This constraint is required for the sync service to properly track progress

-- First, remove any duplicates (keep the most recent)
DELETE FROM sync_status a
USING sync_status b
WHERE a.id < b.id
  AND a.tenant_id = b.tenant_id
  AND a.sync_type = b.sync_type;

-- Add unique constraint on (tenant_id, sync_type) for upsert to work
CREATE UNIQUE INDEX IF NOT EXISTS sync_status_tenant_id_sync_type_key
ON sync_status(tenant_id, sync_type);

-- Alternative approach if the unique index doesn't work with ON CONFLICT:
-- Add a proper unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sync_status_tenant_sync_type_unique'
  ) THEN
    ALTER TABLE sync_status
    ADD CONSTRAINT sync_status_tenant_sync_type_unique
    UNIQUE (tenant_id, sync_type);
  END IF;
EXCEPTION WHEN duplicate_table THEN
  -- Constraint already exists, ignore
  NULL;
END $$;
