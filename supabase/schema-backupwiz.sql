-- 3CX BackupWiz - Full Multi-Tenant Backup Schema
-- Run this in Supabase SQL Editor
-- Supports: Chat, Call Recordings, Voicemails, Faxes, CDR, and more

-- ============================================
-- CLEANUP: Drop existing tables if they exist
-- ============================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP VIEW IF EXISTS messages_with_media CASCADE;
DROP VIEW IF EXISTS conversations_with_participants CASCADE;
DROP VIEW IF EXISTS tenant_storage_usage CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS sync_status CASCADE;
DROP TABLE IF EXISTS media_files CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS call_recordings CASCADE;
DROP TABLE IF EXISTS voicemails CASCADE;
DROP TABLE IF EXISTS faxes CASCADE;
DROP TABLE IF EXISTS call_logs CASCADE;
DROP TABLE IF EXISTS extensions CASCADE;
DROP TABLE IF EXISTS tenant_settings CASCADE;
DROP TABLE IF EXISTS storage_usage CASCADE;
DROP TABLE IF EXISTS user_tenants CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- APP SETTINGS (Global)
-- ============================================
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default app settings
INSERT INTO app_settings (key, value, description, is_public) VALUES
  ('app_name', '"3CX BackupWiz"', 'Application name displayed in UI', true),
  ('allow_signups', 'false', 'Whether new users can sign up', false),
  ('default_user_role', '"user"', 'Default role for new users', false),
  ('max_tenants', '100', 'Maximum number of tenants allowed', false),
  ('sync_interval_seconds', '60', 'Default sync interval in seconds', false),
  ('storage_provider', '"supabase"', 'Storage provider (supabase)', false),
  ('retention_days', '0', 'Auto-delete data older than X days (0 = never)', false),
  ('max_file_size_mb', '500', 'Maximum file size for uploads in MB', false);

-- ============================================
-- TENANTS (Each 3CX instance/customer)
-- ============================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,

  -- 3CX Connection Settings
  threecx_host VARCHAR(255),
  threecx_port INTEGER DEFAULT 5432,
  threecx_database VARCHAR(100) DEFAULT 'database_single',
  threecx_user VARCHAR(100) DEFAULT 'postgres',
  threecx_password TEXT, -- Will be encrypted at app level

  -- 3CX File Paths
  threecx_chat_files_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files',
  threecx_recordings_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Recordings',
  threecx_voicemail_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Voicemail',
  threecx_fax_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Fax',

  -- Backup Settings (what to sync)
  backup_chats BOOLEAN DEFAULT TRUE,
  backup_chat_media BOOLEAN DEFAULT TRUE,
  backup_recordings BOOLEAN DEFAULT TRUE,
  backup_voicemails BOOLEAN DEFAULT TRUE,
  backup_faxes BOOLEAN DEFAULT TRUE,
  backup_cdr BOOLEAN DEFAULT TRUE,

  -- Storage quota (bytes, 0 = unlimited)
  storage_quota_bytes BIGINT DEFAULT 0,
  storage_used_bytes BIGINT DEFAULT 0,

  -- Sync Settings
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_interval_seconds INTEGER DEFAULT 60,
  last_sync_at TIMESTAMPTZ,

  -- Billing/Plan info
  plan_type VARCHAR(50) DEFAULT 'free',
  plan_expires_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_active ON tenants(is_active);

-- ============================================
-- USER PROFILES (Extends auth.users)
-- ============================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin', 'admin', 'user')),
  is_protected BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- ============================================
-- USER-TENANT ASSOCIATIONS
-- ============================================
CREATE TABLE user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (tenant_role IN ('admin', 'user')),
  can_export BOOLEAN DEFAULT TRUE,
  can_search BOOLEAN DEFAULT TRUE,
  can_view_media BOOLEAN DEFAULT TRUE,
  can_view_recordings BOOLEAN DEFAULT TRUE,
  can_view_voicemails BOOLEAN DEFAULT TRUE,
  can_view_faxes BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON user_tenants(tenant_id);

-- ============================================
-- TENANT SETTINGS
-- ============================================
CREATE TABLE tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, key)
);

-- ============================================
-- EXTENSIONS (3CX Users/Extensions)
-- ============================================
CREATE TABLE extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  extension_number VARCHAR(50) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  display_name VARCHAR(255),
  email VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, extension_number)
);

