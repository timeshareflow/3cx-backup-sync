-- 3CX Chat Archiver - Multi-Tenant Schema with Super Admin
-- Run this in Supabase SQL Editor (replaces previous schema)

-- ============================================
-- CLEANUP: Drop existing tables if they exist
-- ============================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP VIEW IF EXISTS messages_with_media CASCADE;
DROP VIEW IF EXISTS conversations_with_participants CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS sync_status CASCADE;
DROP TABLE IF EXISTS media_files CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS extensions CASCADE;
DROP TABLE IF EXISTS tenant_settings CASCADE;
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
  is_public BOOLEAN DEFAULT FALSE, -- Can non-super-admins see this?
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default app settings
INSERT INTO app_settings (key, value, description, is_public) VALUES
  ('app_name', '"3CX Chat Archiver"', 'Application name displayed in UI', true),
  ('allow_signups', 'false', 'Whether new users can sign up (or must be invited)', false),
  ('default_user_role', '"user"', 'Default role for new users', false),
  ('max_tenants', '100', 'Maximum number of tenants allowed', false),
  ('sync_interval_seconds', '60', 'Default sync interval in seconds', false),
  ('media_storage_provider', '"s3"', 'Media storage provider (s3, supabase)', false),
  ('retention_days', '0', 'Auto-delete messages older than X days (0 = never)', false);

-- ============================================
-- TENANTS (Each 3CX instance)
-- ============================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL, -- URL-friendly identifier
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,

  -- 3CX Connection Settings
  threecx_host VARCHAR(255),
  threecx_db_port INTEGER DEFAULT 5480,
  threecx_db_name VARCHAR(100) DEFAULT 'database_single',
  threecx_db_user VARCHAR(100) DEFAULT 'phonesystem',
  threecx_db_password_encrypted TEXT, -- Encrypted password
  threecx_chat_files_path VARCHAR(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Chat',

  -- S3/Storage Settings
  s3_bucket VARCHAR(255),
  s3_region VARCHAR(50) DEFAULT 'us-east-1',
  s3_access_key_encrypted TEXT,
  s3_secret_key_encrypted TEXT,
  s3_prefix VARCHAR(255),

  -- Sync Settings
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_interval_seconds INTEGER DEFAULT 60,
  last_sync_at TIMESTAMPTZ,

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

  -- Role hierarchy: super_admin > admin > user
  role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin', 'admin', 'user')),

  -- Super admin protection
  is_protected BOOLEAN DEFAULT FALSE, -- Cannot be deleted if true

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,

  -- Settings
  preferences JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- ============================================
-- USER-TENANT ASSOCIATIONS (Many-to-Many)
-- ============================================
CREATE TABLE user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Role within this tenant (can be different from global role)
  tenant_role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (tenant_role IN ('admin', 'user')),

  -- Permissions override
  can_export BOOLEAN DEFAULT TRUE,
  can_search BOOLEAN DEFAULT TRUE,
  can_view_media BOOLEAN DEFAULT TRUE,

  -- Metadata
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
-- CONVERSATIONS (Now with tenant_id)
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
-- PARTICIPANTS (Now with tenant_id)
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
-- MESSAGES (Now with tenant_id)
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

  -- Full-text search
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
-- MEDIA FILES (Now with tenant_id)
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
  file_size_bytes BIGINT,
  s3_key VARCHAR(500) NOT NULL,
  s3_bucket VARCHAR(255) NOT NULL,
  thumbnail_s3_key VARCHAR(500),
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, s3_key)
);

CREATE INDEX idx_media_tenant ON media_files(tenant_id);
CREATE INDEX idx_media_message ON media_files(message_id);

-- ============================================
-- EXTENSIONS (Now with tenant_id)
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
-- SYNC STATUS (Now with tenant_id)
-- ============================================
CREATE TABLE sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  last_synced_message_id VARCHAR(255),
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
-- SYNC LOGS (Now with tenant_id)
-- ============================================
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(50),
  messages_synced INTEGER DEFAULT 0,
  media_synced INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_tenant ON sync_logs(tenant_id);
CREATE INDEX idx_sync_logs_started ON sync_logs(tenant_id, started_at DESC);

-- ============================================
-- AUDIT LOG (Track important actions)
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

