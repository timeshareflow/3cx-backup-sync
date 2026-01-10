-- Add meeting recordings support to 3CX BackupWiz
-- Run this migration after the main schema

-- ============================================
-- ADD MEETING PATH TO TENANTS
-- ============================================
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS threecx_meetings_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Http/Recordings';

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS backup_meetings BOOLEAN DEFAULT TRUE;

-- ============================================
-- MEETING RECORDINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_meeting_id VARCHAR(255),

  -- Meeting details
  meeting_name VARCHAR(255),
  meeting_host VARCHAR(255),
  host_extension VARCHAR(50),
  participant_count INTEGER DEFAULT 0,

  -- Participants (stored as JSON array)
  participants JSONB DEFAULT '[]',

  -- Recording file info
  original_filename VARCHAR(255),
  file_size BIGINT,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) DEFAULT 'video/mp4',
  duration_seconds INTEGER,

  -- Video metadata
  width INTEGER,
  height INTEGER,
  has_audio BOOLEAN DEFAULT TRUE,
  has_video BOOLEAN DEFAULT TRUE,

  -- Timestamps
  meeting_started_at TIMESTAMPTZ,
  meeting_ended_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),

  -- Search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      COALESCE(meeting_name, '') || ' ' ||
      COALESCE(meeting_host, '')
    )
  ) STORED,

  UNIQUE(tenant_id, threecx_meeting_id)
);

CREATE INDEX IF NOT EXISTS idx_meetings_tenant ON meeting_recordings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meetings_host ON meeting_recordings(tenant_id, host_extension);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meeting_recordings(tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_search ON meeting_recordings USING GIN(search_vector);

-- ============================================
-- UPDATE STORAGE TRACKING
-- ============================================

-- Add meeting bytes to storage_usage table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'storage_usage') THEN
    ALTER TABLE storage_usage ADD COLUMN IF NOT EXISTS meetings_bytes BIGINT DEFAULT 0;
    ALTER TABLE storage_usage ADD COLUMN IF NOT EXISTS meetings_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Update the tenant storage function to include meetings
CREATE OR REPLACE FUNCTION update_tenant_storage()
RETURNS TRIGGER AS $$
BEGIN
  -- Update storage_used_bytes on tenant
  UPDATE tenants SET storage_used_bytes = (
    SELECT COALESCE(SUM(file_size), 0) FROM media_files WHERE tenant_id = NEW.tenant_id
  ) + (
    SELECT COALESCE(SUM(file_size), 0) FROM call_recordings WHERE tenant_id = NEW.tenant_id
  ) + (
    SELECT COALESCE(SUM(file_size), 0) FROM voicemails WHERE tenant_id = NEW.tenant_id
  ) + (
    SELECT COALESCE(SUM(file_size), 0) FROM faxes WHERE tenant_id = NEW.tenant_id
  ) + (
    SELECT COALESCE(SUM(file_size), 0) FROM meeting_recordings WHERE tenant_id = NEW.tenant_id
  )
  WHERE id = NEW.tenant_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for meeting recordings storage
CREATE TRIGGER trigger_meeting_storage
AFTER INSERT ON meeting_recordings
FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;

-- Users can view tenant meeting recordings
CREATE POLICY "Users can view tenant meetings"
ON meeting_recordings FOR SELECT TO authenticated
USING (has_tenant_access(auth.uid(), tenant_id));

-- Service role full access
CREATE POLICY "Service role full access meeting_recordings"
ON meeting_recordings FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- ============================================
-- ADD PERMISSION TO USER TENANTS
-- ============================================
ALTER TABLE user_tenants
ADD COLUMN IF NOT EXISTS can_view_meetings BOOLEAN DEFAULT TRUE;

-- ============================================
-- UPDATE STORAGE USAGE VIEW
-- ============================================
DROP VIEW IF EXISTS tenant_storage_usage;
CREATE VIEW tenant_storage_usage AS
SELECT
  t.id as tenant_id,
  t.name as tenant_name,
  t.storage_quota_bytes,
  t.storage_used_bytes,
  COALESCE(SUM(mf.file_size), 0) as chat_media_bytes,
  COALESCE(SUM(cr.file_size), 0) as recordings_bytes,
  COALESCE(SUM(vm.file_size), 0) as voicemails_bytes,
  COALESCE(SUM(fx.file_size), 0) as faxes_bytes,
  COALESCE(SUM(mr.file_size), 0) as meetings_bytes,
  COUNT(DISTINCT mf.id) as chat_media_count,
  COUNT(DISTINCT cr.id) as recordings_count,
  COUNT(DISTINCT vm.id) as voicemails_count,
  COUNT(DISTINCT fx.id) as faxes_count,
  COUNT(DISTINCT mr.id) as meetings_count
FROM tenants t
LEFT JOIN media_files mf ON mf.tenant_id = t.id
LEFT JOIN call_recordings cr ON cr.tenant_id = t.id
LEFT JOIN voicemails vm ON vm.tenant_id = t.id
LEFT JOIN faxes fx ON fx.tenant_id = t.id
LEFT JOIN meeting_recordings mr ON mr.tenant_id = t.id
GROUP BY t.id;