CREATE INDEX idx_extensions_tenant ON extensions(tenant_id);

-- ============================================
-- CONVERSATIONS (Chat conversations)
-- ============================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_conversation_id VARCHAR(255) NOT NULL,
  conversation_name VARCHAR(255),
  is_external BOOLEAN DEFAULT FALSE,
  is_group_chat BOOLEAN DEFAULT FALSE,
  participant_count INTEGER DEFAULT 2,
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, threecx_conversation_id)
);

CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_last_message ON conversations(tenant_id, last_message_at DESC);

-- ============================================
-- PARTICIPANTS (Chat participants)
-- ============================================
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  extension_number VARCHAR(50),
  display_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  participant_type VARCHAR(50) DEFAULT 'extension',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, extension_number)
);

CREATE INDEX idx_participants_tenant ON participants(tenant_id);
CREATE INDEX idx_participants_conversation ON participants(conversation_id);

-- ============================================
-- MESSAGES (Chat messages)
-- ============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  threecx_message_id VARCHAR(255),
  sender_extension VARCHAR(50),
  sender_name VARCHAR(255),
  message_text TEXT,
  message_type VARCHAR(50) DEFAULT 'text',
  has_media BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(message_text, '') || ' ' || COALESCE(sender_name, ''))
  ) STORED,
  UNIQUE(tenant_id, threecx_message_id)
);

CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sent_at ON messages(tenant_id, sent_at DESC);
CREATE INDEX idx_messages_search ON messages USING GIN(search_vector);

-- ============================================
-- MEDIA FILES (Chat attachments)
-- ============================================
CREATE TABLE media_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  original_filename VARCHAR(255),
  stored_filename VARCHAR(255),
  file_type VARCHAR(50) DEFAULT 'document',
  mime_type VARCHAR(100),
  file_size BIGINT,
  storage_path VARCHAR(500) NOT NULL, -- Path in Supabase storage
  thumbnail_path VARCHAR(500),
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, storage_path)
);

CREATE INDEX idx_media_tenant ON media_files(tenant_id);
CREATE INDEX idx_media_message ON media_files(message_id);

-- ============================================
-- CALL RECORDINGS
-- ============================================
CREATE TABLE call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_recording_id VARCHAR(255),

  -- Call details
  call_id VARCHAR(255),
  caller_number VARCHAR(100),
  caller_name VARCHAR(255),
  callee_number VARCHAR(100),
  callee_name VARCHAR(255),
  extension VARCHAR(50),
  direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound', 'internal')),

  -- Recording file info
  original_filename VARCHAR(255),
  file_size BIGINT,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) DEFAULT 'audio/wav',
  duration_seconds INTEGER,

  -- Timestamps
  call_started_at TIMESTAMPTZ,
  call_ended_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),

  -- Search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      COALESCE(caller_name, '') || ' ' ||
      COALESCE(callee_name, '') || ' ' ||
      COALESCE(caller_number, '') || ' ' ||
      COALESCE(callee_number, '')
    )
  ) STORED,

  UNIQUE(tenant_id, threecx_recording_id)
);

CREATE INDEX idx_recordings_tenant ON call_recordings(tenant_id);
CREATE INDEX idx_recordings_extension ON call_recordings(tenant_id, extension);
CREATE INDEX idx_recordings_date ON call_recordings(tenant_id, recorded_at DESC);
CREATE INDEX idx_recordings_search ON call_recordings USING GIN(search_vector);

-- ============================================
-- VOICEMAILS
-- ============================================
CREATE TABLE voicemails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_voicemail_id VARCHAR(255),

  -- Voicemail details
  extension VARCHAR(50) NOT NULL,
  extension_name VARCHAR(255),
  caller_number VARCHAR(100),
  caller_name VARCHAR(255),

  -- File info
  original_filename VARCHAR(255),
  file_size BIGINT,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) DEFAULT 'audio/wav',
  duration_seconds INTEGER,

  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  is_urgent BOOLEAN DEFAULT FALSE,

  -- Transcription (future feature)
  transcription TEXT,

  -- Timestamps
  received_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, threecx_voicemail_id)
);

