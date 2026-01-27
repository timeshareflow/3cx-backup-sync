-- Create email_categories table for per-category from addresses
CREATE TABLE IF NOT EXISTS email_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  description TEXT,
  from_email VARCHAR(255),
  from_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO email_categories (category, label, description) VALUES
  ('welcome', 'Welcome Emails', 'New user registration and invitations'),
  ('billing', 'Billing Emails', 'Invoices, payment confirmations, subscription updates'),
  ('notifications', 'Notification Emails', 'Sync alerts, storage warnings, system notifications'),
  ('security', 'Security Emails', 'Password resets, 2FA codes, login alerts')
ON CONFLICT (category) DO NOTHING;

-- Add RLS
ALTER TABLE email_categories ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage email categories
CREATE POLICY "Super admins can manage email categories"
  ON email_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- Service role has full access
CREATE POLICY "Service role has full access to email categories"
  ON email_categories FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE email_categories IS 'Per-category email from address configuration';
COMMENT ON COLUMN email_categories.category IS 'Unique category identifier (welcome, billing, notifications, security)';
COMMENT ON COLUMN email_categories.from_email IS 'Override from email for this category (null uses default)';
COMMENT ON COLUMN email_categories.from_name IS 'Override from name for this category (null uses default)';
