-- 3CX BackupWiz - COMPLETE RESET & SETUP
-- This single script does EVERYTHING:
-- 1. Drops all existing tables/functions/triggers
-- 2. Creates all tables with correct schema
-- 3. Sets up RLS policies
-- 4. Creates your super admin account
--
-- INSTRUCTIONS:
-- 1. First, go to Authentication > Users and create your user (allendalecompanies@gmail.com)
-- 2. Copy this ENTIRE file and paste in SQL Editor
-- 3. Click Run
-- 4. Done!

-- ============================================
-- STEP 1: COMPLETE CLEANUP
-- ============================================
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================
-- STEP 2: EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STEP 3: APP SETTINGS (Global)
-- ============================================
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STEP 4: TENANTS
-- ============================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  storage_quota_bytes BIGINT DEFAULT 10737418240, -- 10GB default
  storage_used_bytes BIGINT DEFAULT 0,
  settings JSONB DEFAULT '{}',

  -- 3CX Database Connection Settings
  threecx_host VARCHAR(255),
  threecx_port INTEGER DEFAULT 5432,
  threecx_database VARCHAR(100) DEFAULT 'database_single',
  threecx_user VARCHAR(100) DEFAULT 'postgres',
  threecx_password TEXT, -- Encrypted at app level

  -- 3CX File Paths
  threecx_chat_files_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files',
  threecx_recordings_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Recordings',
  threecx_voicemail_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Voicemail',
  threecx_fax_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Fax',
  threecx_meetings_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Http/Recordings',

  -- Backup Settings
  backup_chats BOOLEAN DEFAULT TRUE,
  backup_chat_media BOOLEAN DEFAULT TRUE,
  backup_recordings BOOLEAN DEFAULT TRUE,
  backup_voicemails BOOLEAN DEFAULT TRUE,
  backup_faxes BOOLEAN DEFAULT TRUE,
  backup_cdr BOOLEAN DEFAULT TRUE,
  backup_meetings BOOLEAN DEFAULT TRUE,

  -- Sync Settings
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_interval_seconds INTEGER DEFAULT 60,
  last_sync_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_active ON tenants(is_active);

-- ============================================
-- STEP 5: USER PROFILES
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
-- STEP 6: USER-TENANT ASSOCIATIONS
-- ============================================
CREATE TABLE user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  can_view_chats BOOLEAN DEFAULT TRUE,
  can_view_recordings BOOLEAN DEFAULT TRUE,
  can_view_voicemails BOOLEAN DEFAULT TRUE,
  can_view_faxes BOOLEAN DEFAULT TRUE,
  can_view_meetings BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON user_tenants(tenant_id);

-- ============================================
-- STEP 7: TENANT SETTINGS
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
-- STEP 8: EXTENSIONS (Phone Extensions)
-- ============================================
CREATE TABLE extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  extension_number VARCHAR(20) NOT NULL,
  display_name VARCHAR(255),
  email VARCHAR(255),
  department VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, extension_number)
);

CREATE INDEX idx_extensions_tenant ON extensions(tenant_id);
CREATE INDEX idx_extensions_number ON extensions(extension_number);

-- ============================================
-- STEP 9: CONVERSATIONS
-- ============================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_chat_id VARCHAR(255),
  subject VARCHAR(500),
  channel_type VARCHAR(50) DEFAULT 'chat',
  is_group BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'active',
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, threecx_chat_id)
);

CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_threecx_id ON conversations(threecx_chat_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- ============================================
-- STEP 10: PARTICIPANTS
-- ============================================
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  extension_id UUID REFERENCES extensions(id),
  participant_type VARCHAR(50) DEFAULT 'internal',
  external_id VARCHAR(255),
  external_name VARCHAR(255),
  external_number VARCHAR(50),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_participants_conversation ON participants(conversation_id);
CREATE INDEX idx_participants_extension ON participants(extension_id);

-- ============================================
-- STEP 11: MESSAGES
-- ============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_participant_id UUID REFERENCES participants(id),
  threecx_message_id VARCHAR(255),
  content TEXT,
  message_type VARCHAR(50) DEFAULT 'text',
  is_from_external BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at DESC);