-- Function to update conversation stats
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

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trigger_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_user_profiles_updated BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_conversations_updated BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_extensions_updated BEFORE UPDATE ON extensions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_sync_status_updated BEFORE UPDATE ON sync_status FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_app_settings_updated BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_tenant_settings_updated BEFORE UPDATE ON tenant_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_id AND role = 'super_admin' AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has access to tenant
CREATE OR REPLACE FUNCTION has_tenant_access(user_id UUID, check_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Super admins have access to all tenants
  IF is_super_admin(user_id) THEN
    RETURN TRUE;
  END IF;

  -- Check user_tenants association
  RETURN EXISTS (
    SELECT 1 FROM user_tenants ut
    JOIN user_profiles up ON up.id = ut.user_id
    WHERE ut.user_id = user_id
    AND ut.tenant_id = check_tenant_id
    AND up.is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's tenants
CREATE OR REPLACE FUNCTION get_user_tenants(user_id UUID)
RETURNS SETOF tenants AS $$
BEGIN
  -- Super admins get all tenants
  IF is_super_admin(user_id) THEN
    RETURN QUERY SELECT * FROM tenants WHERE is_active = TRUE ORDER BY name;
  END IF;

  -- Regular users get assigned tenants
  RETURN QUERY
  SELECT t.* FROM tenants t
  JOIN user_tenants ut ON ut.tenant_id = t.id
  WHERE ut.user_id = user_id AND t.is_active = TRUE
  ORDER BY t.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to prevent deletion of protected users
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

-- Function to prevent demotion of protected users
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
ALTER TABLE extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- App Settings: Super admins can do everything, others can read public settings
CREATE POLICY "Super admins can manage app settings" ON app_settings
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Users can read public app settings" ON app_settings
  FOR SELECT TO authenticated
  USING (is_public = TRUE);

-- Tenants: Super admins see all, others see their assigned tenants
CREATE POLICY "Super admins can manage all tenants" ON tenants
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Users can view assigned tenants" ON tenants
  FOR SELECT TO authenticated
  USING (has_tenant_access(auth.uid(), id));

-- User Profiles: Super admins see all, users see themselves
CREATE POLICY "Super admins can manage all users" ON user_profiles
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()));

-- User Tenants: Based on tenant access
CREATE POLICY "Super admins can manage user tenants" ON user_tenants
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Tenant admins can view tenant users" ON user_tenants
  FOR SELECT TO authenticated
  USING (has_tenant_access(auth.uid(), tenant_id));

-- Tenant Settings: Based on tenant access
CREATE POLICY "Tenant admins can manage settings" ON tenant_settings
  FOR ALL TO authenticated
  USING (has_tenant_access(auth.uid(), tenant_id))
  WITH CHECK (has_tenant_access(auth.uid(), tenant_id));

-- Data tables: Based on tenant access
CREATE POLICY "Users can view tenant conversations" ON conversations
  FOR SELECT TO authenticated
  USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can view tenant participants" ON participants
  FOR SELECT TO authenticated
  USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can view tenant messages" ON messages
  FOR SELECT TO authenticated
  USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can view tenant media" ON media_files
  FOR SELECT TO authenticated
  USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can view tenant extensions" ON extensions
  FOR SELECT TO authenticated
  USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can view tenant sync status" ON sync_status
  FOR SELECT TO authenticated
  USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can view tenant sync logs" ON sync_logs
  FOR SELECT TO authenticated
  USING (has_tenant_access(auth.uid(), tenant_id));

-- Service role can do everything (for sync service)
CREATE POLICY "Service role full access conversations" ON conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access participants" ON participants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access messages" ON messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access media_files" ON media_files FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access extensions" ON extensions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_status" ON sync_status FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_logs" ON sync_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access tenants" ON tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access user_profiles" ON user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access user_tenants" ON user_tenants FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Audit logs: Super admins see all, users see their own actions
CREATE POLICY "Super admins can view all audit logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view own audit logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

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
        's3_key', mf.s3_key,
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

-- ============================================
-- SUPER ADMIN SETUP FUNCTION
-- Can only be called once or by existing super admin
-- ============================================
CREATE OR REPLACE FUNCTION setup_super_admin(admin_email TEXT, admin_password TEXT)
RETURNS TEXT AS $$
DECLARE
  existing_super_admin_count INTEGER;
  new_user_id UUID;
BEGIN
  -- Check if super admin already exists
  SELECT COUNT(*) INTO existing_super_admin_count
  FROM user_profiles WHERE role = 'super_admin';

  IF existing_super_admin_count > 0 THEN
    -- If caller is not super admin, reject
    IF NOT is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Super admin already exists. Only existing super admin can create new ones.';
    END IF;
  END IF;

  -- Note: Actual user creation must be done via Supabase Auth API
  -- This function is for reference - you'll create the user via the dashboard or API

  RETURN 'Super admin setup instructions: Create user via Supabase Auth, then run: UPDATE user_profiles SET role = ''super_admin'', is_protected = TRUE WHERE email = ''' || admin_email || ''';';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- INITIAL SETUP NOTES
-- ============================================
-- After running this schema:
-- 1. Create a user via Supabase Auth (Dashboard > Authentication > Users > Add User)
-- 2. Run this SQL to make them super admin:
--    UPDATE user_profiles SET role = 'super_admin', is_protected = TRUE WHERE email = 'your-email@example.com';
