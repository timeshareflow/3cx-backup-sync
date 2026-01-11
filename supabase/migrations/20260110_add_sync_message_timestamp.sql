-- Add column to track last synced message timestamp for incremental sync
ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS last_synced_message_at TIMESTAMPTZ;

-- Comment explaining the column
COMMENT ON COLUMN sync_status.last_synced_message_at IS 'Timestamp of the last message synced from 3CX, used for incremental sync';
