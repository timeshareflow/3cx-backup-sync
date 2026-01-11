-- Two-Factor Authentication Support

-- Add 2FA columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS totp_backup_codes_encrypted TEXT; -- JSON array of backup codes
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;

-- 2FA Authentication Logs (for security monitoring)
CREATE TABLE IF NOT EXISTS auth_2fa_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'setup', 'verify', 'disable', 'backup_used', 'failed'
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trusted Devices (optional - for "remember this device" feature)
CREATE TABLE IF NOT EXISTS trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  device_hash VARCHAR(255) NOT NULL, -- Hash of device fingerprint
  device_name VARCHAR(255),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_hash)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auth_2fa_logs_user ON auth_2fa_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_2fa_logs_created ON auth_2fa_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_hash ON trusted_devices(device_hash);

-- RLS Policies
ALTER TABLE auth_2fa_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;

-- Users can view their own 2FA logs
CREATE POLICY "Users can view their own 2FA logs" ON auth_2fa_logs
  FOR SELECT USING (user_id = auth.uid());

-- Service role can insert logs
CREATE POLICY "Service role can manage 2FA logs" ON auth_2fa_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Users can manage their own trusted devices
CREATE POLICY "Users can manage their own trusted devices" ON trusted_devices
  FOR ALL USING (user_id = auth.uid());

-- Service role can manage trusted devices
CREATE POLICY "Service role can manage trusted devices" ON trusted_devices
  FOR ALL USING (auth.role() = 'service_role');

-- Function to clean up expired trusted devices
CREATE OR REPLACE FUNCTION cleanup_expired_trusted_devices()
RETURNS void AS $$
BEGIN
  DELETE FROM trusted_devices
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