CREATE INDEX idx_voicemails_tenant ON voicemails(tenant_id);
CREATE INDEX idx_voicemails_extension ON voicemails(tenant_id, extension);
CREATE INDEX idx_voicemails_date ON voicemails(tenant_id, received_at DESC);

-- ============================================
-- FAXES
-- ============================================
CREATE TABLE faxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_fax_id VARCHAR(255),

  -- Fax details
  extension VARCHAR(50),
  extension_name VARCHAR(255),
  remote_number VARCHAR(100),
  remote_name VARCHAR(255),
  direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound')),

  -- File info
  original_filename VARCHAR(255),
  file_size BIGINT,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) DEFAULT 'application/pdf',
  page_count INTEGER,

  -- Status
  status VARCHAR(50) DEFAULT 'received',

  -- Timestamps
  fax_time TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, threecx_fax_id)
);

CREATE INDEX idx_faxes_tenant ON faxes(tenant_id);
CREATE INDEX idx_faxes_extension ON faxes(tenant_id, extension);
CREATE INDEX idx_faxes_date ON faxes(tenant_id, fax_time DESC);

-- ============================================
-- CALL LOGS (CDR - Call Detail Records)
-- ============================================
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_call_id VARCHAR(255),

  -- Call parties
  caller_number VARCHAR(100),
  caller_name VARCHAR(255),
  callee_number VARCHAR(100),
  callee_name VARCHAR(255),

  -- Extension involved
  extension VARCHAR(50),
  extension_name VARCHAR(255),

  -- Call details
  direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound', 'internal')),
  call_type VARCHAR(50), -- normal, transfer, conference, etc.
  status VARCHAR(50), -- answered, missed, busy, failed, voicemail

  -- Duration and timing
  ring_duration_seconds INTEGER DEFAULT 0,
  talk_duration_seconds INTEGER DEFAULT 0,
  hold_duration_seconds INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,

  -- Timestamps
  call_started_at TIMESTAMPTZ NOT NULL,
  call_answered_at TIMESTAMPTZ,
  call_ended_at TIMESTAMPTZ,

  -- Recording reference
  has_recording BOOLEAN DEFAULT FALSE,
  recording_id UUID REFERENCES call_recordings(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, threecx_call_id)
);

CREATE INDEX idx_call_logs_tenant ON call_logs(tenant_id);
CREATE INDEX idx_call_logs_extension ON call_logs(tenant_id, extension);
CREATE INDEX idx_call_logs_date ON call_logs(tenant_id, call_started_at DESC);
CREATE INDEX idx_call_logs_status ON call_logs(tenant_id, status);

-- ============================================
-- STORAGE USAGE (Track per-tenant usage)
-- ============================================
CREATE TABLE storage_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Usage by category (in bytes)
  chat_media_bytes BIGINT DEFAULT 0,
  recordings_bytes BIGINT DEFAULT 0,
  voicemails_bytes BIGINT DEFAULT 0,
  faxes_bytes BIGINT DEFAULT 0,

  -- File counts
  chat_media_count INTEGER DEFAULT 0,
  recordings_count INTEGER DEFAULT 0,
  voicemails_count INTEGER DEFAULT 0,
  faxes_count INTEGER DEFAULT 0,

  -- Last calculated
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id)
);

CREATE INDEX idx_storage_usage_tenant ON storage_usage(tenant_id);

-- ============================================
-- SYNC STATUS (Per tenant, per type)
-- ============================================
CREATE TABLE sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL, -- messages, recordings, voicemails, faxes, cdr
  last_sync_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  last_synced_id VARCHAR(255),
  last_synced_timestamp TIMESTAMPTZ,
  records_synced INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'idle',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, sync_type)
);

CREATE INDEX idx_sync_status_tenant ON sync_status(tenant_id);

-- ============================================
-- SYNC LOGS
-- ============================================
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(50),
  records_synced INTEGER DEFAULT 0,
  bytes_synced BIGINT DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_tenant ON sync_logs(tenant_id);
CREATE INDEX idx_sync_logs_started ON sync_logs(tenant_id, started_at DESC);

-- ============================================
-- AUDIT LOG
-- ============================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  tenant_id UUID REFERENCES tenants(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Update conversation stats
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET
    message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = NEW.conversation_id),
    last_message_at = (SELECT MAX(sent_at) FROM messages WHERE conversation_id = NEW.conversation_id),
    first_message_at = COALESCE(first_message_at, (SELECT MIN(sent_at) FROM messages WHERE conversation_id = NEW.conversation_id)),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_stats
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_stats();

