-- Add notes field to sync_status for detailed status messages
ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS notes TEXT;

-- Comment for documentation
COMMENT ON COLUMN sync_status.notes IS 'Detailed notes about the sync result (e.g., "No files found", "Directory does not exist")';
