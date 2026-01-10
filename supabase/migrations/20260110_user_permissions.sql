-- User Extension Permissions Table
-- Controls which extensions each user can view conversations from
CREATE TABLE IF NOT EXISTS user_extension_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  extension_id UUID NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES user_profiles(id),
  UNIQUE(user_id, extension_id)
);

-- User Group Chat Permissions Table
-- Controls which group chats each user can view
CREATE TABLE IF NOT EXISTS user_group_chat_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES user_profiles(id),
  UNIQUE(user_id, conversation_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_extension_permissions_user ON user_extension_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_extension_permissions_tenant ON user_extension_permissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_extension_permissions_extension ON user_extension_permissions(extension_id);

CREATE INDEX IF NOT EXISTS idx_user_group_chat_permissions_user ON user_group_chat_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_group_chat_permissions_tenant ON user_group_chat_permissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_group_chat_permissions_conversation ON user_group_chat_permissions(conversation_id);

-- Enable RLS
ALTER TABLE user_extension_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_group_chat_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_extension_permissions
CREATE POLICY "Service role full access user_extension_permissions"
  ON user_extension_permissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can manage extension permissions"
  ON user_extension_permissions
  FOR ALL
  TO authenticated
  USING (
    -- Super admins can access all
    is_super_admin()
    OR
    -- Tenant admins can manage permissions for their tenant
    (
      tenant_id IN (
        SELECT ut.tenant_id FROM user_tenants ut
        WHERE ut.user_id = auth.uid() AND ut.role = 'admin'
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR
    (
      tenant_id IN (
        SELECT ut.tenant_id FROM user_tenants ut
        WHERE ut.user_id = auth.uid() AND ut.role = 'admin'
      )
    )
  );

CREATE POLICY "Users can view own extension permissions"
  ON user_extension_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for user_group_chat_permissions
CREATE POLICY "Service role full access user_group_chat_permissions"
  ON user_group_chat_permissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can manage group chat permissions"
  ON user_group_chat_permissions
  FOR ALL
  TO authenticated
  USING (
    -- Super admins can access all
    is_super_admin()
    OR
    -- Tenant admins can manage permissions for their tenant
    (
      tenant_id IN (
        SELECT ut.tenant_id FROM user_tenants ut
        WHERE ut.user_id = auth.uid() AND ut.role = 'admin'
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR
    (
      tenant_id IN (
        SELECT ut.tenant_id FROM user_tenants ut
        WHERE ut.user_id = auth.uid() AND ut.role = 'admin'
      )
    )
  );

CREATE POLICY "Users can view own group chat permissions"
  ON user_group_chat_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Helper function to get user's permitted extension IDs
CREATE OR REPLACE FUNCTION get_user_permitted_extensions(check_user_id UUID, check_tenant_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT extension_id
  FROM user_extension_permissions
  WHERE user_id = check_user_id
    AND tenant_id = check_tenant_id;
$$;

-- Helper function to get user's permitted group chat conversation IDs
CREATE OR REPLACE FUNCTION get_user_permitted_group_chats(check_user_id UUID, check_tenant_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT conversation_id
  FROM user_group_chat_permissions
  WHERE user_id = check_user_id
    AND tenant_id = check_tenant_id;
$$;

-- Helper function to check if user is admin or super_admin
CREATE OR REPLACE FUNCTION is_admin_or_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active = true
  );
$$;