CREATE INDEX idx_messages_threecx_id ON messages(threecx_message_id);

-- ============================================
-- STEP 12: MEDIA FILES
-- ============================================
CREATE TABLE media_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(100),
  file_size BIGINT,
  mime_type VARCHAR(100),
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  duration_seconds INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_files_message ON media_files(message_id);
CREATE INDEX idx_media_files_tenant ON media_files(tenant_id);

-- ============================================
-- STEP 13: CALL RECORDINGS
-- ============================================
CREATE TABLE call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_call_id VARCHAR(255),
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT,
  duration_seconds INTEGER,
  storage_path TEXT NOT NULL,
  caller_number VARCHAR(50),
  caller_name VARCHAR(255),
  callee_number VARCHAR(50),
  callee_name VARCHAR(255),
  extension_id UUID REFERENCES extensions(id),
  direction VARCHAR(20),
  call_type VARCHAR(50),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, threecx_call_id)
);

CREATE INDEX idx_call_recordings_tenant ON call_recordings(tenant_id);
CREATE INDEX idx_call_recordings_extension ON call_recordings(extension_id);
CREATE INDEX idx_call_recordings_started ON call_recordings(started_at DESC);

-- ============================================
-- STEP 14: VOICEMAILS
-- ============================================
CREATE TABLE voicemails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_voicemail_id VARCHAR(255),
  extension_id UUID REFERENCES extensions(id),
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT,
  duration_seconds INTEGER,
  storage_path TEXT NOT NULL,
  caller_number VARCHAR(50),
  caller_name VARCHAR(255),
  transcription TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, threecx_voicemail_id)
);

CREATE INDEX idx_voicemails_tenant ON voicemails(tenant_id);
CREATE INDEX idx_voicemails_extension ON voicemails(extension_id);
CREATE INDEX idx_voicemails_received ON voicemails(received_at DESC);

-- ============================================
-- STEP 15: FAXES
-- ============================================
CREATE TABLE faxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_fax_id VARCHAR(255),
  extension_id UUID REFERENCES extensions(id),
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT,
  page_count INTEGER,
  storage_path TEXT NOT NULL,
  direction VARCHAR(20),
  remote_number VARCHAR(50),
  remote_name VARCHAR(255),
  status VARCHAR(50),
  sent_received_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, threecx_fax_id)
);

CREATE INDEX idx_faxes_tenant ON faxes(tenant_id);
CREATE INDEX idx_faxes_extension ON faxes(extension_id);
CREATE INDEX idx_faxes_date ON faxes(sent_received_at DESC);

-- ============================================
-- STEP 16: CALL LOGS (CDR)
-- ============================================
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_call_id VARCHAR(255),
  extension_id UUID REFERENCES extensions(id),
  caller_number VARCHAR(50),
  caller_name VARCHAR(255),
  callee_number VARCHAR(50),
  callee_name VARCHAR(255),
  direction VARCHAR(20),
  call_type VARCHAR(50),
  status VARCHAR(50),
  duration_seconds INTEGER,
  ring_duration_seconds INTEGER,
  queue_wait_seconds INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  recording_id UUID REFERENCES call_recordings(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, threecx_call_id)
);

CREATE INDEX idx_call_logs_tenant ON call_logs(tenant_id);
CREATE INDEX idx_call_logs_extension ON call_logs(extension_id);
CREATE INDEX idx_call_logs_started ON call_logs(started_at DESC);

-- ============================================
-- STEP 17: MEETING RECORDINGS
-- ============================================
CREATE TABLE meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  threecx_meeting_id VARCHAR(255),
  title VARCHAR(500),
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT,
  duration_seconds INTEGER,
  storage_path TEXT NOT NULL,
  organizer_extension_id UUID REFERENCES extensions(id),
  organizer_name VARCHAR(255),
  organizer_email VARCHAR(255),
  participant_count INTEGER DEFAULT 0,
  participants JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  meeting_type VARCHAR(50) DEFAULT 'scheduled',
  is_recurring BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, threecx_meeting_id)
);

