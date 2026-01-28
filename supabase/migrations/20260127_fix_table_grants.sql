-- Fix table grants for service_role and other roles
-- These grants are needed in addition to RLS policies for the admin client to work

-- Storage plans
GRANT ALL ON storage_plans TO anon, authenticated, service_role;

-- SMTP settings
GRANT ALL ON smtp_settings TO anon, authenticated, service_role;

-- Email categories
GRANT ALL ON email_categories TO anon, authenticated, service_role;

-- Tenants (in case it's missing)
GRANT ALL ON tenants TO anon, authenticated, service_role;

-- User profiles (in case it's missing)
GRANT ALL ON user_profiles TO anon, authenticated, service_role;

-- User tenants (in case it's missing)
GRANT ALL ON user_tenants TO anon, authenticated, service_role;

-- Conversations (in case it's missing)
GRANT ALL ON conversations TO anon, authenticated, service_role;

-- Sync agents
GRANT ALL ON sync_agents TO anon, authenticated, service_role;
