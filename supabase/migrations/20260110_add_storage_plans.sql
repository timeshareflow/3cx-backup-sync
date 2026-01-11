-- Storage Plans System
-- Allows super admin to define storage plans that tenants can subscribe to

-- Storage Plans Table
CREATE TABLE IF NOT EXISTS storage_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  storage_limit_gb INTEGER NOT NULL, -- Storage limit in GB (0 = unlimited)
  price_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'USD',
  features JSONB DEFAULT '[]'::jsonb, -- Array of feature strings
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Default plan for new tenants
  sort_order INTEGER DEFAULT 0,
  stripe_price_id_monthly VARCHAR(255), -- Stripe price ID for monthly billing
  stripe_price_id_yearly VARCHAR(255), -- Stripe price ID for yearly billing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add storage plan reference to tenants
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS storage_plan_id UUID REFERENCES storage_plans(id),
ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS storage_last_calculated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_status VARCHAR(50) DEFAULT 'active', -- active, past_due, canceled, trial
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly'; -- monthly, yearly

-- Indexes
CREATE INDEX IF NOT EXISTS idx_storage_plans_active ON storage_plans(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_tenants_storage_plan ON tenants(storage_plan_id);
CREATE INDEX IF NOT EXISTS idx_tenants_billing_status ON tenants(billing_status);

-- Insert default storage plans
INSERT INTO storage_plans (name, description, storage_limit_gb, price_monthly, price_yearly, features, is_active, is_default, sort_order)
VALUES
  ('Free', 'Basic plan for small teams', 5, 0, 0, '["5 GB Storage", "Up to 3 users", "30 day message retention", "Email support"]'::jsonb, true, true, 1),
  ('Starter', 'For growing teams', 25, 29.99, 299.90, '["25 GB Storage", "Up to 10 users", "1 year message retention", "Priority email support", "API access"]'::jsonb, true, false, 2),
  ('Professional', 'For established businesses', 100, 79.99, 799.90, '["100 GB Storage", "Unlimited users", "Unlimited retention", "Priority support", "API access", "Custom integrations"]'::jsonb, true, false, 3),
  ('Enterprise', 'For large organizations', 0, 199.99, 1999.90, '["Unlimited Storage", "Unlimited users", "Unlimited retention", "Dedicated support", "API access", "Custom integrations", "SLA guarantee", "On-premise option"]'::jsonb, true, false, 4)
ON CONFLICT DO NOTHING;

-- RLS Policies
ALTER TABLE storage_plans ENABLE ROW LEVEL SECURITY;

-- Everyone can view active storage plans
CREATE POLICY "Anyone can view active storage plans"
ON storage_plans
FOR SELECT
TO authenticated
USING (is_active = true);

-- Only super admins can manage storage plans
CREATE POLICY "Super admins can manage storage plans"
ON storage_plans
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.auth_user_id = auth.uid()
    AND up.role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.auth_user_id = auth.uid()
    AND up.role = 'super_admin'
  )
);

-- Service role has full access
CREATE POLICY "Service role has full access to storage plans"
ON storage_plans
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Function to calculate tenant storage usage
CREATE OR REPLACE FUNCTION calculate_tenant_storage(p_tenant_id UUID)
RETURNS BIGINT AS $$
DECLARE
  total_bytes BIGINT := 0;
  media_bytes BIGINT;
  recording_bytes BIGINT;
  voicemail_bytes BIGINT;
  fax_bytes BIGINT;
  meeting_bytes BIGINT;
BEGIN
  -- Media files
  SELECT COALESCE(SUM(file_size), 0) INTO media_bytes
  FROM media_files WHERE tenant_id = p_tenant_id;

  -- Call recordings
  SELECT COALESCE(SUM(file_size), 0) INTO recording_bytes
  FROM call_recordings WHERE tenant_id = p_tenant_id;

  -- Voicemails
  SELECT COALESCE(SUM(file_size), 0) INTO voicemail_bytes
  FROM voicemails WHERE tenant_id = p_tenant_id;

  -- Faxes
  SELECT COALESCE(SUM(file_size), 0) INTO fax_bytes
  FROM faxes WHERE tenant_id = p_tenant_id;

  -- Meeting recordings
  SELECT COALESCE(SUM(file_size), 0) INTO meeting_bytes
  FROM meeting_recordings WHERE tenant_id = p_tenant_id;

  total_bytes := media_bytes + recording_bytes + voicemail_bytes + fax_bytes + meeting_bytes;

  -- Update tenant record
  UPDATE tenants
  SET storage_used_bytes = total_bytes,
      storage_last_calculated_at = NOW()
  WHERE id = p_tenant_id;

  RETURN total_bytes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if tenant is over storage limit
CREATE OR REPLACE FUNCTION is_tenant_over_limit(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  used_bytes BIGINT;
  limit_bytes BIGINT;
BEGIN
  SELECT t.storage_used_bytes, COALESCE(sp.storage_limit_gb, 0) * 1024 * 1024 * 1024
  INTO used_bytes, limit_bytes
  FROM tenants t
  LEFT JOIN storage_plans sp ON t.storage_plan_id = sp.id
  WHERE t.id = p_tenant_id;

  -- 0 means unlimited
  IF limit_bytes = 0 THEN
    RETURN false;
  END IF;

  RETURN used_bytes >= limit_bytes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get tenant storage percentage used
CREATE OR REPLACE FUNCTION get_storage_percentage(p_tenant_id UUID)
RETURNS INTEGER AS $$
DECLARE
  used_bytes BIGINT;
  limit_bytes BIGINT;
  percentage INTEGER;
BEGIN
  SELECT t.storage_used_bytes, COALESCE(sp.storage_limit_gb, 0) * 1024 * 1024 * 1024
  INTO used_bytes, limit_bytes
  FROM tenants t
  LEFT JOIN storage_plans sp ON t.storage_plan_id = sp.id
  WHERE t.id = p_tenant_id;

  -- 0 means unlimited, return 0%
  IF limit_bytes = 0 THEN
    RETURN 0;
  END IF;

  percentage := ROUND((used_bytes::DECIMAL / limit_bytes::DECIMAL) * 100);
  RETURN LEAST(percentage, 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
