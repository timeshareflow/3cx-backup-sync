-- Add storage_backend column to all media-related tables
-- This tracks where each file is stored: 'supabase' or 'spaces'
-- Safe to run multiple times (uses IF NOT EXISTS)

-- Media files table
ALTER TABLE media_files
ADD COLUMN IF NOT EXISTS storage_backend varchar(20) DEFAULT 'supabase';

COMMENT ON COLUMN media_files.storage_backend IS 'Storage backend: supabase (Supabase Storage) or spaces (DigitalOcean Spaces)';

CREATE INDEX IF NOT EXISTS idx_media_files_backend ON media_files(storage_backend);

-- Call recordings table
ALTER TABLE call_recordings
ADD COLUMN IF NOT EXISTS storage_backend varchar(20) DEFAULT 'supabase';

COMMENT ON COLUMN call_recordings.storage_backend IS 'Storage backend: supabase (Supabase Storage) or spaces (DigitalOcean Spaces)';

CREATE INDEX IF NOT EXISTS idx_call_recordings_backend ON call_recordings(storage_backend);

-- Voicemails table
ALTER TABLE voicemails
ADD COLUMN IF NOT EXISTS storage_backend varchar(20) DEFAULT 'supabase';

COMMENT ON COLUMN voicemails.storage_backend IS 'Storage backend: supabase (Supabase Storage) or spaces (DigitalOcean Spaces)';

CREATE INDEX IF NOT EXISTS idx_voicemails_backend ON voicemails(storage_backend);

-- Faxes table
ALTER TABLE faxes
ADD COLUMN IF NOT EXISTS storage_backend varchar(20) DEFAULT 'supabase';

COMMENT ON COLUMN faxes.storage_backend IS 'Storage backend: supabase (Supabase Storage) or spaces (DigitalOcean Spaces)';

CREATE INDEX IF NOT EXISTS idx_faxes_backend ON faxes(storage_backend);

-- Meeting recordings table
ALTER TABLE meeting_recordings
ADD COLUMN IF NOT EXISTS storage_backend varchar(20) DEFAULT 'supabase';

COMMENT ON COLUMN meeting_recordings.storage_backend IS 'Storage backend: supabase (Supabase Storage) or spaces (DigitalOcean Spaces)';

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_backend ON meeting_recordings(storage_backend);
