-- Add trigger_requested_at column for manual sync triggers
ALTER TABLE sync_status
ADD COLUMN IF NOT EXISTS trigger_requested_at TIMESTAMPTZ;

-- Add comment
COMMENT ON COLUMN sync_status.trigger_requested_at IS 'Timestamp when a manual sync was requested via the UI';
