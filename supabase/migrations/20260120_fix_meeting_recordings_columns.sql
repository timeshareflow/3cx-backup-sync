-- Fix meeting_recordings table - add missing columns
-- This handles cases where the table exists but was created before all columns were added

-- Add recorded_at column if it doesn't exist
ALTER TABLE meeting_recordings
ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- Update existing rows to have a recorded_at value (use uploaded_at if available, or NOW())
UPDATE meeting_recordings
SET recorded_at = COALESCE(uploaded_at, meeting_started_at, NOW())
WHERE recorded_at IS NULL;

-- Now make it NOT NULL
ALTER TABLE meeting_recordings
ALTER COLUMN recorded_at SET NOT NULL;

-- Add other potentially missing columns
ALTER TABLE meeting_recordings
ADD COLUMN IF NOT EXISTS meeting_started_at TIMESTAMPTZ;

ALTER TABLE meeting_recordings
ADD COLUMN IF NOT EXISTS meeting_ended_at TIMESTAMPTZ;

ALTER TABLE meeting_recordings
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW();

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meeting_recordings(tenant_id, recorded_at DESC);