CREATE INDEX idx_meeting_recordings_tenant ON meeting_recordings(tenant_id);
CREATE INDEX idx_meeting_recordings_organizer ON meeting_recordings(organizer_extension_id);
CREATE INDEX idx_meeting_recordings_started ON meeting_recordings(started_at DESC);

-- ============================================
-- STEP 18: STORAGE USAGE TRACKING
-- ============================================
CREATE TABLE storage_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  chat_media_bytes BIGINT DEFAULT 0,
  recordings_bytes BIGINT DEFAULT 0,
  voicemails_bytes BIGINT DEFAULT 0,
  faxes_bytes BIGINT DEFAULT 0,
  meetings_bytes BIGINT DEFAULT 0,
  total_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

CREATE INDEX idx_storage_usage_tenant_date ON storage_usage(tenant_id, date DESC);

-- ============================================
-- STEP 19: SYNC STATUS
-- ============================================
CREATE TABLE sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'idle',
  last_sync_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  items_synced INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_status_tenant ON sync_status(tenant_id);
CREATE INDEX idx_sync_status_type ON sync_status(sync_type);

-- ============================================
-- STEP 20: SYNC LOGS
-- ============================================
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  items_processed INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  error_details JSONB,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_sync_logs_tenant ON sync_logs(tenant_id);
CREATE INDEX idx_sync_logs_started ON sync_logs(started_at DESC);

-- ============================================
-- STEP 21: AUDIT LOGS
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
-- STEP 22: HELPER FUNCTIONS
-- ============================================

-- Update conversation stats
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET
    message_count = message_count + 1,
    last_message_at = NEW.sent_at
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

CREATE TRIGGER trigger_media_storage AFTER INSERT ON media_files FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();
CREATE TRIGGER trigger_recording_storage AFTER INSERT ON call_recordings FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();
CREATE TRIGGER trigger_voicemail_storage AFTER INSERT ON voicemails FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();
CREATE TRIGGER trigger_fax_storage AFTER INSERT ON faxes FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();
CREATE TRIGGER trigger_meeting_storage AFTER INSERT ON meeting_recordings FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();

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

-- Check if user is super admin (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get user's accessible tenant IDs
CREATE OR REPLACE FUNCTION get_user_tenant_ids()
RETURNS SETOF UUID AS $$
BEGIN
  IF is_super_admin() THEN
    RETURN QUERY SELECT id FROM tenants WHERE is_active = TRUE;
  ELSE
    RETURN QUERY
      SELECT ut.tenant_id FROM user_tenants ut
      JOIN tenants t ON t.id = ut.tenant_id
      WHERE ut.user_id = auth.uid() AND t.is_active = TRUE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get tenant statistics
CREATE OR REPLACE FUNCTION get_tenant_stats(p_tenant_id UUID)
RETURNS TABLE (
  conversation_count BIGINT,
  message_count BIGINT,
  recording_count BIGINT,
  voicemail_count BIGINT,
  fax_count BIGINT,
  meeting_count BIGINT,
  extension_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM conversations WHERE tenant_id = p_tenant_id),
    (SELECT COUNT(*) FROM messages WHERE tenant_id = p_tenant_id),
    (SELECT COUNT(*) FROM call_recordings WHERE tenant_id = p_tenant_id),
    (SELECT COUNT(*) FROM voicemails WHERE tenant_id = p_tenant_id),
    (SELECT COUNT(*) FROM faxes WHERE tenant_id = p_tenant_id),
    (SELECT COUNT(*) FROM meeting_recordings WHERE tenant_id = p_tenant_id),
    (SELECT COUNT(*) FROM extensions WHERE tenant_id = p_tenant_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get system-wide statistics (super admin only)
CREATE OR REPLACE FUNCTION get_system_stats()
RETURNS TABLE (
  total_tenants BIGINT,
  total_users BIGINT,
  total_conversations BIGINT,
  total_messages BIGINT,
  total_recordings BIGINT,
  total_storage_bytes BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM tenants WHERE is_active = TRUE),
    (SELECT COUNT(*) FROM user_profiles WHERE is_active = TRUE),
    (SELECT COUNT(*) FROM conversations),
    (SELECT COUNT(*) FROM messages),
    (SELECT COUNT(*) FROM call_recordings) + (SELECT COUNT(*) FROM voicemails) + (SELECT COUNT(*) FROM meeting_recordings),
    (SELECT COALESCE(SUM(storage_used_bytes), 0) FROM tenants);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
-- STEP 23: ROW LEVEL SECURITY
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
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- App settings policies
CREATE POLICY "Super admins can manage app settings" ON app_settings
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Authenticated users can view app settings" ON app_settings
  FOR SELECT TO authenticated USING (true);

-- Tenant policies
CREATE POLICY "Super admins can manage all tenants" ON tenants
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Users can view their tenants" ON tenants
  FOR SELECT TO authenticated USING (id IN (SELECT get_user_tenant_ids()));

-- User profile policies (simplified to avoid circular dependency)
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- User tenants policies
CREATE POLICY "Super admins can manage all user_tenants" ON user_tenants
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Users can view own tenant associations" ON user_tenants
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Tenant settings policies
CREATE POLICY "Super admins can manage all tenant settings" ON tenant_settings
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Tenant admins can manage their settings" ON tenant_settings
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid() AND role = 'admin'));