-- Update tenant storage usage
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
  )
  WHERE id = NEW.tenant_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update storage on insert
CREATE TRIGGER trigger_media_storage AFTER INSERT ON media_files FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();
CREATE TRIGGER trigger_recording_storage AFTER INSERT ON call_recordings FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();
CREATE TRIGGER trigger_voicemail_storage AFTER INSERT ON voicemails FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();
CREATE TRIGGER trigger_fax_storage AFTER INSERT ON faxes FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_user_profiles_updated BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_conversations_updated BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_extensions_updated BEFORE UPDATE ON extensions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_sync_status_updated BEFORE UPDATE ON sync_status FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_app_settings_updated BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_tenant_settings_updated BEFORE UPDATE ON tenant_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_id AND role = 'super_admin' AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has tenant access
CREATE OR REPLACE FUNCTION has_tenant_access(user_id UUID, check_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF is_super_admin(user_id) THEN
    RETURN TRUE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM user_tenants ut
    JOIN user_profiles up ON up.id = ut.user_id
    WHERE ut.user_id = user_id
    AND ut.tenant_id = check_tenant_id
    AND up.is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's tenants
CREATE OR REPLACE FUNCTION get_user_tenants(user_id UUID)
RETURNS SETOF tenants AS $$
BEGIN
  IF is_super_admin(user_id) THEN
    RETURN QUERY SELECT * FROM tenants WHERE is_active = TRUE ORDER BY name;
  END IF;
  RETURN QUERY
  SELECT t.* FROM tenants t
  JOIN user_tenants ut ON ut.tenant_id = t.id
  WHERE ut.user_id = user_id AND t.is_active = TRUE
  ORDER BY t.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Prevent deletion of protected users
CREATE OR REPLACE FUNCTION prevent_protected_user_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_protected = TRUE THEN
    RAISE EXCEPTION 'Cannot delete protected user (super admin)';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_protected_deletion
BEFORE DELETE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION prevent_protected_user_deletion();

-- Prevent demotion of protected users
CREATE OR REPLACE FUNCTION prevent_protected_user_demotion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_protected = TRUE AND NEW.role != 'super_admin' THEN
    RAISE EXCEPTION 'Cannot demote protected super admin';
  END IF;
  IF OLD.is_protected = TRUE AND NEW.is_protected = FALSE THEN
    RAISE EXCEPTION 'Cannot remove protection from super admin';
  END IF;
  IF OLD.is_protected = TRUE AND NEW.is_active = FALSE THEN
    RAISE EXCEPTION 'Cannot deactivate protected super admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_protected_demotion
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION prevent_protected_user_demotion();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE voicemails ENABLE ROW LEVEL SECURITY;
ALTER TABLE faxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;

-- App Settings policies
CREATE POLICY "Super admins can manage app settings" ON app_settings
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Users can read public app settings" ON app_settings
  FOR SELECT TO authenticated USING (is_public = TRUE);

-- Tenant policies
CREATE POLICY "Super admins can manage all tenants" ON tenants
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Users can view assigned tenants" ON tenants
  FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), id));

-- User profile policies
CREATE POLICY "Super admins can manage all users" ON user_profiles
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE TO authenticated USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()));

-- User tenants policies
CREATE POLICY "Super admins can manage user tenants" ON user_tenants
  FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Tenant admins can view tenant users" ON user_tenants
  FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));

-- Tenant settings policies
CREATE POLICY "Tenant admins can manage settings" ON tenant_settings
  FOR ALL TO authenticated USING (has_tenant_access(auth.uid(), tenant_id)) WITH CHECK (has_tenant_access(auth.uid(), tenant_id));

-- Data table policies (based on tenant access)
CREATE POLICY "Users can view tenant conversations" ON conversations FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant participants" ON participants FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant messages" ON messages FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant media" ON media_files FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant recordings" ON call_recordings FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant voicemails" ON voicemails FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant faxes" ON faxes FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant call logs" ON call_logs FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant extensions" ON extensions FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant sync status" ON sync_status FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant sync logs" ON sync_logs FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));
CREATE POLICY "Users can view tenant storage usage" ON storage_usage FOR SELECT TO authenticated USING (has_tenant_access(auth.uid(), tenant_id));

