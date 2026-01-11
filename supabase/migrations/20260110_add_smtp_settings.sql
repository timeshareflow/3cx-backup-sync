-- SMTP Settings Table (Global settings managed by super admin)
CREATE TABLE IF NOT EXISTS smtp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  username VARCHAR(255),
  password_encrypted TEXT, -- Encrypted SMTP password
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255) DEFAULT '3CX BackupWiz',
  encryption VARCHAR(20) DEFAULT 'tls' CHECK (encryption IN ('none', 'ssl', 'tls')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification Templates Table
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  variables JSONB DEFAULT '[]', -- List of available variables like {{user_name}}, {{tenant_name}}
  notification_type VARCHAR(50) NOT NULL, -- 'storage_warning', 'payment_failed', 'sync_error', etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification Log Table
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  notification_type VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Notification Preferences
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, notification_type)
);

-- Wiretap SMS Integration Settings (Global)
CREATE TABLE IF NOT EXISTS sms_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) DEFAULT 'wiretap',
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  from_number VARCHAR(20),
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Push Notification Settings (For Capacitor mobile app)
CREATE TABLE IF NOT EXISTS push_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) DEFAULT 'firebase', -- 'firebase' or 'apns'
  firebase_project_id VARCHAR(255),
  firebase_private_key_encrypted TEXT,
  firebase_client_email VARCHAR(255),
  apns_key_id VARCHAR(20),
  apns_team_id VARCHAR(20),
  apns_private_key_encrypted TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Push Tokens (For mobile devices)
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

-- Insert default notification templates
INSERT INTO notification_templates (name, subject, body_html, body_text, variables, notification_type) VALUES
('storage_warning',
 'Storage Alert: {{storage_percentage}}% Used',
 '<h2>Storage Warning</h2><p>Hi {{user_name}},</p><p>Your 3CX BackupWiz storage is at <strong>{{storage_percentage}}%</strong> of your {{plan_name}} plan limit ({{storage_used}} of {{storage_limit}}).</p><p>Consider upgrading your plan to avoid data sync interruptions.</p><p><a href="{{upgrade_url}}">Upgrade Now</a></p>',
 'Hi {{user_name}}, Your 3CX BackupWiz storage is at {{storage_percentage}}% of your {{plan_name}} plan limit. Consider upgrading your plan.',
 '["user_name", "storage_percentage", "plan_name", "storage_used", "storage_limit", "upgrade_url"]',
 'storage_warning'),

('payment_failed',
 'Payment Failed - Action Required',
 '<h2>Payment Failed</h2><p>Hi {{user_name}},</p><p>We were unable to process your payment for {{plan_name}}.</p><p>Please update your payment method to continue using 3CX BackupWiz.</p><p><a href="{{billing_url}}">Update Payment Method</a></p>',
 'Hi {{user_name}}, We were unable to process your payment for {{plan_name}}. Please update your payment method.',
 '["user_name", "plan_name", "billing_url"]',
 'payment_failed'),

('sync_error',
 'Sync Error Alert',
 '<h2>Sync Error Detected</h2><p>Hi {{user_name}},</p><p>We detected a sync error for {{tenant_name}}:</p><p><strong>{{error_message}}</strong></p><p>Please check your 3CX connection settings.</p>',
 'Hi {{user_name}}, We detected a sync error for {{tenant_name}}: {{error_message}}',
 '["user_name", "tenant_name", "error_message"]',
 'sync_error'),

('welcome',
 'Welcome to 3CX BackupWiz',
 '<h2>Welcome to 3CX BackupWiz!</h2><p>Hi {{user_name}},</p><p>Your account has been created successfully. You can now start archiving your 3CX communications.</p><p><a href="{{login_url}}">Get Started</a></p>',
 'Hi {{user_name}}, Welcome to 3CX BackupWiz! Your account has been created successfully.',
 '["user_name", "login_url"]',
 'welcome'),

('password_reset',
 'Password Reset Request',
 '<h2>Password Reset</h2><p>Hi {{user_name}},</p><p>You requested a password reset for your 3CX BackupWiz account.</p><p><a href="{{reset_url}}">Reset Password</a></p><p>If you did not request this, please ignore this email.</p>',
 'Hi {{user_name}}, You requested a password reset. Visit: {{reset_url}}',
 '["user_name", "reset_url"]',
 'password_reset'),

('subscription_renewed',
 'Subscription Renewed Successfully',
 '<h2>Subscription Renewed</h2><p>Hi {{user_name}},</p><p>Your {{plan_name}} subscription has been renewed successfully.</p><p>Next billing date: {{next_billing_date}}</p><p>Amount: {{amount}}</p>',
 'Hi {{user_name}}, Your {{plan_name}} subscription has been renewed. Next billing: {{next_billing_date}}',
 '["user_name", "plan_name", "next_billing_date", "amount"]',
 'subscription_renewed')
ON CONFLICT (name) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_logs_tenant ON notification_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_prefs_user ON user_notification_preferences(user_id);

-- RLS Policies
ALTER TABLE smtp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;

-- SMTP settings - super admin only
CREATE POLICY "Super admins can manage SMTP settings" ON smtp_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Notification templates - super admin only
CREATE POLICY "Super admins can manage notification templates" ON notification_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Notification logs - admins can view their tenant's logs
CREATE POLICY "Admins can view tenant notification logs" ON notification_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND (up.role IN ('super_admin', 'admin'))
      AND (up.role = 'super_admin' OR up.tenant_id = notification_logs.tenant_id)
    )
  );

-- User notification preferences - users can manage their own
CREATE POLICY "Users can manage their own notification preferences" ON user_notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- SMS settings - super admin only
CREATE POLICY "Super admins can manage SMS settings" ON sms_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Push settings - super admin only
CREATE POLICY "Super admins can manage push settings" ON push_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- User push tokens - users can manage their own
CREATE POLICY "Users can manage their own push tokens" ON user_push_tokens
  FOR ALL USING (user_id = auth.uid());

-- Service role access for all tables
CREATE POLICY "Service role has full access to smtp_settings" ON smtp_settings
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to notification_templates" ON notification_templates
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to notification_logs" ON notification_logs
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to sms_settings" ON sms_settings
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to push_settings" ON push_settings
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to user_push_tokens" ON user_push_tokens
  FOR ALL USING (auth.role() = 'service_role');