-- Data access policies (conversations, messages, etc.)
CREATE POLICY "Users can view tenant conversations" ON conversations
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY "Users can view tenant participants" ON participants
  FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT id FROM conversations WHERE tenant_id IN (SELECT get_user_tenant_ids())));
CREATE POLICY "Users can view tenant messages" ON messages
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY "Users can view tenant media" ON media_files
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY "Users can view tenant recordings" ON call_recordings
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY "Users can view tenant voicemails" ON voicemails
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY "Users can view tenant faxes" ON faxes
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY "Users can view tenant call logs" ON call_logs
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY "Users can view tenant meetings" ON meeting_recordings
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY "Users can view tenant extensions" ON extensions
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Sync and storage policies
CREATE POLICY "Super admins can manage sync status" ON sync_status
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Users can view sync status" ON sync_status
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY "Super admins can manage sync logs" ON sync_logs
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Users can view sync logs" ON sync_logs
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY "Users can view storage usage" ON storage_usage
  FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Audit log policies
CREATE POLICY "Super admins can view all audit logs" ON audit_logs
  FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can view own audit logs" ON audit_logs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Service role full access (for API operations)
CREATE POLICY "Service role full access app_settings" ON app_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access tenants" ON tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access user_profiles" ON user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access user_tenants" ON user_tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access storage_usage" ON storage_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access conversations" ON conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access participants" ON participants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access messages" ON messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access media_files" ON media_files FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access call_recordings" ON call_recordings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access voicemails" ON voicemails FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access faxes" ON faxes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access call_logs" ON call_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access meeting_recordings" ON meeting_recordings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access extensions" ON extensions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access tenant_settings" ON tenant_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_status" ON sync_status FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_logs" ON sync_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access audit_logs" ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- STEP 24: VIEWS
-- ============================================

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
  COUNT(DISTINCT mf.id) as media_files_count,
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

-- ============================================
-- STEP 25: GRANT PERMISSIONS
-- ============================================
-- These grants are REQUIRED after DROP SCHEMA CASCADE
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================
-- STEP 26: CREATE SUPER ADMIN
-- ============================================
-- This creates the super admin profile for your user
INSERT INTO user_profiles (id, email, role, is_protected, is_active)
SELECT id, email, 'super_admin', TRUE, TRUE
FROM auth.users
WHERE email = 'allendalecompanies@gmail.com'
ON CONFLICT (id) DO UPDATE SET
  role = 'super_admin',
  is_protected = TRUE,
  is_active = TRUE;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'SETUP COMPLETE!' as status;
SELECT id, email, role, is_protected, is_active FROM user_profiles;