-- Service role full access (for sync service)
CREATE POLICY "Service role full access conversations" ON conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access participants" ON participants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access messages" ON messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access media_files" ON media_files FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access call_recordings" ON call_recordings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access voicemails" ON voicemails FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access faxes" ON faxes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access call_logs" ON call_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access extensions" ON extensions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_status" ON sync_status FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_logs" ON sync_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access tenants" ON tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access user_profiles" ON user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access user_tenants" ON user_tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access storage_usage" ON storage_usage FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Audit logs policies
CREATE POLICY "Super admins can view all audit logs" ON audit_logs FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY "Users can view own audit logs" ON audit_logs FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============================================
-- VIEWS
-- ============================================

CREATE OR REPLACE VIEW conversations_with_participants AS
SELECT
  c.*,
  ARRAY_AGG(DISTINCT p.display_name) FILTER (WHERE p.display_name IS NOT NULL) as participant_names,
  ARRAY_AGG(DISTINCT p.extension_number) FILTER (WHERE p.extension_number IS NOT NULL) as extension_numbers
FROM conversations c
LEFT JOIN participants p ON p.conversation_id = c.id
GROUP BY c.id;

CREATE OR REPLACE VIEW messages_with_media AS
SELECT
  m.*,
  COALESCE(
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'id', mf.id,
        'storage_path', mf.storage_path,
        'file_type', mf.file_type,
        'mime_type', mf.mime_type,
        'original_filename', mf.original_filename
      )
    ) FILTER (WHERE mf.id IS NOT NULL),
    '[]'
  ) as media
FROM messages m
LEFT JOIN media_files mf ON mf.message_id = m.id
GROUP BY m.id;

-- Storage usage summary view
CREATE OR REPLACE VIEW tenant_storage_usage AS
SELECT
  t.id as tenant_id,
  t.name as tenant_name,
  t.storage_quota_bytes,
  t.storage_used_bytes,
  COALESCE(SUM(mf.file_size), 0) as chat_media_bytes,
  COALESCE(SUM(cr.file_size), 0) as recordings_bytes,
  COALESCE(SUM(vm.file_size), 0) as voicemails_bytes,
  COALESCE(SUM(fx.file_size), 0) as faxes_bytes,
  COUNT(DISTINCT mf.id) as chat_media_count,
  COUNT(DISTINCT cr.id) as recordings_count,
  COUNT(DISTINCT vm.id) as voicemails_count,
  COUNT(DISTINCT fx.id) as faxes_count
FROM tenants t
LEFT JOIN media_files mf ON mf.tenant_id = t.id
LEFT JOIN call_recordings cr ON cr.tenant_id = t.id
LEFT JOIN voicemails vm ON vm.tenant_id = t.id
LEFT JOIN faxes fx ON fx.tenant_id = t.id
GROUP BY t.id;

-- ============================================
-- SUPABASE STORAGE SETUP
-- ============================================
-- Run these commands in Supabase Dashboard > Storage

-- 1. Create bucket: backupwiz-files (or via SQL below)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('backupwiz-files', 'backupwiz-files', false);

-- 2. Storage RLS Policies (run in SQL Editor):
/*
-- Allow authenticated users to read files from their tenant folder
CREATE POLICY "Tenant users can read own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'backupwiz-files' AND
  (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM user_tenants WHERE user_id = auth.uid()
    UNION
    SELECT id::text FROM tenants WHERE EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
);

-- Allow service role full access (for sync service uploads)
CREATE POLICY "Service role full access"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'backupwiz-files')
WITH CHECK (bucket_id = 'backupwiz-files');
*/

-- ============================================
-- INITIAL SETUP NOTES
-- ============================================
-- After running this schema:
-- 1. Create a user via Supabase Auth (Dashboard > Authentication > Users > Add User)
-- 2. Run this SQL to make them super admin:
--    UPDATE user_profiles SET role = 'super_admin', is_protected = TRUE WHERE email = 'your-email@example.com';
-- 3. Create storage bucket 'backupwiz-files' in Supabase Dashboard > Storage
-- 4. Apply the storage RLS policies above
