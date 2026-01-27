-- Add SendGrid support to smtp_settings
ALTER TABLE smtp_settings ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'smtp';
ALTER TABLE smtp_settings ADD COLUMN IF NOT EXISTS sendgrid_api_key_encrypted TEXT;

COMMENT ON COLUMN smtp_settings.provider IS 'Email provider: smtp or sendgrid';
COMMENT ON COLUMN smtp_settings.sendgrid_api_key_encrypted IS 'Encrypted SendGrid API key';

-- Make host nullable for SendGrid (not needed)
ALTER TABLE smtp_settings ALTER COLUMN host DROP NOT NULL;
